import { test, expect } from '@playwright/test';
import { dashboardConfig } from '../../src/data/dashboardConfig.js';

async function mockApi(page, status = 200) {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        status === 200
          ? { milestone: 'controller-validation-only' }
          : { message: 'Request validation failed' },
      ),
    }),
  );
}
async function stableImages(page) {
  await page.route('https://images.unsplash.com/**', (route) => route.abort());
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
}
const load = async (page) =>
  JSON.parse(await page.evaluate(() => localStorage.getItem('tryonbd:demo:v1'))).data;
test.beforeEach(async ({ page }) => {
  await stableImages(page);
});

test('all public and dashboard routes render without runtime exceptions', async ({ page }) => {
  // This sweep opens every dashboard route; allow for cold Vite compilation.
  test.setTimeout(180000);
  await mockApi(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const routes = [
    '/',
    '/products',
    '/products/1',
    '/products/missing',
    '/categories',
    '/search?q=shirt',
    '/try-on',
    '/about',
    '/login',
    '/register',
    '/seller-register',
    '/forgot-password',
    '/reset-password',
    '/api-playground',
    '/checkout',
    '/invoice/DEMO-1001',
    '/not-a-page',
    ...Object.entries(dashboardConfig).flatMap(([role, config]) =>
      config.sections.map(
        ([section]) => `/dashboard/${role}${section === 'overview' ? '' : `/${section}`}`,
      ),
    ),
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('.loading-state')).toHaveCount(0);
    await expect(page.getByText('This view couldn’t load.')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
      route,
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test('mobile layouts and navigation stay within the viewport', async ({ page }) => {
  test.setTimeout(120000);
  await mockApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of [
    '/',
    '/products',
    '/products/1',
    '/categories',
    '/try-on',
    '/api-playground',
    '/dashboard/customer',
    '/dashboard/admin/products',
    '/dashboard/super-admin/permissions',
    '/register',
  ]) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('.loading-state')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
      route,
    ).toBeTruthy();
  }
  await page.goto('/products');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('button', { name: `Show ${(await load(page)).products.length} pieces` })
    .click();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /Virtual try-on/ })
    .click();
  await expect(page).toHaveURL(/try-on/);
  await page.goto('/dashboard/customer');
  await page.getByRole('button', { name: 'Open dashboard navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'My orders' }).click();
  await expect(page).toHaveURL(/customer\/orders/);
});

test('search, category hierarchy, sorting and local wishlist work', async ({ page }) => {
  await mockApi(page);
  await page.goto('/products?category=6');
  await expect(page.locator('.product-card')).toHaveCount(5);
  await page.getByLabel('Sort by').selectOption('price-asc');
  await expect(page.locator('.product-card h3').first()).toHaveText('Lumière Earrings');
  await page.getByLabel('Search', { exact: true }).fill('Pearl');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: /Add Noorani Pearl Earrings to wishlist/ }).click();
  await page.reload();
  expect((await load(page)).wishlist).toContain(10);
});

test('checkout sends exact DTO, keeps invoice lines local, and clears cart only on success', async ({
  page,
}) => {
  await mockApi(page);
  const bodies = [];
  await page.route('**/api/orders', (route) => {
    if (route.request().method() === 'POST') bodies.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: route.request().postData() || '{}',
    });
  });
  await page.goto('/products/1');
  await page.getByRole('button', { name: 'Add to bag' }).click();
  await page.getByRole('link', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Promo code').fill('STYLE10');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByLabel('I understand that this is a local demonstration order.').check();
  await page.getByRole('button', { name: /Place demo order/ }).click();
  await expect(page).toHaveURL(/\/invoice\/LOCAL-/);
  expect(bodies).toEqual([{ userId: 1, totalAmount: 2241, orderStatus: 'PENDING' }]);
  const state = await load(page);
  expect(state.cart).toEqual([]);
  expect(state.orders.at(-1).items[0].name).toBe('Dhaka Loom Panjabi');
  expect(state.orders.at(-1).sync).toBe('Controller validated');
  await expect(page.getByText('LOCAL DEMO INVOICE', { exact: true })).toBeVisible();
});

