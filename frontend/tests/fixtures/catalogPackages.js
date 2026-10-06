import { readFile } from 'node:fs/promises';

// Real approved package values, used only by isolated UI tests. The app still fetches its catalog.
const keys = [
  'clothing/black-t-shirt',
  'eyewear/modern-clear-frame',
  'eyewear/classic-aviator',
  'jewelry/silver-diamond-necklace',
  'jewelry/royal-gold-choker',
];
export const catalogPackages = await Promise.all(
  keys.map(async (key, index) => {
    const manifest = JSON.parse(
      await readFile(
        new URL(`../../public/assets/products/${key}/product.json`, import.meta.url),
        'utf8',
      ),
    );
    const id = index + 1;
    const imageUrl = `/assets/products/${key}/${manifest.frontAsset}`;
    const arMetadata = {
      frontAsset: imageUrl,
      ...(manifest.style ? { style: manifest.style } : {}),
      ...(manifest.fitProfile ? { fitProfile: manifest.fitProfile } : {}),
    };
    for (const field of ['leftTempleAsset', 'rightTempleAsset'])
      if (manifest[field]) arMetadata[field] = `/assets/products/${key}/${manifest[field]}`;
    return {
      ...manifest,
      id,
      imageUrl,
      arMetadata,
      categoryName: manifest.category,
      categoryId: id === 1 ? 1 : id <= 3 ? 2 : 4,
      sellerName: manifest.sellerId === 1 ? 'TryOnBD Demo Store' : 'Anzara',
    };
  }),
);
export async function expectDecodedImage(expect, page, product) {
  const image = page.getByRole('img', { name: product.name, exact: true });
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', product.imageUrl);
  await expect
    .poll(() =>
      image.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    )
    .toBe(true);
  await expect(image).toHaveCSS('object-fit', 'contain');
}
