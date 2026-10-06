import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import { shirtCalibration } from '../src/data/shirtProducts.js';
import { shirtPreviewProduct } from './fixtures/shirtProduct.js';
import {
  measureTorso,
  poseToCanvas,
  torsoQuad,
  smoothTorso,
  updateShirtTracking,
  shirtVisibility,
  shirtPoseLandmarks,
} from '../src/components/tryon/shirtGeometry.js';
import {
  buildShirtMesh,
  shirtMeshPoint,
  shirtBodyPoint,
} from '../src/components/tryon/shirtWarp.js';
import { measureShirtAlpha } from '../src/components/tryon/shirtAssets.js';
import {
  structuredGarmentGeometry,
  torsoPanelPoint,
  sleevePatchPoint,
} from '../src/components/tryon/structuredShirtGeometry.js';
import { armOcclusionMasks, capsulePolygon } from '../src/components/tryon/shirtOcclusion.js';
import { shirtSourceMeasurement } from '../src/data/structuredShirtCalibration.js';

export function torsoFixture({ scale = 1, x = 0, y = 0, roll = 0, yaw = 0 } = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
    presence: 1,
  }));
  const worldLandmarks = landmarks.map((p) => ({ ...p }));
  for (const [id, px, py] of [
    [12, 0.34, 0.29],
    [11, 0.66, 0.29],
    [24, 0.38, 0.75],
    [23, 0.62, 0.75],
    [14, 0.26, 0.49],
    [13, 0.74, 0.49],
    [16, 0.21, 0.7],
    [15, 0.79, 0.7],
  ]) {
    const dx = (px - 0.5) * 800,
      dy = (py - 0.5) * 800;
    landmarks[id] = {
      ...landmarks[id],
      x: 0.5 + ((dx * Math.cos(roll) - dy * Math.sin(roll)) * scale) / 800 + x,
      y: 0.5 + ((dx * Math.sin(roll) + dy * Math.cos(roll)) * scale) / 800 + y,
      z: (px - 0.5) * Math.tan((yaw * Math.PI) / 180),
    };
    worldLandmarks[id] = {
      ...worldLandmarks[id],
      x: px,
      y: py,
      z: (px - 0.5) * Math.tan((yaw * Math.PI) / 180),
    };
  }
  return { landmarks, worldLandmarks };
}
const fit = shirtCalibration(shirtPreviewProduct);
const body = (options) => measureTorso(torsoFixture(options), 800, 800);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

