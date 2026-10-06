import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleAssetBounds, necklaceDrawRect } from '../src/components/tryon/necklaceAssets.js';

test('visible necklace bounds exclude transparent margins and faint noise', () => {
  const data = new Uint8ClampedArray(10 * 12 * 4);
  for (let y = 4; y < 9; y++) for (let x = 2; x < 8; x++) data[(y * 10 + x) * 4 + 3] = 255;
  data[3] = 4;
  assert.deepEqual(visibleAssetBounds({ data, width: 10, height: 12 }), {
    x: 2,
    y: 4,
    width: 6,
    height: 5,
  });
  assert.equal(visibleAssetBounds({ data: new Uint8ClampedArray(16), width: 2, height: 2 }), null);
});

test('different product aspect ratios retain proportions using shoulder width', () => {
  const wide = necklaceDrawRect({ width: 100, height: 50 }, { width: 240, shoulderWidth: 300 });
  assert.equal(wide.x, -120);
  assert.equal(wide.width, 240);
  assert.equal(wide.height, 120);
  assert.ok(Math.abs(wide.y + 28.8) < 1e-9);
  const tall = necklaceDrawRect({ width: 100, height: 100 }, { width: 240, shoulderWidth: 300 });
  assert.equal(tall.height, 240);
  assert.equal(tall.width, 240);
});

test('renderer uses measured neck placement without applying a second shoulder offset', () => {
  const geometry = { width: 216, shoulderWidth: 300, center: { x: 320, y: 350 } };
  const before = structuredClone(geometry);
  const rect = necklaceDrawRect({ width: 1200, height: 600 }, geometry);
  assert.ok(Math.abs(rect.y - -108 * 0.24) < 1e-9);
  assert.deepEqual(geometry, before);
  const scaled = necklaceDrawRect({ width: 1200, height: 600 }, { width: 432, shoulderWidth: 600 });
  assert.equal(scaled.y, rect.y * 2);
});