test('HTTP 400 never creates a local record, even with offline fallback enabled', async ({
  page,
}) => {
  await mockApi(page, 400);
  await page.goto('/dashboard/seller/add-product');
  await page.getByLabel('Local Demo Fallback').first().check();
  const before = (await load(page)).products.length;
  await page.getByLabel('Category', { exact: true }).selectOption('4');
  await page.getByLabel('Product name', { exact: true }).fill('Rejected Product');
  await page.getByLabel('Price (BDT)').fill('2200');
  await page.getByLabel('Product image URL').fill('https://example.com/product.jpg');
  await page.getByRole('button', { name: 'Create demo record' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('HTTP 400');
  expect((await load(page)).products.length).toBe(before);
});

test('offline fallback requires opt-in and creates explicitly unsynced records', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.goto('/dashboard/customer/write-review');
  const before = (await load(page)).reviews.length;
  await page.getByLabel('Your review').fill('An offline demonstration review');
  await page.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Backend Offline');
  expect((await load(page)).reviews.length).toBe(before);
  await page.getByLabel('Local Demo Fallback').first().check();
  await page.getByRole('button', { name: 'Submit review' }).click();
  await expect(page).toHaveURL(/customer\/reviews/);
  const state = await load(page);
  expect(state.reviews.length).toBe(before + 1);
  expect(state.reviews.at(-1).sync).toBe('Local / Unsynced');
});

test('product and profile edits use only supported fields', async ({ page }) => {
  await mockApi(page);
  const calls = [];
  await page.route('**/api/*/*', (route) => {
    calls.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/dashboard/customer/profile');
  await page.getByLabel('Full name').fill('Ayesha Demo');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/HTTP 2xx/)).toBeVisible();
  expect(Object.keys(calls[0].body).sort()).toEqual(['address', 'email', 'fullName', 'phone']);
  await page.goto('/dashboard/admin/products');
  await page.getByRole('button', { name: 'Edit Dhaka Loom Panjabi', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Frontend-only try-on configuration', { exact: false })
    .selectOption('JEWELRY');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(Object.keys(calls.at(-1).body).sort()).toEqual([
    'categoryId',
    'imageUrl',
    'name',
    'price',
    'stockQuantity',
  ]);
});

test('camera permission denial is actionable and upload remains usable', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        throw new DOMException('Denied', 'NotAllowedError');
      },
    });
  });
  await page.goto('/try-on?arDebug=1');
  await page.getByRole('button', { name: 'Start AR Camera' }).click();
  await expect(page.getByRole('alert')).toContainText('Camera permission denied');
  await page.getByRole('tab', { name: 'Upload Photo', exact: true }).click();
  await page.getByLabel('Upload photo').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('canvas')).toBeVisible();
});

