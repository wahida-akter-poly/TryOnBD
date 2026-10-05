import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(
  await readFile('public/assets/products/jewelry/royal-gold-choker/product.json', 'utf8'),
);
const product = {
  ...manifest,
  id: 905,
  categoryId: 4,
  sellerName: 'Anzara',
  imageUrl: '/assets/products/jewelry/royal-gold-choker/front.png',
  arMetadata: {
    style: 'CHOKER',
    frontAsset: '/assets/products/jewelry/royal-gold-choker/front.png',
  },
};
async function setup(page, identity) {
  const png = await readFile('public/assets/products/jewelry/royal-gold-choker/front.png');
  await page.route('**/assets/products/jewelry/royal-gold-choker/front.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.addInitScript(() =>
    localStorage.setItem('tryonbd:token', 'isolated-browser-test-token'),
  );
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/account/me')
      return route.fulfill({
        json: {
          id: 55,
          fullName: 'Browser role fixture',
          email: 'isolated@test.example',
          role: identity,
        },
      });
    if (path === '/api/products' || path === '/api/account/products')
      return route.fulfill({ json: [product] });
    if (path === `/api/products/${product.id}`) return route.fulfill({ json: product });
    if (path === '/api/categories')
      return route.fulfill({ json: [{ id: 4, categoryName: 'Jewelry' }] });
    if (path === '/api/account/seller')
      return route.fulfill({ json: { id: 2, businessName: 'Anzara' } });
    if (path === '/api/sellers')
      return route.fulfill({ json: [{ id: 2, businessName: 'Anzara' }] });
    if (path === '/api/account/cart') return route.fulfill({ json: {} });
    if (path === '/api/orders' || path === '/api/try-on-sessions')
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { message: 'Not an expected test endpoint' } });
  });
}
test('approved imported choker adds through generic cart API and is eligible for checkout', async ({
  page,
}) => {
  await setup(page, 'CUSTOMER');
  let cart = {},
    added;
  await page.route('**/api/account/cart**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/account/cart/${product.id}`) {
      added = route.request().postDataJSON();
      cart = { [product.id]: added.quantity };
    }
    return route.fulfill({ json: cart });
  });
  await page.goto(`/products/${product.id}`);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible();
  expect(added).toEqual({ quantity: 1 });
  await page.goto('/checkout');
  await expect(page.getByRole('link', { name: product.name, exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton')).toHaveValue('1');
  await expect(page.getByRole('spinbutton')).toHaveAttribute('max', '12');
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
  await page.getByRole('spinbutton').fill('2');
  await expect(page.getByRole('spinbutton')).toHaveValue('2');
  await expect.poll(() => cart[product.id]).toBe(2);
});
for (const role of ['SELLER', 'ADMIN', 'SUPER_ADMIN'])
  test(`imported product is visible and editable in existing ${role} management`, async ({
    page,
  }) => {
    await setup(page, role);
    let payload;
    await page.route(`**/api/products/${product.id}`, (route) => {
      if (route.request().method() === 'PUT') {
        payload = route.request().postDataJSON();
        return route.fulfill({ json: { ...product, ...payload } });
      }
      return route.fulfill({ json: product });
    });
    await page.goto(`/dashboard/${role.toLowerCase()}/products`);
    await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(product.name);
    await expect(page.getByLabel('Price', { exact: true })).toHaveValue('2899');
    await expect(page.getByLabel('Stock', { exact: true })).toHaveValue('12');
    await expect(page.getByLabel('Image URL or local asset path')).toHaveValue(product.imageUrl);
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('4');
    await expect(page.getByLabel('AR type', { exact: true })).toHaveValue('NECKLACE');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create product', exact: true })).toBeEnabled();
    expect(payload).toMatchObject({
      name: product.name,
      description: product.description,
      price: 2899,
      stockQuantity: 12,
      sellerId: 2,
      categoryId: 4,
      imageUrl: product.imageUrl,
      arType: 'NECKLACE',
    });
  });

test('existing management form retains the imported CLOTHING alias', async ({ page }) => {
  await setup(page, 'SELLER');
  const garment = {
    ...product,
    arType: 'CLOTHING',
    imageUrl: '/assets/body-ar/shirts/tshirt-black-front.png',
    arMetadata: null,
  };
  await page.route('**/api/account/products', (route) => route.fulfill({ json: [garment] }));
  await page.goto('/dashboard/seller/products');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('AR type', { exact: true })).toHaveValue('CLOTHING');
  for (const type of ['SHIRT', 'TSHIRT', 'CLOTHING']) {
    await page.getByLabel('AR type', { exact: true }).selectOption(type);
    await expect(page.getByLabel('AR type', { exact: true })).toHaveValue(type);
  }
});
