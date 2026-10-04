import { test, expect } from '@playwright/test';
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
    name: 'API Necklace',
    arType: 'NECKLACE',
    price: 30,
    stockQuantity: 1,
    categoryId: 46,
    imageUrl: '/assets/overlay-necklace.svg',
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
    [3, 'Necklace Virtual Try-On'],
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create product' })).toBeEnabled();
  expect(payload).toMatchObject({
    name: 'Real necklace',
    price: 100,
    stockQuantity: 4,
    sellerId: 77,
    categoryId: 46,
    arType: 'NECKLACE',
    imageUrl: '',
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
