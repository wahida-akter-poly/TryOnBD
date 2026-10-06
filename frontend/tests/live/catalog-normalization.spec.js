import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { catalogPackages, expectDecodedImage } from '../fixtures/catalogPackages.js';

test('all five existing PostgreSQL products retain business data and load actual package images across catalog and details', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const response = await request.get('/api/products');
  expect(response.ok()).toBe(true);
  const products = await response.json();
  for (const expected of catalogPackages) {
    const matches = products.filter((p) => p.id === expected.id);
    expect(matches).toHaveLength(1);
    const product = matches[0];
    for (const key of [
      'name',
      'description',
      'price',
      'stockQuantity',
      'sellerId',
      'categoryId',
      'arType',
      'imageUrl',
    ])
      expect(product[key]).toEqual(expected[key]);
    const byId = await request.get(`/api/products/${product.id}`);
    expect(byId.ok()).toBe(true);
    expect(await byId.json()).toEqual(product);
    for (const url of [
      product.imageUrl,
      product.arMetadata?.leftTempleAsset,
      product.arMetadata?.rightTempleAsset,
    ].filter(Boolean)) {
      for (const origin of ['', 'http://127.0.0.1:8080']) {
        const asset = await request.get(origin + url);
        expect(asset.ok(), origin + url).toBe(true);
        expect(asset.headers()['content-type']).toContain('image/png');
        expect([...(await asset.body()).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      }
    }
  }
  await mkdir('artifacts', { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/products');
    for (const product of catalogPackages) await expectDecodedImage(expect, page, product);
    await expect(
      page.locator('[data-image-status=error], [data-image-status=missing]'),
    ).toHaveCount(0);
    await page.screenshot({ path: `artifacts/catalog-normalized-${width}.png`, fullPage: true });
  }
  for (const product of catalogPackages) {
    await page.goto(`/products/${product.id}`);
    await expectDecodedImage(expect, page, product);
    await expect(page.getByRole('button', { name: 'Try Virtually', exact: true })).toHaveCount(
      product.id === 3 ? 0 : 1,
    );
    await page.screenshot({
      path: `artifacts/product-normalized-${product.id}.png`,
      fullPage: true,
    });
  }
});
