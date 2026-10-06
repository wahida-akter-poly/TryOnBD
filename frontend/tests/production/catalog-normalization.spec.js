import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { catalogPackages, expectDecodedImage } from '../fixtures/catalogPackages.js';

async function account(page, role, sellerId = 1) {
  await page.addInitScript(() => localStorage.setItem('tryonbd:token', 'isolated-browser-token'));
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/account/me')
      return route.fulfill({
        json: { id: 55, fullName: 'Browser role fixture', role, email: 'isolated@test.example' },
      });
    if (path === '/api/products' || path === '/api/account/products')
      return route.fulfill({
        json:
          path === '/api/account/products' && role === 'SELLER'
            ? catalogPackages.filter((p) => p.sellerId === sellerId)
            : catalogPackages,
      });
    if (/^\/api\/products\/\d+$/.test(path))
      return route.fulfill({
        json: catalogPackages.find((p) => p.id === Number(path.split('/').at(-1))),
      });
    if (path === '/api/categories')
      return route.fulfill({
        json: [
          { id: 1, categoryName: 'Clothing' },
          { id: 2, categoryName: 'Eyewear' },
          { id: 4, categoryName: 'Jewelry' },
        ],
      });
    if (path === '/api/account/seller')
      return route.fulfill({
        json: { id: sellerId, businessName: sellerId === 1 ? 'TryOnBD Demo Store' : 'Anzara' },
      });
    if (path === '/api/sellers')
      return route.fulfill({
        json: [
          { id: 1, businessName: 'TryOnBD Demo Store' },
          { id: 2, businessName: 'Anzara' },
        ],
      });
    if (path === '/api/account/cart') return route.fulfill({ json: { 1: 1, 2: 1, 3: 1, 5: 1 } });
    if (path === '/api/orders' || path === '/api/try-on-sessions')
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: {} });
  });
  // Asset requests are deliberately NOT mocked: preview must serve and decode the real PNGs.
}

for (const [role, sellerId] of [
  ['SELLER', 1],
  ['SELLER', 2],
  ['ADMIN', 1],
  ['SUPER_ADMIN', 1],
])
  test(`normalized product images load in existing ${role} ${sellerId} management`, async ({
    page,
  }) => {
    await account(page, role, sellerId);
    await page.goto(`/dashboard/${role.toLowerCase()}/products`);
    const records =
      role === 'SELLER' ? catalogPackages.filter((p) => p.sellerId === sellerId) : catalogPackages;
    for (const product of records) await expectDecodedImage(expect, page, product);
    await expect(page.locator('[data-image-status=error]')).toHaveCount(0);
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({
      path: `artifacts/catalog-management-${role}-${sellerId}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
    await expect(page.getByLabel('Image URL or local asset path')).toHaveValue(records[1].imageUrl);
    await expect(page.getByLabel('Price', { exact: true })).toHaveValue(String(records[1].price));
  });

test('cart and checkout decode package thumbnails without changing stock or order behavior', async ({
  page,
}) => {
  await account(page, 'CUSTOMER');
  await page.goto('/checkout');
  for (const product of catalogPackages.filter((p) => p.stockQuantity > 0)) {
    await expectDecodedImage(expect, page, product);
    await expect(page.getByLabel(`Quantity for ${product.name}`)).toHaveAttribute(
      'max',
      String(product.stockQuantity),
    );
  }
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
  await expect(page.locator('[data-image-status=error]')).toHaveCount(0);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/catalog-checkout.png', fullPage: true });
  await page.goto('/products/4');
  await expectDecodedImage(expect, page, catalogPackages[3]);
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
});
