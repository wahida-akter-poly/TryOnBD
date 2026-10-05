import test from 'node:test';
import assert from 'node:assert/strict';
import { arCapability, normalizeProduct } from '../src/services/catalog.js';
import { sunglassesAssetFor } from '../src/data/faceAccessories.js';
import { necklaceCalibration } from '../src/components/tryon/necklaceCalibration.js';
import { shirtCalibration } from '../src/data/shirtProducts.js';

const parts = (slug) => ({
  frontAsset: `/assets/products/eyewear/${slug}/front.png`,
  leftTempleAsset: `/assets/products/eyewear/${slug}/left-temple.png`,
  rightTempleAsset: `/assets/products/eyewear/${slug}/right-temple.png`,
});
test('complete imported eyewear resolves each own rigid assembly without ID mappings', () => {
  for (const [id, slug] of [
    [1, 'first'],
    [3, 'second'],
    [900, 'third'],
  ]) {
    const arMetadata = {
      ...parts(slug),
      fitProfile: { widthMultiplier: 1.03, bridgePivot: { x: 0.49, y: 0.43 } },
    };
    const product = normalizeProduct({
      id,
      arType: 'EYEWEAR',
      imageUrl: arMetadata.frontAsset,
      arMetadata,
    });
    const asset = sunglassesAssetFor(product);
    assert.equal(asset.frontFrameSrc, arMetadata.frontAsset);
    assert.equal(asset.leftTempleSrc, arMetadata.leftTempleAsset);
    assert.equal(asset.rightTempleSrc, arMetadata.rightTempleAsset);
    assert.equal(asset.fit.widthMultiplier, 1.03);
    assert.deepEqual(asset.fit.bridgePivot, arMetadata.fitProfile.bridgePivot);
    assert.equal(asset.fallbackSrc, null);
    assert.equal(product.arAvailable, true);
  }
});
test('Classic Aviator remains browsable but full AR is unavailable without genuine temples', () => {
  const raw = {
    id: 77,
    name: 'Classic Aviator',
    arType: 'EYEWEAR',
    imageUrl: '/assets/face-ar/sunglasses/aviator-real.png',
    stockQuantity: 22,
    price: 1599,
  };
  const product = normalizeProduct(raw);
  assert.equal(product.engine, 'sunglasses');
  assert.equal(product.arAvailable, false);
  for (const key of Object.keys(raw)) assert.equal(product[key], raw[key]);
  assert.equal(sunglassesAssetFor(product).leftTempleSrc, null);
  assert.equal(sunglassesAssetFor(product).rightTempleSrc, null);
});
test('legacy Modern Clear assembly remains available using its own real parts', () => {
  const product = normalizeProduct({
    arType: 'EYEWEAR',
    imageUrl: '/assets/face-ar/sunglasses/modern-clear-front-clean.png',
  });
  assert.equal(product.arAvailable, true);
  assert.match(sunglassesAssetFor(product).leftTempleSrc, /modern-clear-left-temple-normalized/);
});
test('partial, duplicate, unsafe, or stale eyewear parts never enable virtual try-on', () => {
  const metadata = parts('first');
  for (const arMetadata of [
    {},
    { frontAsset: metadata.frontAsset },
    { ...metadata, rightTempleAsset: null },
    { ...metadata, rightTempleAsset: 'javascript:bad' },
    { ...metadata, rightTempleAsset: metadata.leftTempleAsset },
    { ...metadata, frontAsset: '/old-front.png' },
  ])
    assert.equal(
      arCapability({ arType: 'EYEWEAR', imageUrl: metadata.frontAsset, arMetadata }).available,
      false,
    );
  assert.equal(
    arCapability({ arType: 'EYEWEAR', imageUrl: '/unknown-real-front.png' }).available,
    false,
  );
});
test('all clothing aliases resolve each backend front with optional product calibration', () => {
  for (const [index, arType] of ['SHIRT', 'TSHIRT', 'CLOTHING'].entries()) {
    const imageUrl = `/assets/products/clothing/garment-${index}/front.png`;
    const product = normalizeProduct({
      id: index + 50,
      arType,
      imageUrl,
      arMetadata: {
        frontAsset: imageUrl,
        fitProfile: { widthMultiplier: 1.1, heightMultiplier: 0.95 },
      },
    });
    const fit = shirtCalibration(product);
    assert.equal(product.engine, 'clothing');
    assert.equal(product.arAvailable, true);
    assert.equal(fit.asset, imageUrl);
    assert.equal(fit.widthMultiplier, 1.1);
    assert.equal(fit.heightMultiplier, 0.95);
  }
});
test('necklace styles use persisted metadata ahead of names and filenames', () => {
  for (const style of ['CHOKER', 'SHORT', 'PENDANT']) {
    const imageUrl = `/assets/products/jewelry/${style.toLowerCase()}/front.png`;
    const product = normalizeProduct({
      id: 3,
      name: 'Pendant Choker Short',
      arType: 'NECKLACE',
      imageUrl,
      arMetadata: { frontAsset: imageUrl, style },
    });
    assert.equal(product.engine, 'necklace');
    assert.equal(product.imageUrl, imageUrl);
    assert.equal(necklaceCalibration(product).style, style);
    assert.equal(product.arAvailable, true);
  }
  assert.equal(necklaceCalibration({ name: 'Silver Diamond Necklace' }).style, 'SHORT');
});
test('necklace fit overrides remain bounded and never change shared tracking policy', () => {
  const fit = necklaceCalibration({
    arMetadata: {
      style: 'CHOKER',
      fitProfile: { widthRatio: 0.82, heightRatio: 100, smoothMs: 0 },
    },
  });
  assert.equal(fit.widthRatio, 0.82);
  assert.equal(fit.heightRatio, 0.3);
  assert.equal(fit.style, 'CHOKER');
  assert.equal(fit.smoothMs, undefined);
});
test('imported products preserve generic cart identity, price, stock, seller and category', () => {
  for (const arType of ['EYEWEAR', 'SHIRT', 'TSHIRT', 'CLOTHING', 'NECKLACE']) {
    const product = normalizeProduct({
      id: 890,
      arType,
      imageUrl: '/assets/real.png',
      price: '2899.00',
      stockQuantity: 12,
      sellerId: 2,
      categoryId: 4,
    });
    assert.equal(product.id, 890);
    assert.equal(product.price, 2899);
    assert.equal(product.stockQuantity, 12);
    assert.equal(product.sellerId, 2);
    assert.equal(product.categoryId, 4);
  }
});
