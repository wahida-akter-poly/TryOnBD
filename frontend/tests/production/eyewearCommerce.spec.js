import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(
  await readFile('public/assets/products/eyewear/golden-frame/product.json', 'utf8'),
);
const base = '/assets/products/eyewear/golden-frame/';
const product = {
  ...manifest,
  id: 906,
  categoryId: 2,
  sellerName: 'Anzara',
  imageUrl: base + manifest.frontAsset,
  arMetadata: {
    frontAsset: base + manifest.frontAsset,
    leftTempleAsset: base + manifest.leftTempleAsset,
    rightTempleAsset: base + manifest.rightTempleAsset,
    fitProfile: manifest.fitProfile,
  },
};
async function account(page, role) {
  await page.addInitScript(() => localStorage.setItem('tryonbd:token', 'isolated-ui-token'));
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/account/me')
      return route.fulfill({
        json: { id: 55, fullName: 'Isolated role fixture', role, email: 'ui@test.example' },
      });
    if (path === '/api/products' || path === '/api/account/products')
      return route.fulfill({ json: [product] });
    if (path === '/api/products/' + product.id) return route.fulfill({ json: product });
    if (path === '/api/categories')
      return route.fulfill({ json: [{ id: 2, categoryName: 'Eyewear' }] });
    if (path === '/api/account/seller')
      return route.fulfill({ json: { id: 2, businessName: 'Anzara' } });
    if (path === '/api/sellers')
      return route.fulfill({ json: [{ id: 2, businessName: 'Anzara' }] });
    if (path === '/api/account/cart') return route.fulfill({ json: {} });
    if (path === '/api/orders' || path === '/api/try-on-sessions')
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { message: 'Unexpected fixture endpoint' } });
  });
}
test('Golden Frame uses generic Add to Cart, quantity, stock and checkout UI', async ({ page }) => {
  await account(page, 'CUSTOMER');
  let cart = {},
    added;
  await page.route('**/api/account/cart**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/' + product.id)) {
      added = route.request().postDataJSON();
      cart = { [product.id]: added.quantity };
    }
    return route.fulfill({ json: cart });
  });
  await page.goto('/products/' + product.id);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible();
  expect(added).toEqual({ quantity: 1 });
  await page.goto('/checkout');
  await expect(page.getByRole('link', { name: product.name, exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton')).toHaveAttribute('max', '15');
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
  await page.getByRole('spinbutton').fill('2');
  await expect.poll(() => cart[product.id]).toBe(2);
});
for (const role of ['SELLER', 'ADMIN', 'SUPER_ADMIN'])
  test('Golden Frame appears in existing ' + role + ' management', async ({ page }) => {
    await account(page, role);
    let payload;
    await page.route('**/api/products/' + product.id, (route) => {
      if (route.request().method() === 'PUT') {
        payload = route.request().postDataJSON();
        return route.fulfill({ json: { ...product, ...payload } });
      }
      return route.fulfill({ json: product });
    });
    await page.goto('/dashboard/' + role.toLowerCase() + '/products');
    await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Price', { exact: true })).toHaveValue('2199');
    await expect(page.getByLabel('Stock', { exact: true })).toHaveValue('15');
    await expect(page.getByLabel('Image URL or local asset path')).toHaveValue(product.imageUrl);
    await expect(page.getByLabel('AR type', { exact: true })).toHaveValue('EYEWEAR');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create product', exact: true })).toBeEnabled();
    expect(payload).toMatchObject({
      name: product.name,
      price: 2199,
      stockQuantity: 15,
      arType: 'EYEWEAR',
      sellerId: 2,
      categoryId: 2,
      imageUrl: product.imageUrl,
    });
  });