test('necklace products open the necklace virtual try-on studio', async ({ page }) => {
  await mockApi(page);
  await page.goto('/try-on?productId=necklace-preview');
  await expect(page.getByRole('heading', { name: 'Necklace Virtual Try-On' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Camera' })).toBeVisible();
  await expect(page.getByLabel('Upload photo')).toBeAttached();
});

test('API Playground shows actual 200, 400 and offline results and all 35 routes', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/api-playground');
  let count = 0;
  for (const resource of [
    'User',
    'Seller',
    'Product',
    'Category',
    'Try-On Session',
    'Review',
    'Order',
  ]) {
    await page
      .locator('.api-sidebar')
      .getByRole('button', { name: new RegExp(`^${resource}\\s*5$`) })
      .click();
    count += await page.locator('.endpoint-list>button').count();
  }
  expect(count).toBe(35);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('200 OK', { exact: true })).toBeVisible();
  await mockApi(page, 400);
  await page.getByRole('button', { name: 'Invalid example' }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('400 Bad Request', { exact: true })).toBeVisible();
  await page.route('**/api/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.locator('.response-panel')).toContainText('Backend Offline');
});

test('real configured proxy reports backend availability honestly', async ({ page }) => {
  await page.goto('/api-playground');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.locator('.response-panel .badge')).toHaveText(/200 OK|Backend Offline/);
});

test('registration and seller onboarding use exact DTOs without storing passwords', async ({
  page,
}) => {
  await mockApi(page);
  const calls = [];
  await page.route('**/api/users', (route) => {
    if (route.request().method() === 'POST') calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/sellers', (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/register');
  await page.getByLabel('Full name').fill('New Demo Customer');
  await page.getByLabel('Email address').fill('new@example.com');
  await page.getByLabel('Phone number').fill('01700000123');
  await page.getByLabel('Address', { exact: true }).fill('Dhaka');
  await page.getByLabel('Password', { exact: true }).fill('PrivateDemo123');
  await page.getByLabel('Confirm password').fill('PrivateDemo123');
  await page.getByRole('button', { name: 'Create demo account', exact: true }).click();
  await expect(page).toHaveURL(/dashboard\/customer$/);
  expect(Object.keys(calls[0]).sort()).toEqual([
    'address',
    'email',
    'fullName',
    'password',
    'phone',
  ]);
  expect(await page.evaluate(() => localStorage.getItem('tryonbd:demo:v1'))).not.toContain(
    'PrivateDemo123',
  );
  const newUser = (await load(page)).users.at(-1);
  await page.goto('/seller-register');
  await page.getByLabel('Business name').fill('New Demo Atelier');
  await page.getByLabel('Business email').fill('atelier@example.com');
  await page.getByLabel('Phone number').fill('01800000123');
  await page.getByRole('button', { name: 'Create demo seller', exact: true }).click();
  await expect(page).toHaveURL(/dashboard\/seller$/);
  expect(Object.keys(calls[1]).sort()).toEqual([
    'businessName',
    'contactEmail',
    'phone',
    'subscriptionStatus',
    'userId',
  ]);
  expect((await load(page)).sellers.at(-1).userId).toBe(newUser.id);
  await page.getByRole('link', { name: 'Business profile', exact: true }).click();
  await expect(page.getByLabel('Business name')).toHaveValue('New Demo Atelier');
});

test('category creation, order status update, and review deletion use the real route contracts', async ({
  page,
}) => {
  await mockApi(page);
  const requests = [];
  await page.route('**/api/**', (route) => {
    requests.push({
      method: route.request().method(),
      path: new URL(route.request().url()).pathname,
      data: route.request().postDataJSON(),
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/dashboard/admin/categories');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Category name', { exact: true }).fill('Accessories');
  await page.getByLabel('Description', { exact: true }).fill('Demo root category');
  await page.getByRole('button', { name: 'Create demo record' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(requests.find((r) => r.method === 'POST').data).toEqual({
    categoryName: 'Accessories',
    description: 'Demo root category',
    parentCategoryId: null,
  });
  await page.goto('/dashboard/admin/orders');
  await page.getByRole('button', { name: 'Edit DEMO-1003', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Order status', { exact: true })
    .selectOption('CONFIRMED');
  await page.getByRole('button', { name: 'Update demo order status' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(requests.find((r) => r.method === 'PUT')).toMatchObject({
    path: '/api/orders/3/status',
    data: { orderStatus: 'CONFIRMED' },
  });
  await page.goto('/dashboard/customer/reviews');
  const count = (await load(page)).reviews.length;
  await page.getByRole('button', { name: 'Delete 1', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await load(page)).reviews.length).toBe(count - 1);
  expect(requests.find((r) => r.method === 'DELETE').path).toBe('/api/reviews/1');
});

test('camera capture and navigating away release media tracks', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 400;
        const context = canvas.getContext('2d');
        context.fillStyle = '#e6d8c5';
        context.fillRect(0, 0, 320, 400);
        const stream = canvas.captureStream(5);
        window.demoCameraTrack = stream.getVideoTracks()[0];
        return stream;
      },
    });
  });
  await page.goto('/try-on?arDebug=1');
  await page.getByRole('button', { name: 'Start AR Camera' }).click();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  // This simulated stream has no face; explicitly select manual fallback.
  await page.getByLabel('Auto Align', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Capture AR Result' }).click();
  // The canvas is already visible while live. Wait for async PNG encoding and
  // the completed capture state before checking that the camera was released.
  await expect(page.getByText('Face Tracking: Captured', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.demoCameraTrack.readyState)).toBe('ended');
  await page.getByRole('button', { name: 'Retake with camera' }).click();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);
  // Cold MediaPipe initialization can block browser evaluation during retake;
  // still require the actual track to end after the studio unmounts.
  await expect
    .poll(() => page.evaluate(() => window.demoCameraTrack.readyState), { timeout: 30000 })
    .toBe('ended');
});
