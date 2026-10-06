import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const front = '/assets/products/eyewear/modern-clear-frame/front.png';
const left = '/assets/products/eyewear/modern-clear-frame/left-temple.png';
const right = '/assets/products/eyewear/modern-clear-frame/right-temple.png';
const manifest = JSON.parse(
  await readFile('public/assets/products/jewelry/royal-gold-choker/product.json', 'utf8'),
);
const choker = {
  ...manifest,
  id: 905,
  categoryId: 4,
  sellerName: 'Anzara',
  categoryName: 'Jewelry',
  imageUrl: '/assets/products/jewelry/royal-gold-choker/front.png',
  arMetadata: {
    style: manifest.style,
    frontAsset: '/assets/products/jewelry/royal-gold-choker/front.png',
  },
};
const aviator = {
  id: 903,
  name: 'Classic Aviator',
  arType: 'EYEWEAR',
  price: 1599,
  stockQuantity: 22,
  imageUrl: '/assets/products/eyewear/classic-aviator/front.png',
};
const importedEyewear = {
  id: 902,
  name: 'Manifest eyewear test fixture',
  arType: 'EYEWEAR',
  price: 10,
  stockQuantity: 2,
  imageUrl: '/assets/products/eyewear/test-fixture/front.png',
  arMetadata: {
    frontAsset: '/assets/products/eyewear/test-fixture/front.png',
    leftTempleAsset: '/assets/products/eyewear/test-fixture/left-temple.png',
    rightTempleAsset: '/assets/products/eyewear/test-fixture/right-temple.png',
    fitProfile: {
      bridgePivot: { x: 0.5, y: 0.43 },
      hinges: { left: { x: 0.025, y: 0.22 }, right: { x: 0.975, y: 0.22 } },
    },
  },
};
async function catalog(page, list) {
  const png = await readFile('public/assets/products/jewelry/royal-gold-choker/front.png');
  await page.route('**/assets/products/jewelry/royal-gold-choker/front.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products') return route.fulfill({ json: list });
    if (path === '/api/categories')
      return route.fulfill({ json: [{ id: 4, categoryName: 'Jewelry' }] });
    if (path.startsWith('/api/products/'))
      return route.fulfill({ json: list.find((p) => p.id === Number(path.split('/').at(-1))) });
    return route.fulfill({ status: 401, json: { message: 'Sign in required' } });
  });
}
test('approved manifest choker appears through catalog/details and its own CHOKER engine', async ({
  page,
}) => {
  await catalog(page, [choker]);
  await page.goto('/products?group=Jewelry');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'View Details', exact: true }).click();
  await expect(page.getByRole('heading', { name: manifest.name, exact: true })).toBeVisible();
  await expect(page.getByText(manifest.description, { exact: true })).toBeVisible();
  await expect(page.getByText('Sold by Anzara')).toBeVisible();
  await page.getByRole('button', { name: 'Try Virtually', exact: true }).click();
  const canvas = page.getByLabel('Necklace try-on canvas');
  await expect(canvas).toHaveAttribute('data-overlay-src', choker.imageUrl);
  await expect(canvas).toHaveAttribute('data-necklace-style', 'CHOKER');
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('tests/fixtures/shirt-hands-on-hips.jpg');
  await expect(page.getByText('Pose detected', { exact: true })).toBeVisible({ timeout: 60000 });
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  expect(await (await event).failure()).toBeNull();
});
test('Aviator stays visible in eyewear catalog while incomplete AR cannot start a detector', async ({
  page,
}) => {
  await catalog(page, [aviator]);
  await page.goto('/products?group=Eyewear');
  await expect(page.getByRole('heading', { name: 'Classic Aviator', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try Virtually', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'View Details', exact: true }).click();
  await expect(page.getByText('Virtual try-on is unavailable for this product.')).toBeVisible();
  const detectors = [];
  page.on('request', (r) => {
    if (/face_landmarker|pose_landmarker/.test(r.url())) detectors.push(r.url());
  });
  await page.goto(`/try-on?productId=${aviator.id}`);
  await expect(
    page.getByRole('heading', { name: 'Virtual try-on is unavailable for this product' }),
  ).toBeVisible();
  expect(detectors).toEqual([]);
  await page.getByRole('link', { name: 'View product', exact: true }).click();
  await expect(page.getByRole('heading', { name: aviator.name, exact: true })).toBeVisible();
});
test('imported eyewear uses its manifest parts in the existing WebGL face-depth pipeline', async ({
  page,
}) => {
  await catalog(page, [importedEyewear]);
  const buffers = await Promise.all([front, left, right].map((p) => readFile(`public${p}`)));
  const urls = [
    importedEyewear.imageUrl,
    importedEyewear.arMetadata.leftTempleAsset,
    importedEyewear.arMetadata.rightTempleAsset,
  ];
  for (const [i, url] of urls.entries())
    await page.route(`**${url}`, (route) =>
      route.fulfill({ contentType: 'image/png', body: buffers[i] }),
    );
  await page.goto(`/try-on?productId=${importedEyewear.id}`);
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('tests/fixtures/ear-front.jpg');
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel('Virtual try-on preview')).toHaveAttribute(
    'data-eyewear-renderer',
    'WEBGL_FACE_DEPTH',
  );
});
test('SHIRT, TSHIRT and CLOTHING products use their dynamic backend front in the shared studio', async ({
  page,
}) => {
  test.setTimeout(120000);
  const products = ['SHIRT', 'TSHIRT', 'CLOTHING'].map((arType, i) => ({
    id: 910 + i,
    name: `Clothing API fixture ${i}`,
    arType,
    price: 10,
    stockQuantity: 2,
    imageUrl: `/assets/products/clothing/black-t-shirt/front.png?variant=${i}`,
    arMetadata: { fitProfile: { widthMultiplier: 1 } },
  }));
  await catalog(page, products);
  for (const product of products) {
    const assetRequest = page.waitForRequest((request) => request.url().endsWith(product.imageUrl));
    await page.goto(`/try-on?productId=${product.id}`);
    await expect(
      page.getByRole('heading', { name: 'Try your T-shirt.', exact: true }),
    ).toBeVisible();
    await assetRequest;
    await page
      .getByLabel('Upload photo', { exact: true })
      .setInputFiles('tests/fixtures/shirt-hands-on-hips.jpg');
    await expect(page.getByText('Torso fitted', { exact: true })).toBeVisible({ timeout: 60000 });
    await expect(page.getByLabel('T-shirt try-on canvas')).toBeVisible();
  }
});