test('shirt landmark indices match installed official shoulder/elbow/hip connections', () => {
  assert.deepEqual(shirtPoseLandmarks, {
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
  });
  for (const [start, end] of [
    [11, 13],
    [12, 14],
    [13, 15],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
  ])
    assert.ok(PoseLandmarker.POSE_CONNECTIONS.some((p) => p.start === start && p.end === end));
});
test('shoulder midpoint and width use intrinsic canvas pixels', () => {
  const b = body();
  close(b.shoulderMidpoint.x, 400);
  close(b.shoulderMidpoint.y, 232);
  close(b.shoulderWidth, 256);
});
test('hip midpoint and torso height are independent of shoulder span', () => {
  const b = body();
  close(b.hipMidpoint.x, 400);
  close(b.hipMidpoint.y, 600);
  close(b.torsoHeight, 368);
  close(b.hipWidth, 192);
  const p = torsoFixture();
  p.landmarks[23].y += 0.05;
  p.landmarks[24].y += 0.05;
  const longer = measureTorso(p, 800, 800);
  close(longer.shoulderWidth, b.shoulderWidth);
  close(longer.torsoHeight, b.torsoHeight + 40);
});
test('roll follows shoulders instead of image axes', () => {
  close(body({ roll: 0.2 }).roll, 0.2);
});
test('one mirror conversion preserves aspect and pairs the visible sides with their elbows/hips', () => {
  assert.deepEqual(poseToCanvas({ x: 0.25, y: 0.5, z: -0.2 }, 1280, 720, true), {
    x: 960,
    y: 360,
    z: -0.2,
    confidence: 1,
  });
  const b = measureTorso(torsoFixture({ x: 0.06 }), 800, 800, true);
  assert.equal(b.left.ids.shoulder, 11);
  assert.equal(b.left.ids.elbow, 13);
  close(b.shoulderMidpoint.x, 352);
});
test('quad has realistic padding, taper, collar and hem extension; frontal fit is symmetric', () => {
  const g = torsoQuad(body(), fit),
    [tl, tr, br, bl] = g.quad;
  close(g.topCenter.x - tl.x, tr.x - g.topCenter.x);
  close(g.hemCenter.x - bl.x, br.x - g.hemCenter.x);
  assert.ok(tl.x < g.left.shoulder.x && tr.x > g.right.shoulder.x);
  assert.ok(bl.x < g.left.hip.x && br.x > g.right.hip.x);
  assert.ok(g.hemCenter.y > g.hipMidpoint.y);
  assert.ok(g.collar.y > 180 && g.collar.y < 260);
  assert.equal(g.state, 'FRONTAL');
});
test('opposite body turns reverse near/far perspective without moving the collar off the torso', () => {
  for (const yaw of [-25, 25]) {
    const g = torsoQuad(body({ yaw }), fit),
      [tl, tr] = g.quad;
    close(g.yaw, yaw);
    assert.ok(
      yaw > 0
        ? g.topCenter.x - tl.x > tr.x - g.topCenter.x
        : g.topCenter.x - tl.x < tr.x - g.topCenter.x,
    );
    close(g.collar.x, body().shoulderMidpoint.x);
  }
  close(measureTorso(torsoFixture({ yaw: 25 }), 800, 800, true).yaw, -25);
});
test('image-space depth fallback stays bounded if world landmarks are unavailable', () => {
  const p = torsoFixture({ yaw: 20 });
  delete p.worldLandmarks;
  close(measureTorso(p, 800, 800).yaw, 20);
  delete p.landmarks[11].z;
  delete p.landmarks[12].z;
  delete p.landmarks[23].z;
  delete p.landmarks[24].z;
  close(measureTorso(p, 800, 800).yaw, 0);
});
test('moving closer scales both body measurements and mesh; moving away restores them', () => {
  const a = body({ scale: 0.7 }),
    b = body({ scale: 1.2 });
  close(b.shoulderWidth / a.shoulderWidth, 1.2 / 0.7);
  close(b.torsoHeight / a.torsoHeight, 1.2 / 0.7);
  const x = torsoQuad(a, fit),
    y = torsoQuad(b, fit);
  close((y.quad[1].x - y.quad[0].x) / (x.quad[1].x - x.quad[0].x), 1.2 / 0.7);
});
test('landmarks, independent sizes, roll, yaw and quad smoothing converge without snapping', () => {
  const old = body(),
    next = body({ x: 0.02, scale: 1.1, roll: 0.12, yaw: 25 });
  let smoothed = smoothTorso(old, next, 33);
  assert.ok(smoothed.left.shoulder.x !== next.left.shoulder.x);
  assert.ok(
    smoothed.shoulderWidth > old.shoulderWidth && smoothed.shoulderWidth < next.shoulderWidth,
  );
  assert.ok(smoothed.roll > 0 && smoothed.roll < 0.12 && smoothed.yaw > 0 && smoothed.yaw < 25);
  for (let i = 0; i < 35; i++) smoothed = smoothTorso(smoothed, next, 33);
  assert.ok(Math.abs(smoothed.yaw - next.yaw) < 0.01);
  const first = updateShirtTracking(null, old, fit, 0);
  const moved = updateShirtTracking(first, next, fit, 33);
  assert.notDeepEqual(moved.geometry.quad, torsoQuad(next, fit).quad);
});
test('weak, missing, nonfinite and crossed body landmarks are rejected with useful messages', () => {
  assert.match(measureTorso(null, 800, 800).error, /No person/);
  for (const id of [11, 12, 23, 24]) {
    const p = torsoFixture();
    p.landmarks[id].visibility = 0.2;
    assert.ok(measureTorso(p, 800, 800).error);
    p.landmarks[id].visibility = 1;
    p.landmarks[id].x = NaN;
    assert.ok(measureTorso(p, 800, 800).error);
  }
});
test('single-frame jumps hold previous geometry; weak landmarks hold then fade and reacquire', () => {
  const first = updateShirtTracking(null, body(), fit, 0);
  const jumped = body();
  for (const side of ['left', 'right'])
    for (const part of ['shoulder', 'hip']) jumped[side][part].x += 500;
  const held = updateShirtTracking(first, jumped, fit, 66);
  assert.equal(held.geometry, first.geometry);
  const lost = updateShirtTracking(held, { error: 'Keep both hips in view.' }, fit, 120);
  assert.equal(lost.geometry, first.geometry);
  close(shirtVisibility(lost, 200), 1);
  close(shirtVisibility(lost, 475), 0.5);
  close(shirtVisibility(lost, 700), 0);
  const restored = updateShirtTracking(lost, body({ x: 0.05 }), fit, 1000);
  close(restored.geometry.shoulderMidpoint.x, 440);
});
test('sleeves respond to elbows while seams, collar and torso stay attached and unchanged', () => {
  const b = body(),
    g = torsoQuad(b, fit),
    s = fit.sourceLandmarks;
  const raised = structuredClone(b);
  raised.left.elbow = { ...b.left.elbow, x: 140, y: 250 };
  const changed = torsoQuad(raised, fit);
  assert.deepEqual(g.quad, changed.quad);
  assert.deepEqual(g.collar, changed.collar);
  assert.deepEqual(
    shirtMeshPoint(s.leftShoulder.x, s.leftShoulder.y, g, fit),
    shirtMeshPoint(s.leftShoulder.x, s.leftShoulder.y, changed, fit),
  );
  assert.notDeepEqual(
    shirtMeshPoint(s.leftSleeveEnd.x, s.leftSleeveEnd.y, g, fit),
    shirtMeshPoint(s.leftSleeveEnd.x, s.leftSleeveEnd.y, changed, fit),
  );
  assert.deepEqual(shirtMeshPoint(0.5, 0.6, g, fit), shirtMeshPoint(0.5, 0.6, changed, fit));
  assert.ok(
    buildShirtMesh(changed, fit)
      .vertices.flat()
      .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  );
});
test('product calibration remains local, mergeable and rejects invalid source metadata', () => {
  assert.equal(shirtPreviewProduct.previewOnly, true);
  assert.equal(shirtPreviewProduct.stockQuantity, 0);
  assert.equal(fit.asset, '/assets/products/clothing/black-t-shirt/front.png');
  const custom = shirtCalibration({ shirtAR: { widthMultiplier: 1.1, collarOffsetY: 0.02 } });
  const g = torsoQuad(body(), custom);
  assert.ok(g.collar.y > body().shoulderMidpoint.y);
  assert.throws(() => shirtCalibration({ shirtAR: { widthMultiplier: NaN } }));
  assert.throws(() =>
    shirtCalibration({ shirtAR: { sourceLandmarks: { leftShoulder: { x: 0.9, y: 0.1 } } } }),
  );
});
test('off-centre source collar maps exactly to the calibrated neck anchor', () => {
  const custom = shirtCalibration({
    shirtAR: {
      collarOffsetX: 0.04,
      sourceLandmarks: {
        leftCollar: { x: 0.44, y: 0.12 },
        rightCollar: { x: 0.66, y: 0.12 },
      },
    },
  });
  const g = torsoQuad(body({ yaw: 20, roll: 0.1 }), custom);
  const p = shirtBodyPoint(0.55, 0.12, g, custom);
  close(p.x, g.collar.x);
  close(p.y, g.collar.y);
});

