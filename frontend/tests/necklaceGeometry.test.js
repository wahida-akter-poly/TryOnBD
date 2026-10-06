import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measureNecklace,
  smoothNecklace,
  updateNecklaceTracking,
  necklaceVisibility,
} from '../src/components/tryon/necklaceGeometry.js';
import {
  necklaceCalibration,
  necklaceStyles,
} from '../src/components/tryon/necklaceCalibration.js';

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

test('frontal shoulder fallback places necklace near the neck with finite transform values', () => {
  const geometry = measureNecklace(poseFixture(), 800, 800);
  assert.ok(geometry);
  assert.equal(Math.round(geometry.shoulderMidpoint.x), 400);
  assert.ok(geometry.neckAnchor.y < geometry.shoulderMidpoint.y);
  assert.ok(geometry.center.y > geometry.neckAnchor.y);
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
  assert.ok(geometry.neckAnchor.y < geometry.shoulderMidpoint.y);
  assert.ok(geometry.center.y > geometry.neckAnchor.y);
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

function headFixture({ nose = [0.5, 0.16], mouthY = 0.205, confidence = 1 } = {}) {
  const pose = poseFixture();
  const point = (x, y) => ({ x, y, z: 0, visibility: confidence, presence: confidence });
  pose.landmarks[0] = point(...nose);
  pose.landmarks[9] = point(nose[0] - 0.025, mouthY);
  pose.landmarks[10] = point(nose[0] + 0.025, mouthY);
  return pose;
}
const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

test('head fusion uses nose and mouth from the same pose result and stays between head and shoulders', () => {
  const pose = headFixture();
  const geometry = measureNecklace(pose, 800, 800);
  assert.equal(geometry.anchorMode, 'pose-head');
  assert.deepEqual(geometry.headSources, ['nose', 'mouth']);
  assert.ok(geometry.neckAnchor.y > pose.landmarks[9].y * 800);
  assert.ok(geometry.neckAnchor.y < geometry.shoulderMidpoint.y);
  assert.ok(geometry.headWeight > 0 && geometry.headWeight < 1);
  assert.ok(finite(geometry));
});

test('moving only the head changes the neck height but never shoulder scale or roll', () => {
  const lower = measureNecklace(headFixture({ nose: [0.5, 0.18], mouthY: 0.22 }), 800, 800);
  const higher = measureNecklace(headFixture({ nose: [0.5, 0.12], mouthY: 0.17 }), 800, 800);
  assert.ok(higher.neckAnchor.y < lower.neckAnchor.y);
  near(higher.shoulderWidth, lower.shoulderWidth);
  near(higher.width, lower.width);
  near(higher.scale, lower.scale);
  near(higher.rotation, lower.rotation);
});

test('valid nose alone and valid mouth alone remain usable head references', () => {
  const noseOnly = headFixture();
  noseOnly.landmarks[9] = noseOnly.landmarks[10] = null;
  const noseGeometry = measureNecklace(noseOnly, 800, 800);
  assert.equal(noseGeometry.anchorMode, 'pose-head');
  assert.deepEqual(noseGeometry.headSources, ['nose']);
  const mouthOnly = headFixture();
  mouthOnly.landmarks[0] = null;
  const mouthGeometry = measureNecklace(mouthOnly, 800, 800);
  assert.equal(mouthGeometry.anchorMode, 'pose-head');
  assert.deepEqual(mouthGeometry.headSources, ['mouth']);
});

test('missing, weak, nonfinite and anatomically invalid head data use shoulder fallback', () => {
  const baseline = measureNecklace(poseFixture(), 800, 800);
  const cases = [
    headFixture({ confidence: 0.2 }),
    headFixture({ nose: [0.5, 0.6], mouthY: 0.7 }),
    headFixture({ nose: [1.7, 0.16] }),
  ];
  const missing = headFixture();
  for (const id of [0, 9, 10]) missing.landmarks[id] = null;
  cases.push(missing);
  const invalid = headFixture();
  for (const id of [0, 9, 10]) invalid.landmarks[id].x = NaN;
  cases.push(invalid);
  const badConfidence = headFixture();
  for (const id of [0, 9, 10]) badConfidence.landmarks[id].visibility = NaN;
  cases.push(badConfidence);
  for (const pose of cases) {
    const geometry = measureNecklace(pose, 800, 800);
    assert.equal(geometry.anchorMode, 'shoulders');
    assert.equal(geometry.headWeight, 0);
    assert.deepEqual(geometry.neckAnchor, baseline.neckAnchor);
    near(geometry.width, baseline.width);
    assert.ok(finite(geometry));
  }
});

test('head confidence gradually reduces fusion instead of moving directly to a new anchor', () => {
  const strong = measureNecklace(headFixture({ confidence: 1 }), 800, 800);
  const weak = measureNecklace(headFixture({ confidence: 0.65 }), 800, 800);
  const fallback = measureNecklace(poseFixture(), 800, 800);
  assert.ok(weak.headWeight > 0 && weak.headWeight < strong.headWeight);
  assert.ok(
    Math.abs(weak.neckAnchor.y - fallback.neckAnchor.y) <
      Math.abs(strong.neckAnchor.y - fallback.neckAnchor.y),
  );
});

test('shoulder rotation defines the local fused neck frame and mirrors consistently', () => {
  const pose = headFixture();
  pose.landmarks[12].y = 0.29;
  pose.landmarks[11].y = 0.35;
  const geometry = measureNecklace(pose, 800, 800);
  const mirrored = measureNecklace(pose, 800, 800, true);
  assert.ok(geometry.rotation > 0);
  near(mirrored.rotation, -geometry.rotation);
  near(mirrored.neckAnchor.x, 800 - geometry.neckAnchor.x);
  near(mirrored.neckAnchor.y, geometry.neckAnchor.y);
  near(mirrored.width, geometry.width);
});

test('frame-rate-aware EMA smooths head motion, dropout and recovery', () => {
  const start = measureNecklace(headFixture(), 800, 800);
  const next = measureNecklace(headFixture({ nose: [0.54, 0.12], mouthY: 0.17 }), 800, 800);
  const smoothed = smoothNecklace(start, next, 33);
  assert.ok(
    smoothed.neckAnchor.y < start.neckAnchor.y && smoothed.neckAnchor.y > next.neckAnchor.y,
  );
  assert.ok(
    smoothed.neckAnchor.x > start.neckAnchor.x && smoothed.neckAnchor.x < next.neckAnchor.x,
  );
  const fallback = measureNecklace(poseFixture(), 800, 800);
  const dropout = smoothNecklace(start, fallback, 33);
  assert.ok(
    dropout.neckAnchor.y > start.neckAnchor.y && dropout.neckAnchor.y < fallback.neckAnchor.y,
  );
  const restored = smoothNecklace(dropout, start, 33);
  assert.ok(
    restored.neckAnchor.y < dropout.neckAnchor.y && restored.neckAnchor.y > start.neckAnchor.y,
  );
  const once = smoothNecklace(start, next, 66);
  const twice = smoothNecklace(smoothed, next, 33);
  near(once.neckAnchor.y, twice.neckAnchor.y);
});

test('head loss retains active shoulders; shoulder loss keeps the existing hold/fade', () => {
  const first = updateNecklaceTracking(null, measureNecklace(headFixture(), 800, 800), 100);
  const fallback = updateNecklaceTracking(first, measureNecklace(poseFixture(), 800, 800), 133);
  assert.equal(fallback.tracking, 'Active');
  assert.equal(fallback.geometry.anchorMode, 'shoulders');
  const lost = updateNecklaceTracking(fallback, null, 160);
  assert.equal(lost.geometry, fallback.geometry);
  assert.equal(necklaceVisibility(lost, 133 + 260), 1);
  near(necklaceVisibility(lost, 133 + 260 + 225), 0.5);
  assert.equal(necklaceVisibility(lost, 133 + 710), 0);
  const missingShoulders = headFixture();
  missingShoulders.landmarks[11] = null;
  assert.equal(measureNecklace(missingShoulders, 800, 800), null);
});

test('style calibration puts chokers higher and wider, and pendants lower with more drop', () => {
  const measure = (style) => measureNecklace(headFixture(), 800, 800, false, necklaceStyles[style]);
  const choker = measure('CHOKER'),
    short = measure('SHORT'),
    pendant = measure('PENDANT');
  assert.deepEqual(choker.neckAnchor, short.neckAnchor);
  assert.deepEqual(pendant.neckAnchor, short.neckAnchor);
  assert.ok(choker.center.y < short.center.y && short.center.y < pendant.center.y);
  assert.ok(choker.width > short.width && short.width > pendant.width);
  assert.ok(choker.pendant.y - choker.center.y < short.pendant.y - short.center.y);
  assert.ok(short.pendant.y - short.center.y < pendant.pendant.y - pendant.center.y);
  for (const geometry of [choker, short, pendant]) assert.ok(finite(geometry));
});

test('four backend products select calibration without IDs, categories, new assets or components', () => {
  // Metadata fixtures only: no products are inserted into the database.
  const products = [
    {
      id: 4,
      name: 'Silver Diamond Necklace',
      imageUrl: '/assets/products/jewelry/silver-diamond-necklace/front.png',
      expected: 'SHORT',
    },
    {
      id: 85,
      name: 'Pearl Choker',
      imageUrl: '/assets/jewelry/necklaces/pearl-choker.png',
      expected: 'CHOKER',
    },
    {
      id: 120,
      name: 'Evening Necklace',
      imageUrl: '/assets/jewelry/necklaces/evening-short.png',
      expected: 'SHORT',
    },
    {
      id: 902,
      name: 'Stone Pendant Necklace',
      imageUrl: '/assets/jewelry/necklaces/stone-pendant.png',
      expected: 'PENDANT',
    },
  ];
  for (const product of products) {
    const fit = necklaceCalibration(product);
    assert.equal(fit.style, product.expected);
    assert.equal(
      measureNecklace(headFixture(), 800, 800, false, fit).calibrationStyle,
      product.expected,
    );
    assert.equal(necklaceCalibration({ ...product, id: 3, categoryId: 7 }).style, product.expected);
    assert.ok(Object.isFrozen(fit));
  }
});

test('style name takes precedence, filename tokens decode safely, and unsupported names use SHORT', () => {
  assert.equal(necklaceCalibration({ name: 'Choker', imageUrl: '/short.png' }).style, 'CHOKER');
  assert.equal(necklaceCalibration({ imageUrl: '/pearl%20PENDANT.png' }).style, 'PENDANT');
  assert.equal(necklaceCalibration({ imageUrl: '/pearl_choker.png' }).style, 'CHOKER');
  assert.equal(
    necklaceCalibration({ name: 'Short necklace', imageUrl: '/pendant.png' }).style,
    'SHORT',
  );
  assert.equal(necklaceCalibration({ imageUrl: '/necklace.png?style=CHOKER' }).style, 'SHORT');
  assert.equal(necklaceCalibration({ imageUrl: '/bad%XX.png' }).style, 'SHORT');
  assert.equal(necklaceCalibration({ name: 'Unclassified necklace' }).style, 'SHORT');
  assert.equal(necklaceCalibration(null).style, 'SHORT');
});

test('invalid canvas sizes and nonfinite shoulder confidence do not produce geometry', () => {
  for (const [width, height] of [
    [0, 800],
    [800, 0],
    [NaN, 800],
    [800, Infinity],
  ])
    assert.equal(measureNecklace(headFixture(), width, height), null);
  const pose = headFixture();
  pose.landmarks[11].visibility = NaN;
  assert.equal(measureNecklace(pose, 800, 800), null);
});
