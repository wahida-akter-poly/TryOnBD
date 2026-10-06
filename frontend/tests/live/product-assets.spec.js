import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile('public/assets/products/jewelry/royal-gold-choker/product.json', 'utf8'),
);
const imageUrl = '/assets/products/jewelry/royal-gold-choker/front.png';
test('live approved choker is one PostgreSQL product and renders its own CHOKER asset', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/products');
  expect(response.ok()).toBe(true);
  const products = await response.json();
  const matches = products.filter((p) => p.imageUrl === imageUrl);
  expect(matches).toHaveLength(1);
  const product = matches[0];
  expect(product).toMatchObject({
    name: manifest.name,
    description: manifest.description,
    price: manifest.price,
    stockQuantity: manifest.stockQuantity,
    sellerId: manifest.sellerId,
    sellerName: 'Anzara',
    categoryName: 'Jewelry',
    arType: 'NECKLACE',
    arMetadata: { style: 'CHOKER', frontAsset: imageUrl },
  });
  expect((await request.get(`/api/products/${product.id}`)).ok()).toBe(true);
  expect((await request.get(imageUrl)).ok()).toBe(true);
  await page.goto('/products?group=Jewelry');
  await expect(page.getByRole('heading', { name: manifest.name, exact: true })).toBeVisible();
  await page.goto(`/products/${product.id}`);
  await expect(page.getByRole('heading', { name: manifest.name, exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: manifest.name, exact: true })).toHaveAttribute(
    'src',
    imageUrl,
  );
  await expect(
    page.getByText(`${manifest.stockQuantity} available`, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try Virtually', exact: true }).click();
  await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
    'data-necklace-style',
    'CHOKER',
  );
  await expect(page.getByLabel('Necklace try-on canvas')).toHaveAttribute(
    'data-overlay-src',
    imageUrl,
  );
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('tests/fixtures/shirt-hands-on-hips.jpg');
  await expect(page.getByText('Pose detected', { exact: true })).toBeVisible({ timeout: 60000 });
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/live-royal-gold-choker.png', fullPage: true });
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await event;
  expect(await download.failure()).toBeNull();
  await download.saveAs('artifacts/live-royal-gold-choker-capture.png');
  // API/browser checks are read-only; stock remains available for real customers.
});
