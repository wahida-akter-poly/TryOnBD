import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const products = await Promise.all(
  ['modern-clear-frame', 'golden-frame'].map(async (slug, index) => {
    const manifest = JSON.parse(
      await readFile(`public/assets/products/eyewear/${slug}/product.json`, 'utf8'),
    );
    const base = `/assets/products/eyewear/${slug}/`;
    return {
      ...manifest,
      id: index ? 6 : 2,
      imageUrl: base + manifest.frontAsset,
      categoryId: 1,
      arMetadata: {
        frontAsset: base + manifest.frontAsset,
        fitProfile: manifest.fitProfile,
        leftTempleAsset: base + manifest.leftTempleAsset,
        rightTempleAsset: base + manifest.rightTempleAsset,
        gallery: manifest.gallery.map((name) => base + name),
      },
    };
  }),
);
const single = {
  id: 3,
  name: 'Classic Aviator',
  arType: 'EYEWEAR',
  price: 1599,
  stockQuantity: 10,
  imageUrl: '/assets/products/eyewear/classic-aviator/front.png',
  categoryId: 1,
};
async function setup(page) {
  // Serve exact fixture bytes while the local API may still run older classes.
  // The live checks separately verify the updated backend asset route.
  await page.route('**/assets/products/**/*.webp', async (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ contentType: 'image/webp', body: await readFile(`public${path}`) });
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products') return route.fulfill({ json: [...products, single] });
    if (path === '/api/categories')
      return route.fulfill({ json: [{ id: 1, categoryName: 'Eyewear' }] });
    if (/^\/api\/products\/\d+$/.test(path))
      return route.fulfill({
        json: [...products, single].find((p) => p.id === Number(path.split('/').at(-1))),
      });
    return route.fulfill({ status: 401, json: { message: 'Sign in required' } });
  });
}
for (const product of products)
  test(`${product.name} hover, genuine gallery, enlargement and keyboard interaction`, async ({
    page,
  }) => {
    await setup(page);
    await page.goto('/products?group=Eyewear');
    const card = page
      .locator('.product-card')
      .filter({ has: page.getByRole('heading', { name: product.name, exact: true }) });
    const image = card.getByRole('img', { name: product.name, exact: true });
    await expect
      .poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    const bounds = await card.boundingBox();
    await image.hover();
    await expect
      .poll(() => image.evaluate((img) => new DOMMatrixReadOnly(getComputedStyle(img).transform).a))
      .toBeCloseTo(1.15, 2);
    expect(await card.boundingBox()).toEqual(bounds);
    await expect(card.locator('.product-image')).toHaveCSS('overflow', 'hidden');
    await image.click();
    await expect(page).toHaveURL(new RegExp(`/products/${product.id}$`));
    const main = page
      .locator('.gallery-main')
      .getByRole('img', { name: product.name, exact: true });
    await expect(main).toHaveAttribute('src', product.imageUrl);
    const thumbnails = page.locator('.gallery-thumbnails button');
    await expect(thumbnails).toHaveCount(4);
    for (let index = 0; index < 4; index++) {
      await thumbnails.nth(index).click();
      await expect(main).toHaveAttribute(
        'src',
        [product.imageUrl, ...product.arMetadata.gallery][index],
      );
      await expect
        .poll(() => main.evaluate((img) => img.complete && img.naturalWidth > 0))
        .toBe(true);
      await expect(thumbnails.nth(index)).toHaveAttribute('aria-pressed', 'true');
    }
    await page.getByRole('button', { name: `Enlarge ${product.name} image`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `${product.name} image gallery` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img')).toHaveAttribute('src', product.arMetadata.gallery[2]);
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('img')).toHaveAttribute('src', product.imageUrl);
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.getByRole('img')).toHaveAttribute('src', product.arMetadata.gallery[2]);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: `Enlarge ${product.name} image`, exact: true }),
    ).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await expect(page.locator('.gallery-thumbnails img[src*="temple"]')).toHaveCount(0);
  });
test('a single genuine image enlarges without invented thumbnails', async ({ page }) => {
  await setup(page);
  await page.goto('/products/3');
  await expect(page.locator('.gallery-thumbnails')).toHaveCount(0);
  await page.getByRole('button', { name: 'Enlarge Classic Aviator image', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toHaveAttribute('src', single.imageUrl);
  await expect(dialog.getByRole('button', { name: 'Next product image' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close image gallery' }).click();
  await expect(dialog).not.toBeVisible();
});
test.describe('mobile gallery', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test('thumbnails and lightbox stay usable within the viewport', async ({ page }) => {
    await setup(page);
    await page.goto('/products/6');
    await page.locator('.gallery-thumbnails button').nth(2).tap();
    await page.getByRole('button', { name: 'Enlarge Golden Frame image', exact: true }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    await dialog.getByRole('button', { name: 'Next product image' }).tap();
    await expect(dialog.getByRole('img')).toHaveAttribute('src', products[1].arMetadata.gallery[2]);
    await dialog.getByRole('button', { name: 'Close image gallery' }).tap();
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});
