import test from 'node:test';
import assert from 'node:assert/strict';
import { arEngine, normalizeProduct, imageSource } from '../src/services/catalog.js';
test('AR engines use metadata and never numeric product IDs', () => {
  for (const type of ['SHIRT', 'TSHIRT', 'CLOTHING']) assert.equal(arEngine(type), 'clothing');
  for (const type of ['EYEWEAR', 'SUNGLASSES']) assert.equal(arEngine(type), 'sunglasses');
  for (const type of ['NECKLACE', 'JEWELRY']) assert.equal(arEngine(type), 'necklace');
  assert.equal(arEngine('NONE'), null);
  assert.equal(
    normalizeProduct({ id: 3, arType: 'EYEWEAR', price: '1599.00' }).engine,
    'sunglasses',
  );
  assert.equal(normalizeProduct({ id: 77, arType: 'NECKLACE', price: 0 }).engine, 'necklace');
});
test('normalization preserves backend images, identity, category and stock', () => {
  const input = {
    id: 1,
    arType: 'SHIRT',
    price: '12.50',
    imageUrl: '/real-shirt.png',
    categoryId: 902,
    stockQuantity: 7,
  };
  const p = normalizeProduct(input);
  assert.equal(p.price, 12.5);
  assert.equal(p.id, 1);
  assert.equal(p.categoryId, 902);
  assert.equal(p.imageUrl, input.imageUrl);
  assert.equal(p.shirtAR.asset, input.imageUrl);
  assert.equal(p.stockQuantity, 7);
  assert.equal(normalizeProduct({ arType: 'EYEWEAR', price: 0 }).imageUrl, undefined);
});
test('missing or unsafe image URLs never acquire fallback photos', () => {
  for (const input of [
    null,
    undefined,
    '',
    'javascript:alert(1)',
    'data:text/html,bad',
    '//foreign.example/image',
  ])
    assert.equal(imageSource(input), null);
  for (const input of [
    '/assets/real.png',
    'https://example.com/real.png',
    'http://localhost:8080/image.png',
    './real.png',
  ])
    assert.equal(imageSource(input), input);
});