test('perspective eases continuously out of the symmetric frontal dead zone', () => {
  const center = torsoQuad(body({ yaw: 3 }), fit);
  const justTurned = torsoQuad(body({ yaw: 3.00001 }), fit);
  close(center.quad[0].x, justTurned.quad[0].x);
  const left = torsoQuad(body({ yaw: -2 }), fit),
    right = torsoQuad(body({ yaw: 2 }), fit);
  assert.deepEqual(left.quad, right.quad);
});

test('shirt visible bounds ignore alpha dust without mutating source data', () => {
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  pixels[3] = 1;
  pixels[(3 * 8 + 2) * 4 + 3] = 255;
  pixels[(5 * 8 + 6) * 4 + 3] = 128;
  assert.deepEqual(measureShirtAlpha(pixels, 8, 8), { x: 2, y: 3, width: 5, height: 3 });
  assert.equal(pixels[3], 1);
  assert.equal(measureShirtAlpha(new Uint8ClampedArray(8 * 8 * 4), 8, 8), null);
});

test('structured collar maps all four curved crew-neck anchors exactly around the base of neck', () => {
  for (const options of [{}, { roll: 0.2, yaw: 25 }, { roll: -0.1, yaw: -25 }]) {
    const b = body(options),
      g = structuredGarmentGeometry(b, fit),
      s = fit.sourceLandmarks;
    for (const [source, target] of [
      [s.collarLeft, g.leftNeckAnchor],
      [s.collarCenterTop, g.collarCenterTop],
      [s.collarCenterBottom, g.collarCenterBottom],
      [s.collarRight, g.rightNeckAnchor],
    ]) {
      const p = torsoPanelPoint(source.x, source.y, g, fit);
      close(p.x, target.x);
      close(p.y, target.y);
    }
    assert.ok(
      Math.hypot(
        g.collarCenterBottom.x - b.shoulderMidpoint.x,
        g.collarCenterBottom.y - b.shoulderMidpoint.y,
      ) <
        b.shoulderWidth * 0.19,
    );
  }
});
test('structured shoulder seams and sleeve attachment match eased body shoulders', () => {
  const b = body(),
    g = structuredGarmentGeometry(b, fit),
    s = fit.sourceLandmarks;
  for (const side of ['left', 'right']) {
    for (const region of [fit.sourceRegions.torso, fit.sourceRegions[`${side}Sleeve`]])
      for (const source of [s[`${side}ShoulderSeam`], s[`${side}Armpit`]])
        assert.ok(
          region.some((p) => p.x === source.x && p.y === source.y),
          'source seam must be shared',
        );
    close(fit.seamOverlapRatio, 0.03);
    const source = s[`${side}ShoulderSeam`],
      target = g[`${side}Sleeve`].seamTop;
    const p = torsoPanelPoint(source.x, source.y, g, fit);
    close(p.x, target.x);
    close(p.y, target.y);
    close(
      Math.hypot(target.x - b[side].shoulder.x, target.y - b[side].shoulder.y),
      b.shoulderWidth * Math.hypot(fit.seamEase, fit.seamRise),
    );
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const src = sleevePatchPoint(0, v, g, side, fit, true),
        sleeve = sleevePatchPoint(0, v, g, side, fit);
      assert.deepEqual(sleeve, torsoPanelPoint(src.x, src.y, g, fit));
    }
  }
});
for (const side of ['left', 'right'])
  test(`${side} structured cuff uses 57% of upper arm and ends well above elbow`, () => {
    const b = body(),
      g = structuredGarmentGeometry(b, fit),
      s = g[`${side}Sleeve`];
    close(s.lengthRatio, 0.57);
    close(
      Math.hypot(s.cuffCenter.x - s.seamTop.x, s.cuffCenter.y - s.seamTop.y),
      s.armLength * 0.57,
    );
    assert.ok(
      Math.hypot(s.cuffCenter.x - b[side].elbow.x, s.cuffCenter.y - b[side].elbow.y) >
        s.armLength * 0.4,
    );
  });
