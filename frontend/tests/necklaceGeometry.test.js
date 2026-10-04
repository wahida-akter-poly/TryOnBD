import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measureNecklace,
  smoothNecklace,
  updateNecklaceTracking,
  necklaceVisibility,
} from '../src/components/tryon/necklaceGeometry.js';

function poseFixture({ left = [0.34, 0.32], right = [0.66, 0.32], visibility = 1 } = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
    presence: 1,
  }));
  landmarks[11] = { x: right[0], y: right[1], z: 0, visibility, presence: 1 };
  landmarks[12] = { x: left[0], y: left[1], z: 0, visibility, presence: 1 };
  return { landmarks };
}

const finite = (geometry) =>
  [
    geometry.center.x,
    geometry.center.y,
    geometry.pendant.x,
    geometry.pendant.y,
    geometry.width,
    geometry.height,
    geometry.rotation,
    geometry.scale,
    geometry.xCompression,
  ].every(Number.isFinite);

test('frontal shoulders place necklace below the neckline with finite transform values', () => {
  const geometry = measureNecklace(poseFixture(), 800, 800);
  assert.ok(geometry);
  assert.equal(Math.round(geometry.shoulderMidpoint.x), 400);
  assert.ok(geometry.center.y > geometry.shoulderMidpoint.y);
  assert.ok(geometry.pendant.y > geometry.center.y);
  assert.ok(Math.abs(geometry.rotation) < 1e-8);
  assert.ok(finite(geometry));
});

test('tilted shoulders rotate the necklace with the shoulder line', () => {
  const geometry = measureNecklace(
    poseFixture({ left: [0.34, 0.28], right: [0.66, 0.36] }),
    800,
    800,
  );
  assert.ok(geometry.rotation > 0.1);
  assert.ok(geometry.center.y > geometry.shoulderMidpoint.y);
});

test('larger shoulder distance increases necklace scale', () => {
  const small = measureNecklace(poseFixture({ left: [0.4, 0.32], right: [0.6, 0.32] }), 800, 800);
  const large = measureNecklace(poseFixture({ left: [0.28, 0.32], right: [0.72, 0.32] }), 800, 800);
  assert.ok(large.scale > small.scale);
  assert.ok(large.width > small.width);
});

test('smaller shoulder distance reduces necklace scale', () => {
  const base = measureNecklace(poseFixture(), 800, 800);
  const smaller = measureNecklace(
    poseFixture({ left: [0.39, 0.32], right: [0.61, 0.32] }),
    800,
    800,
  );
  assert.ok(smaller.scale < base.scale);
  assert.ok(smaller.height < base.height);
});

test('invalid or missing shoulders safely return null or a lost tracking fallback', () => {
  assert.equal(measureNecklace(null, 800, 800), null);
  assert.equal(measureNecklace(poseFixture({ visibility: 0.2 }), 800, 800), null);
  const first = updateNecklaceTracking(null, measureNecklace(poseFixture(), 800, 800), 0);
  const lost = updateNecklaceTracking(first, null, 100);
  assert.equal(lost.tracking, 'Lost');
  assert.equal(lost.geometry, first.geometry);
  assert.ok(necklaceVisibility(lost, 200) > 0);
});

test('motion smoothing keeps values finite and moves toward the new pose', () => {
  const start = measureNecklace(poseFixture(), 800, 800);
  const next = measureNecklace(poseFixture({ left: [0.3, 0.3], right: [0.72, 0.36] }), 800, 800);
  const smooth = smoothNecklace(start, next, 33);
  assert.ok(finite(smooth));
  assert.ok(smooth.width > start.width && smooth.width < next.width);
  assert.ok(smooth.rotation > start.rotation && smooth.rotation < next.rotation);
});
