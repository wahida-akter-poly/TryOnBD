import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('live PostgreSQL product-by-id APIs and real eyewear/shirt photo flows', async ({
  page,
  request,
}) => {
  const expected = [
    [1, 'Black T-Shirt', 'SHIRT'],
    [2, 'Modern Clear Frame', 'EYEWEAR'],
    [3, 'Classic Aviator', 'EYEWEAR'],
    [4, 'Silver Diamond Necklace', 'NECKLACE'],
  ];
  const products = [];
  for (const [id, name, arType] of expected) {
    const response = await request.get(`/api/products/${id}`);
    expect(response.ok()).toBe(true);
    const product = await response.json();
    expect(product).toMatchObject({ id, name, arType });
    expect(product.sellerId).toBeGreaterThan(0);
    expect(product.categoryId).toBeGreaterThan(0);
    expect((await request.get(product.imageUrl)).ok()).toBe(true);
    products.push(product);
  }
  await mkdir('artifacts', { recursive: true });
  for (const product of products.filter(
    (p) => p.arType !== 'NECKLACE' && p.name !== 'Classic Aviator',
  )) {
    await page.goto(`/products/${product.id}`);
    await expect(page.getByRole('img', { name: product.name, exact: true })).toHaveAttribute(
      'src',
      product.imageUrl,
    );
    await page.getByRole('button', { name: 'Try Virtually', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/products/${product.id}[?]tryOn=true$`));
    await page
      .getByLabel('Upload photo', { exact: true })
      .setInputFiles(
        product.arType === 'SHIRT'
          ? 'tests/fixtures/shirt-hands-on-hips.jpg'
          : 'tests/fixtures/ear-front.jpg',
      );
    await expect(
      page.getByText(product.arType === 'SHIRT' ? 'Torso fitted' : 'Frame fitted', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    if (product.arType === 'EYEWEAR')
      await expect(page.getByLabel('Virtual try-on preview')).toHaveAttribute(
        'data-eyewear-renderer',
        'WEBGL_FACE_DEPTH',
      );
    await page.screenshot({ path: `artifacts/live-ar-product-${product.id}.png`, fullPage: true });
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
    const download = await event;
    expect(await download.failure()).toBeNull();
    await download.saveAs(`artifacts/live-ar-product-${product.id}-capture.png`);
  }
  await page.goto('/products/3');
  await expect(page.getByText('Virtual try-on is unavailable for this product.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try Virtually', exact: true })).toHaveCount(0);
  await page.goto('/try-on?productId=3');
  await expect(
    page.getByRole('heading', { name: 'Virtual try-on is unavailable for this product' }),
  ).toBeVisible();
  // Live requests are read-only. No cart, account, catalog or order writes.
  for (const path of ['/api/account/me', '/api/account/products', '/api/users', '/api/orders'])
    expect((await request.get(path)).status()).toBe(401);
});
