import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('live PostgreSQL necklace catalog, details, MediaPipe photo and export', async ({
  page,
  request,
}) => {
  const productsResponse = await request.get('/api/products');
  expect(productsResponse.ok()).toBe(true);
  const products = await productsResponse.json();
  const expected = [
    [1, 'Black T-Shirt', 'SHIRT'],
    [2, 'Modern Clear Frame', 'EYEWEAR'],
    [3, 'Classic Aviator', 'EYEWEAR'],
  ];
  for (const [id, name, arType] of expected)
    expect(products.find((p) => p.id === id)).toMatchObject({ name, arType });
  const necklaces = products.filter((p) => p.arType === 'NECKLACE');
  expect(necklaces.length).toBeGreaterThan(0);
  const categories = await (await request.get('/api/categories')).json();
  const jewelry = categories.find((c) => c.categoryName === 'Jewelry');
  expect(jewelry).toBeTruthy();
  for (const product of necklaces) {
    expect(product.categoryId).toBe(jewelry.id);
    const asset = await request.get(product.imageUrl);
    expect(asset.ok()).toBe(true);
    expect(asset.headers()['content-type']).toContain('image/png');
  }
  await page.goto('/products?group=Jewelry');
  await expect(page.locator('.product-card')).toHaveCount(necklaces.length);
  await expect(page.locator('a[href*="necklace-preview"]')).toHaveCount(0);
  const product = necklaces[0];
  await page.getByRole('link', { name: 'View Details', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/products/${product.id}$`));
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: product.name, exact: true })).toHaveAttribute(
    'src',
    product.imageUrl,
  );
  await expect(page.getByText(`Sold by ${product.sellerName}`, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Try Virtually', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`productId=${product.id}$`));
  await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
    'data-overlay-src',
    product.imageUrl,
  );
  await expect(
    page.getByText('Start your camera or upload a clear, front-facing photo.'),
  ).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('srcObject', null);
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('tests/fixtures/shirt-hands-on-hips.jpg');
  await expect(page.getByText('Pose detected', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
    'data-neck-anchor',
    'pose-head',
  );
  await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
    'data-necklace-style',
    'SHORT',
  );
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/real-necklace-live.png', fullPage: true });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  await download.saveAs('artifacts/real-necklace-capture.png');
  if (product.stockQuantity === 0)
    await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  for (const path of [
    '/api/account/cart',
    '/api/orders',
    '/api/try-on-sessions',
    '/api/account/products',
  ]) {
    expect((await request.get(path)).status()).toBe(401);
  }
  // Read-only live commerce checks: never manufacture orders, sessions or business values.
  console.log(
    JSON.stringify({
      productId: product.id,
      categoryId: jewelry.id,
      sellerId: product.sellerId,
      imageUrl: product.imageUrl,
      arType: product.arType,
      livePhotoFit: true,
      liveExport: true,
    }),
  );
});
