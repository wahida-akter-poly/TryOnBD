import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const products = [
  {
    id: 1,
    name: 'API Shirt',
    arType: 'SHIRT',
    price: 12,
    stockQuantity: 5,
    categoryId: 44,
    imageUrl: null,
  },
  {
    id: 2,
    name: 'API Frames',
    arType: 'EYEWEAR',
    price: 24,
    stockQuantity: 3,
    categoryId: 45,
    imageUrl: '/missing.png',
  },
  {
    id: 3,
    name: 'Classic Aviator',
    arType: 'EYEWEAR',
    price: 30,
    stockQuantity: 1,
    categoryId: 45,
    imageUrl: '/assets/face-ar/sunglasses/aviator-real.png',
  },
  {
    id: 78,
    name: 'API Necklace',
    arType: 'NECKLACE',
    price: 30,
    stockQuantity: 2,
    categoryId: 46,
    imageUrl: '/assets/jewelry/necklaces/silver-diamond-necklace.png',
  },
];
async function setup(page, list = products) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/products') return route.fulfill({ json: list });
    if (url.pathname === '/api/categories')
      return route.fulfill({
        json: [
          { id: 44, categoryName: 'Clothing' },
          { id: 45, categoryName: 'Eyewear' },
          { id: 46, categoryName: 'Jewelry' },
        ],
      });
    const id = Number(url.pathname.split('/').at(-1));
    if (url.pathname.startsWith('/api/products/') && list.find((p) => p.id === id))
      return route.fulfill({ json: list.find((p) => p.id === id) });
    return route.fulfill({ status: 401, json: { message: 'Sign in required' } });
  });
}
test('catalog and categories use APIs; broken and missing images stay neutral', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/missing.png', (route) =>
    route.fulfill({ status: 404, body: 'Image not found' }),
  );
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'API Shirt' })).toBeVisible();
  await expect(page.getByLabel('Category').getByRole('option', { name: 'Jewelry' })).toBeAttached();
  await expect(page.getByText('No product image uploaded')).toHaveCount(2);
  await page.getByLabel('Category').selectOption('46');
  await expect(page.getByRole('heading', { name: 'API Necklace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'API Shirt' })).toHaveCount(0);
});
test('empty catalog never shows seeded products', async ({ page }) => {
  await setup(page, []);
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'No products here yet' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
});
test('backend failures show retry without fallback', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/products');
  await expect(
    page.getByText('The backend is unavailable. Please try again shortly.'),
  ).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
});
test('guest cart and role routes require real login', async ({ page }) => {
  await setup(page);
  await page.goto('/checkout');
  await expect(page.getByRole('link', { name: 'Sign in to view your cart' })).toBeVisible();
  await page.goto('/dashboard/admin');
  await expect(page).toHaveURL(/\/login$/);
});
test('AR uses real product types with no initial person or preview alias', async ({ page }) => {
  await setup(page);
  for (const [id, heading] of [
    [2, 'Find your frame.'],
    [3, 'Find your frame.'],
    [78, 'Necklace Virtual Try-On'],
  ]) {
    await page.goto(`/try-on?productId=${id}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(
      page.getByText('Start your camera or upload a clear, front-facing photo.'),
    ).toBeVisible();
  }
  await page.goto('/try-on?productId=necklace-preview');
  await expect(page.getByText('Choose a valid product from the collection.')).toBeVisible();
});
test('shirt routes to torso studio by arType', async ({ page }) => {
  const list = products.map((p) =>
    p.id === 1 ? { ...p, imageUrl: '/assets/body-ar/shirts/tshirt-black-front.png' } : p,
  );
  await setup(page, list);
  await page.goto('/try-on?productId=1');
  await expect(page.getByRole('heading', { name: 'Try your T-shirt.' })).toBeVisible();
  await expect(
    page.getByText('Start your camera or upload a clear, front-facing photo.'),
  ).toBeVisible();
});
test('JWT attaches to account requests and expired token clears session', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('tryonbd:token', 'expired-token'));
  let auth;
  await page.route('**/api/account/me', (route) => {
    auth = route.request().headers().authorization;
    return route.fulfill({ status: 401, json: { message: 'Expired' } });
  });
  await page.goto('/dashboard/customer');
  await expect(page).toHaveURL(/\/login$/);
  expect(auth).toBe('Bearer expired-token');
  expect(await page.evaluate(() => localStorage.getItem('tryonbd:token'))).toBeNull();
});

test('authenticated customer cart restores server data and places an API order', async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('tryonbd:token', 'test-token'));
  let cart = { 1: 2 },
    orders = [],
    placed = false;
  await page.route('**/api/account/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me'))
      return route.fulfill({
        json: { id: 55, fullName: 'API Customer', role: 'CUSTOMER', email: 'real@test.example' },
      });
    if (path.endsWith('/cart')) return route.fulfill({ json: cart });
    if (path.endsWith('/checkout')) {
      placed = true;
      cart = {};
      orders = [
        {
          id: 101,
          userId: 55,
          totalAmount: 24,
          orderStatus: 'PENDING',
          createdAt: '2026-10-04T12:00:00',
          items: [{ productId: 1, name: 'API Shirt', quantity: 2, price: 12 }],
        },
      ];
      return route.fulfill({ json: orders[0] });
    }
    return route.fulfill({ status: 404 });
  });
  await page.route('**/api/orders', (route) => route.fulfill({ json: orders }));
  await page.route('**/api/try-on-sessions', (route) => route.fulfill({ json: [] }));
  await page.goto('/checkout');
  await expect(page.getByRole('spinbutton')).toHaveValue('2');
  await page.reload();
  await expect(page.getByRole('spinbutton')).toHaveValue('2');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('heading', { name: 'Order #101' })).toBeVisible();
  expect(placed).toBe(true);
  await page.goto('/dashboard/admin');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
});
test('seller management fetches own products and writes controlled AR metadata', async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('tryonbd:token', 'seller-token'));
  let payload;
  await page.route('**/api/account/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith('/me')
        ? { id: 56, fullName: 'API Seller', role: 'SELLER' }
        : path.endsWith('/seller')
          ? { id: 77, userId: 56, businessName: 'API Store' }
          : path.endsWith('/products')
            ? []
            : {},
    });
  });
  await page.route('**/api/orders', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/try-on-sessions', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/products', (route) => {
    if (route.request().method() === 'POST') {
      payload = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { id: 10, ...payload } });
    }
    return route.fulfill({ json: products });
  });
  await page.goto('/dashboard/seller/products');
  await page.getByRole('button', { name: 'Create product' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Real necklace');
  await page.getByLabel('Price', { exact: true }).fill('100');
  await page.getByLabel('Stock', { exact: true }).fill('4');
  await page.getByLabel('Category', { exact: true }).selectOption('46');
  await page.getByLabel('AR type').selectOption('NECKLACE');
  await page
    .getByLabel('Image URL or local asset path')
    .fill('/assets/jewelry/necklaces/silver-diamond-necklace.png');
  await page.getByLabel('Description', { exact: true }).fill('Seller supplied necklace details');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create product' })).toBeEnabled();
  expect(payload).toMatchObject({
    name: 'Real necklace',
    price: 100,
    stockQuantity: 4,
    sellerId: 77,
    categoryId: 46,
    arType: 'NECKLACE',
    imageUrl: '/assets/jewelry/necklaces/silver-diamond-necklace.png',
    description: 'Seller supplied necklace details',
  });
});

test('removed cart products never display invented zero totals and can be removed', async ({
  page,
}) => {
  await setup(page, []);
  await page.addInitScript(() => localStorage.setItem('tryonbd:token', 'test-token'));
  let cart = { 999: 2 };
  await page.route('**/api/account/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me'))
      return route.fulfill({ json: { id: 55, fullName: 'API Customer', role: 'CUSTOMER' } });
    if (path.endsWith('/cart/999')) {
      expect(route.request().postDataJSON()).toEqual({ quantity: 0 });
      cart = {};
      return route.fulfill({ json: cart });
    }
    return route.fulfill({ json: cart });
  });
  await page.route('**/api/orders', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/try-on-sessions', (route) => route.fulfill({ json: [] }));
  await page.goto('/checkout');
  await expect(
    page.getByText(
      'Pricing is unavailable for removed products. Remove these items before placing an order.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place order' })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
});

test('Jewelry is empty without matching backend products', async ({ page }) => {
  await setup(
    page,
    products.filter((p) => p.arType !== 'NECKLACE'),
  );
  await page.goto('/products?group=Jewelry');
  await expect(page.getByRole('heading', { name: 'Jewelry', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No products here yet' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
});

test('four necklaces use product metadata styles and selected backend image URLs', async ({
  page,
}) => {
  const base = products.find((p) => p.id === 78);
  const necklaces = [
    { ...base, expectedStyle: 'SHORT' },
    {
      ...base,
      id: 91,
      name: 'Pearl Choker',
      imageUrl: `${base.imageUrl}?variant=choker`,
      expectedStyle: 'CHOKER',
    },
    {
      ...base,
      id: 92,
      name: 'Short Necklace',
      imageUrl: `${base.imageUrl}?variant=short`,
      expectedStyle: 'SHORT',
    },
    {
      ...base,
      id: 93,
      name: 'Pendant Necklace',
      imageUrl: `${base.imageUrl}?variant=pendant`,
      expectedStyle: 'PENDANT',
    },
  ];
  // API fixtures reuse the existing real PNG; no new images or database rows.
  await setup(page, [...products.filter((p) => p.arType !== 'NECKLACE'), ...necklaces]);
  await page.goto('/products?group=Jewelry');
  await expect(page.locator('.product-card')).toHaveCount(4);
  await expect(page.locator('a[href*="necklace-preview"]')).toHaveCount(0);
  for (const product of necklaces) {
    await page.goto(`/products/${product.id}`);
    await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: product.name, exact: true })).toHaveAttribute(
      'src',
      product.imageUrl,
    );
    await page.getByRole('link', { name: 'Try Virtually', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`productId=${product.id}$`));
    await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
      'data-overlay-src',
      product.imageUrl,
    );
    await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
      'data-necklace-style',
      product.expectedStyle,
    );
    await expect(
      page.getByText('Start your camera or upload a clear, front-facing photo.'),
    ).toBeVisible();
    await expect(page.locator('video')).toHaveJSProperty('srcObject', null);
  }
});

test('unavailable necklace asset shows an error without a fallback overlay', async ({ page }) => {
  await setup(page, [{ ...products.find((p) => p.id === 78), imageUrl: '/missing-necklace.png' }]);
  await page.route('**/missing-necklace.png', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/try-on?productId=78');
  await expect(page.getByText('Necklace asset could not be loaded.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toHaveCount(0);
});

test('invalid product detail IDs never request the numeric product API', async ({ page }) => {
  await setup(page);
  const detailRequests = [];
  page.on('request', (request) => {
    if (/\/api\/products\//.test(request.url())) detailRequests.push(request.url());
  });
  await page.goto('/products/necklace-preview');
  await expect(page.getByText('Choose a valid product from the collection.')).toBeVisible();
  expect(detailRequests).toEqual([]);
});

test('necklace photo uses MediaPipe, exports the real asset and saves product metadata', async ({
  page,
}) => {
  const modelRequests = [];
  page.context().on('request', (request) => {
    if (/landmarker(?:_lite)?\.task(?:\?|$)/.test(request.url())) modelRequests.push(request.url());
  });
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('tryonbd:token', 'photo-test-token'));
  let savedSession;
  await page.route('**/api/account/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith('/me') ? { id: 55, fullName: 'Photo Customer', role: 'CUSTOMER' } : {},
    });
  });
  await page.route('**/api/orders', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/try-on-sessions', (route) => {
    if (route.request().method() === 'POST') {
      savedSession = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { id: 501, userId: 55, ...savedSession } });
    }
    return route.fulfill({ json: savedSession ? [{ id: 501, userId: 55, ...savedSession }] : [] });
  });
  await page.goto('/try-on?productId=78');
  await expect(page.getByRole('heading', { name: 'Necklace Virtual Try-On' })).toBeVisible();
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('tests/fixtures/shirt-hands-on-hips.jpg');
  await expect(page.getByText('Pose detected', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
    'data-neck-anchor',
    'pose-head',
  );
  expect(modelRequests.some((url) => url.includes('pose_landmarker_lite.task'))).toBe(true);
  expect(modelRequests.some((url) => url.includes('face_landmarker.task'))).toBe(false);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('tryonbd-necklace-result.png');
  await page.getByRole('button', { name: 'Save Try-On', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try-On saved', exact: true })).toBeDisabled();
  expect(savedSession).toMatchObject({ productId: 78, tryOnType: 'NECKLACE' });
  expect(savedSession.inputImageUrl).toMatch(/^urn:tryonbd:capture:upload:[1-9]\d*x[1-9]\d*$/);
  expect(savedSession.userId).toBeUndefined();
});

test('necklace camera starts only on request and handles permission denial', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        window.cameraRequests++;
        throw new DOMException('Denied for test', 'NotAllowedError');
      },
    });
  });
  await page.goto('/try-on?productId=78');
  await expect(page.getByRole('heading', { name: 'Necklace Virtual Try-On' })).toBeVisible();
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
  await expect(
    page.getByText(
      'Camera permission denied. Allow access in your browser settings or upload a photo.',
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => window.cameraRequests)).toBe(1);
  await expect(page.getByLabel('Upload photo', { exact: true })).toBeAttached();
});

test('necklace simulated camera captures the fitted asset and releases its stream', async ({
  page,
}) => {
  await setup(page);
  const photo = await readFile('tests/fixtures/shirt-hands-on-hips.jpg');
  await page.route('**/__test-camera-source.jpg', (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: photo }),
  );
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        window.cameraRequests++;
        const image = new Image();
        image.src = '/__test-camera-source.jpg';
        await image.decode();
        const canvas = Object.assign(document.createElement('canvas'), {
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        setInterval(() => context.drawImage(image, 0, 0), 40);
        const stream = canvas.captureStream(24);
        window.testCameraTrack = stream.getVideoTracks()[0];
        return stream;
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => [],
    });
  });
  await page.goto('/try-on?productId=78');
  await expect(page.getByRole('heading', { name: 'Necklace Virtual Try-On' })).toBeVisible();
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
  await expect(page.getByText('Pose detected', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
    'data-neck-anchor',
    'pose-head',
  );
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByText('Captured', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testCameraTrack.readyState)).toBe('ended');
  await expect(page.locator('video')).toHaveJSProperty('srcObject', null);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('tryonbd-necklace-result.png');
});