test('raising the left upper arm rotates only its separate sleeve, leaving torso and right sleeve fixed', () => {
  const b = body(),
    before = buildShirtMesh(b, fit),
    raised = structuredClone(b);
  raised.left.elbow = { ...b.left.elbow, x: 120, y: 160 };
  raised.left.wrist = { ...b.left.wrist, x: 60, y: 80 };
  const after = buildShirtMesh(raised, fit);
  assert.deepEqual(before.torso, after.torso);
  assert.deepEqual(before.rightSleeve, after.rightSleeve);
  assert.notDeepEqual(before.leftSleeve.vertices, after.leftSleeve.vertices);
  assert.deepEqual(before.garment.seamLeft, after.garment.seamLeft);
  assert.ok(after.garment.leftSleeve.angle !== before.garment.leftSleeve.angle);
});
test('raising the right upper arm preserves every torso vertex and the left sleeve', () => {
  const b = body(),
    before = buildShirtMesh(b, fit),
    raised = structuredClone(b);
  raised.right.elbow = { ...b.right.elbow, x: 680, y: 150 };
  const after = buildShirtMesh(raised, fit);
  assert.deepEqual(before.torso.vertices, after.torso.vertices);
  assert.deepEqual(before.leftSleeve, after.leftSleeve);
  assert.notDeepEqual(before.rightSleeve, after.rightSleeve);
});
test('structured frontal chest/waist/hem and sleeve widths are symmetric', () => {
  const g = structuredGarmentGeometry(body(), fit);
  for (const row of g.torso.rows) close(row.center.x - row.left.x, row.right.x - row.center.x);
  close(g.leftSleeve.cuffWidth, g.rightSleeve.cuffWidth);
  close(g.leftSleeve.projectedLength, g.rightSleeve.projectedLength);
  assert.ok(g.torso.height < body().torsoHeight * 1.05);
});
test('missing elbows keep sleeves in a resting direction that rotates with shoulder roll', () => {
  const b = body();
  b.left.elbow = b.right.elbow = null;
  const resting = structuredGarmentGeometry(b, fit);
  b.roll += 0.2;
  const tilted = structuredGarmentGeometry(b, fit);
  for (const side of ['leftSleeve', 'rightSleeve']) {
    close(tilted[side].angle - resting[side].angle, 0.2);
    close(tilted[side].lengthRatio, 0.57);
  }
});
test('left/right torso turns independently reverse near chest and sleeve perspective', () => {
  const a = structuredGarmentGeometry(body({ yaw: 25 }), fit),
    b = structuredGarmentGeometry(body({ yaw: -25 }), fit);
  assert.ok(a.leftSleeve.cuffWidth > a.rightSleeve.cuffWidth);
  assert.ok(b.rightSleeve.cuffWidth > b.leftSleeve.cuffWidth);
  for (const g of [a, b])
    for (const side of ['left', 'right'])
      assert.ok(
        g[`${side}Sleeve`].lengthRatio >= fit.sleeveMinLengthRatio &&
          g[`${side}Sleeve`].lengthRatio <= fit.sleeveMaxLengthRatio,
      );
  const row = a.torso.rows[1];
  assert.ok(row.center.x - row.left.x > row.right.x - row.center.x);
});
test('tapered arm capsules restore distal upper arms and forearms rather than shoulder/cuff areas', () => {
  const b = body(),
    g = structuredGarmentGeometry(b, fit),
    masks = armOcclusionMasks(b, g, fit);
  assert.equal(masks.length, 6);
  for (const mask of masks) {
    const polygon = capsulePolygon(mask);
    assert.equal(polygon.length, 18);
    assert.ok(polygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.ok(mask.ra > 0 && mask.rb > 0);
  }
  const mask = masks.find((m) => m.side === 'left' && m.part === 'upperArm');
  assert.ok(
    Math.hypot(mask.a.x - b.left.shoulder.x, mask.a.y - b.left.shoulder.y) >
      g.leftSleeve.projectedLength,
  );
  const missing = structuredClone(b);
  missing.left.wrist = null;
  assert.equal(armOcclusionMasks(missing, g, fit).filter((m) => m.side === 'left').length, 2);
});
test('depth rejects rearward arm occlusion while missing depth retains the geometric fallback', () => {
  const b = body(),
    g = structuredGarmentGeometry(b, fit);
  b.left.elbow.z = 0.5;
  b.left.wrist.z = 0.5;
  assert.equal(armOcclusionMasks(b, g, fit).filter((m) => m.side === 'left').length, 0);
  b.left.elbow.z = null;
  b.left.wrist.z = null;
  assert.equal(armOcclusionMasks(b, g, fit).filter((m) => m.side === 'left').length, 3);
});
test('missing hips can use bounded mirrored shoulder-only fitting after the stable hold', () => {
  const pose = torsoFixture();
  pose.landmarks[23].visibility = 0.1;
  pose.landmarks[24].visibility = 0.1;
  const measured = measureTorso(pose, 800, 800, false, { allowShoulderFallback: true, fit });
  assert.equal(measured.trackingMode, 'SHOULDERS_ONLY');
  assert.ok(measured.hipMidpoint.y > measured.shoulderMidpoint.y);
  const mirrored = measureTorso(pose, 800, 800, true, { allowShoulderFallback: true, fit });
  close(mirrored.hipMidpoint.x, measured.hipMidpoint.x);
  const first = updateShirtTracking(null, body(), fit, 0),
    held = updateShirtTracking(first, measured, fit, 100);
  assert.equal(held.geometry, first.geometry);
  const fallback = updateShirtTracking(held, measured, fit, 400);
  assert.equal(fallback.body.trackingMode, 'SHOULDERS_ONLY');
});
test('structured source calibration measures real collar/seams/cuffs/hem and keeps the supplied PNG unchanged', () => {
  const s = fit.sourceLandmarks;
  assert.equal(s.leftShoulderSeam.x, (269 - 91) / 1091);
  assert.equal(s.collarCenter.y, (174 - 56) / 1127);
  assert.deepEqual(Object.keys(fit.sourceRegions), ['torso', 'leftSleeve', 'rightSleeve']);
  for (const region of Object.values(fit.sourceRegions)) assert.ok(region.length >= 4);
  assert.equal(
    createHash('sha256')
      .update(
        readFileSync(
          new URL('../public/assets/products/clothing/black-t-shirt/front.png', import.meta.url),
        ),
      )
      .digest('hex')
      .toUpperCase(),
    shirtSourceMeasurement.sha256,
  );
  assert.throws(() => shirtCalibration({ shirtAR: { sleeveLengthRatio: 0.8 } }));
});
test('body-shape clamps prevent excessive torso stretch while allowing independent chest, waist and hem', () => {
  const b = body();
  b.torsoHeight *= 2.3;
  b.hipWidth *= 1.8;
  const g = structuredGarmentGeometry(b, fit);
  const source = fit.sourceLandmarks;
  const naturalHeight =
    (b.shoulderWidth * (source.hemLeft.y - source.leftShoulderSeam.y)) /
    ((source.rightShoulderSeam.x - source.leftShoulderSeam.x) * fit.sourceVisibleAspect);
  close(g.torso.height, naturalHeight * fit.maxLengthStretch * (1 + fit.hemLengthExtension));
  assert.ok(g.torso.height < b.shoulderWidth * 2.15);
  assert.ok(g.hipWidth <= b.shoulderWidth * 1.15);
  assert.ok(g.torso.rows.length >= 5);
  assert.notEqual(g.estimatedChestWidth, g.estimatedWaistWidth);
});

test('wrist motion leaves the whole torso mesh and hem exactly unchanged', () => {
  const b = body({ roll: 0.13, yaw: 22 }),
    before = buildShirtMesh(b, fit);
  for (const [x, y] of [
    [400, 210],
    [80, 700],
    [700, 400],
  ]) {
    const moved = structuredClone(b);
    moved.left.wrist = { x, y, z: -0.8 };
    moved.right.wrist = { x: 800 - x, y: y + 100, z: 0.6 };
    const after = buildShirtMesh(moved, fit);
    assert.deepEqual(after.torso, before.torso);
    assert.deepEqual(after.garment.torso.rows.at(-1), before.garment.torso.rows.at(-1));
    assert.deepEqual(after.leftSleeve, before.leftSleeve);
    assert.deepEqual(after.rightSleeve, before.rightSleeve);
  }
});

test('hands on hips keep torso centered and hem stable while elbows and hands move', () => {
  const b = body(),
    before = structuredGarmentGeometry(b, fit);
  b.left.elbow = { x: 180, y: 450 };
  b.right.elbow = { x: 620, y: 450 };
  b.left.wrist = { x: 305, y: 580 };
  b.right.wrist = { x: 495, y: 580 };
  const after = structuredGarmentGeometry(b, fit);
  assert.deepEqual(after.torso, before.torso);
  const hem = after.torso.rows.at(-1);
  close(hem.center.x, b.hipMidpoint.x);
  close(hem.left.y, hem.right.y);
  for (const side of ['left', 'right']) {
    assert.deepEqual(after[`${side}Sleeve`].seamTop, before[`${side}Sleeve`].seamTop);
    assert.notDeepEqual(after[`${side}Sleeve`].cuffCenter, before[`${side}Sleeve`].cuffCenter);
  }
});

test('hem follows the torso centerline rather than shoulder tilt and clamps extreme corner height differences', () => {
  for (const yaw of [-30, 0, 30]) {
    const b = body({ yaw });
    // One raised shoulder must not pull up the opposite hem corner.
    b.roll = 0.35;
    const g = structuredGarmentGeometry(b, fit),
      hem = g.torso.rows.at(-1);
    close(hem.left.y, hem.right.y);
    assert.deepEqual(g.torso.rows[0].left, g.seamLeft);
    for (const lean of [-180, 180]) {
      b.hipMidpoint.x = b.shoulderMidpoint.x + lean;
      const tilted = structuredGarmentGeometry(b, fit).torso.rows.at(-1);
      assert.ok(
        Math.abs(tilted.left.y - tilted.right.y) <=
          b.shoulderWidth * fit.hemMaxVerticalRatio + 1e-8,
      );
      close(Math.abs(tilted.left.y - tilted.right.y), b.shoulderWidth * fit.hemMaxVerticalRatio);
    }
  }
});

test('sleeve cuffs taper from measured visible alpha width and remain within calibrated targets at every supported yaw', () => {
  const alpha = fit.sourceSleeveAlphaBounds;
  close(alpha.left.width, shirtSourceMeasurement.regionAlphaBounds.leftSleeve.width / 1091);
  close(alpha.right.width, shirtSourceMeasurement.regionAlphaBounds.rightSleeve.width / 1091);
  for (const yaw of [-35, -20, 0, 20, 35]) {
    const g = structuredGarmentGeometry(body({ yaw }), fit);
    for (const side of ['left', 'right']) {
      const sleeve = g[`${side}Sleeve`];
      assert.ok(
        sleeve.lengthRatio >= fit.sleeveMinLengthRatio &&
          sleeve.lengthRatio <= fit.sleeveMaxLengthRatio,
      );
      close(sleeve.cuffWidth / sleeve.bodyWidth, 0.9);
      for (const v of [0, 0.25, 0.5, 0.75, 1]) {
        const source = sleevePatchPoint(0, v, g, side, fit, true);
        assert.deepEqual(
          sleevePatchPoint(0, v, g, side, fit),
          torsoPanelPoint(source.x, source.y, g, fit),
        );
      }
    }
  }
  assert.throws(() => shirtCalibration({ shirtAR: { sleeveLengthRatio: 0.44 } }));
  assert.throws(() =>
    shirtCalibration({
      shirtAR: { sourceSleeveAlphaBounds: { left: { x: 0, y: 0, width: 2, height: 1 } } },
    }),
  );
});

test('hands-on-hips arm masks stay anatomically tapered outside the central torso', () => {
  const b = body();
  b.left.elbow = { x: 180, y: 450, z: -0.1 };
  b.right.elbow = { x: 620, y: 450, z: -0.1 };
  b.left.wrist = { x: 305, y: 580, z: -0.1 };
  b.right.wrist = { x: 495, y: 580, z: -0.1 };
  const masks = armOcclusionMasks(b, structuredGarmentGeometry(b, fit), fit);
  assert.equal(masks.length, 6);
  for (const m of masks) {
    assert.ok(m.ra <= b.shoulderWidth * 0.045);
    assert.ok(Math.max(m.ra, m.rb) <= b.shoulderWidth * 0.045);
    for (const p of capsulePolygon(m))
      assert.ok(
        m.side === 'left' ? p.x < 335 : p.x > 465,
        'mask must not restore the central chest/waist',
      );
  }
  b.left.wrist = { x: b.left.elbow.x + 12, y: b.left.elbow.y + 12 };
  const short = armOcclusionMasks(b, structuredGarmentGeometry(b, fit), fit).find(
    (m) => m.side === 'left' && m.part === 'forearm',
  );
  assert.ok(short.ra <= Math.hypot(12, 12) * fit.armSegmentRadiusRatio);
});

test('crew-neck width and curved center stay within product bounds near the neck base', () => {
  for (const yaw of [-20, -10, 0, 10, 20]) {
    const b = body({ yaw, roll: 0.1 }),
      g = structuredGarmentGeometry(b, fit);
    const width =
      Math.hypot(
        g.rightNeckAnchor.x - g.leftNeckAnchor.x,
        g.rightNeckAnchor.y - g.leftNeckAnchor.y,
      ) / b.shoulderWidth;
    assert.ok(width >= fit.collarMinWidthRatio && width <= fit.collarMaxWidthRatio);
    close(width, 0.32);
    const offset =
      Math.hypot(
        g.collarCenterBottom.x - g.neckBaseCenter.x,
        g.collarCenterBottom.y - g.neckBaseCenter.y,
      ) / b.shoulderWidth;
    close(offset, 0.06);
    const down = g.torso.down;
    const depth =
      (g.collarCenterBottom.x - g.leftNeckAnchor.x) * down.x +
      (g.collarCenterBottom.y - g.leftNeckAnchor.y) * down.y;
    assert.ok(depth > b.shoulderWidth * 0.05, 'the crew neck must not become a straight line');
  }
  assert.throws(() => shirtCalibration({ shirtAR: { neckWidthRatio: 0.35 } }));
  assert.throws(() => shirtCalibration({ shirtAR: { collarVerticalOffset: 0.09 } }));
  assert.throws(() => shirtCalibration({ shirtAR: { seamOverlapRatio: 0.05 } }));
});

test('seven-percent hem extension preserves upper chest, torso centerline and hem tilt', () => {
  for (const options of [{}, { yaw: 15, roll: 0.2 }, { yaw: -20, roll: -0.15 }]) {
    const b = body(options),
      previous = structuredGarmentGeometry(b, { ...fit, hemLengthExtension: 0 });
    const current = structuredGarmentGeometry(b, fit);
    close(current.torso.height / previous.torso.height, 1.07);
    assert.deepEqual(current.torso.rows.slice(0, 3), previous.torso.rows.slice(0, 3));
    close(
      current.torso.rows.at(-1).right.y - current.torso.rows.at(-1).left.y,
      previous.torso.rows.at(-1).right.y - previous.torso.rows.at(-1).left.y,
    );
    assert.ok(current.torso.rows.at(-1).center.y > previous.torso.rows.at(-1).center.y);
    assert.deepEqual(current.collarCenterBottom, previous.collarCenterBottom);
  }
});

test('relaxed frontal sleeves point down along the upper arms with a proper tapered cuff', () => {
  const b = body(),
    g = structuredGarmentGeometry(b, fit);
  for (const side of ['left', 'right']) {
    const sleeve = g[`${side}Sleeve`],
      arm = b[side];
    assert.ok(sleeve.direction.y > 0.85);
    const alignment =
      ((arm.elbow.x - arm.shoulder.x) * sleeve.direction.x +
        (arm.elbow.y - arm.shoulder.y) * sleeve.direction.y) /
      sleeve.armLength;
    assert.ok(alignment > 0.99);
    assert.ok(sleeve.cuffCenter.y > sleeve.seamTop.y);
    close(sleeve.cuffWidth / sleeve.bodyWidth, 0.9);
  }
});

test('upper-arm restoration starts after the cuff with a small radius, without exposing upper chest', () => {
  const b = body(),
    g = structuredGarmentGeometry(b, fit);
  const masks = armOcclusionMasks(b, g, fit);
  for (const side of ['left', 'right']) {
    const [first, second] = masks.filter((m) => m.side === side && m.part === 'upperArm');
    assert.deepEqual(first.b, second.a);
    assert.ok(first.ra < first.rb);
    close(first.ra / first.rb, 0.4);
    assert.ok(second.rb < second.ra);
    const arm = b[side],
      sleeve = g[`${side}Sleeve`];
    for (const mask of masks.filter((m) => m.side === side))
      for (const p of capsulePolygon(mask)) {
        const phase =
          ((p.x - arm.shoulder.x) * sleeve.direction.x +
            (p.y - arm.shoulder.y) * sleeve.direction.y) /
          sleeve.armLength;
        assert.ok(phase > 0.5, 'restoration must not begin at the shoulder/chest');
      }
  }
});

test('accepted Pose measurement geometry and reviewed silhouette integration are regression-guarded', () => {
  for (const [file, hash] of [
    [
      'src/components/tryon/shirtGeometry.js',
      'a5f679657de589f529a9fd35619a8e2bb1dbca7b16bf00b7f5c26837dabc8a6d',
    ],
    [
      'src/hooks/usePoseTracking.js',
      'a08c7381c01e96783cc52d4ff7c9b4ffe67a178464a520df4bc7881915097141',
    ],
    [
      'src/services/poseLandmarker.worker.js',
      'b86056836b4653c75ed8222b5cbc0d966c6c33936465aabb75019ce9042f3fc2',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(`../${file}`, import.meta.url)))
        .digest('hex'),
      hash,
    );
});

test('real eyewear product pixels stay byte-for-byte unchanged', () => {
  for (const [path, hash] of [
    [
      'public/assets/products/eyewear/modern-clear-frame/left-temple.png',
      'e0c67dd82682115d803335d0d885adf61b6f4f462defcb4fe4890c0d1e3ea48a',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(`../${path}`, import.meta.url)))
        .digest('hex'),
      hash,
    );
});
