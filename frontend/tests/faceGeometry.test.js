import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  displayLandmarks,
  faceAnchors,
  smoothAnchors,
  faceVisibility,
  trackingConfig,
  accessoryTransform,
  defaultControls,
  drawAccessory,
  glassesTemples,
  frontFrameGeometry,
  normalizeYaw,
  smoothTempleVisual,
  templeDrawGeometry,
} from '../src/components/tryon/faceGeometry.js';
import {
  matrixYawDegrees,
  normalizeYawDegrees,
  resolveHeadPose,
  headPoseConfig,
} from '../src/components/tryon/headPose.js';
import { sunglassesAssetFor, accessoryStyles } from '../src/data/faceAccessories.js';
import { alphaBounds } from '../src/components/tryon/accessoryAssets.js';
import { smoothHeadSides, headTargetLandmarks } from '../src/components/tryon/templeGeometry.js';
import { normalizeProduct } from '../src/services/catalog.js';
import {
  measureTempleAlpha,
  templeImagePlacement,
} from '../src/components/tryon/templeAssetGeometry.js';
import { modernClearTempleCalibration } from '../src/data/modernClearTempleCalibration.js';

function face() {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const id of [33, 133]) points[id] = { x: 0.35, y: 0.4 };
  for (const id of [362, 263]) points[id] = { x: 0.65, y: 0.4 };
  points[234] = { x: 0.2, y: 0.5 };
  points[127] = { x: 0.2, y: 0.38 };
  points[93] = { x: 0.21, y: 0.58 };
  points[356] = { x: 0.8, y: 0.38 };
  points[323] = { x: 0.79, y: 0.58 };
  points[454] = { x: 0.8, y: 0.5 };
  points[132] = { x: 0.22, y: 0.6 };
  points[361] = { x: 0.78, y: 0.6 };
  points[10] = { x: 0.5, y: 0.1 };
  points[6] = { x: 0.5, y: 0.4 };
  points[168] = { x: 0.5, y: 0.39 };
  return points;
}
test('anchors follow translation, scale, and head roll for every accessory', () => {
  for (const kind of ['sunglasses', 'earrings', 'forehead']) {
    const points = face(),
      initial = faceAnchors(points, 1000, 1000, kind);
    const angle = 0.23,
      scale = 1.15;
    const moved = points.map(({ x, y }) => ({
      x: scale * (x * Math.cos(angle) - y * Math.sin(angle)) + 0.1,
      y: scale * (x * Math.sin(angle) + y * Math.cos(angle)) - 0.12,
    }));
    const next = faceAnchors(moved, 1000, 1000, kind);
    initial.forEach((anchor, i) => {
      assert.ok(Math.abs(next[i].width / anchor.width - scale) < 1e-8);
      assert.ok(Math.abs(next[i].angle - angle) < 1e-8);
      assert.ok(
        Math.abs(
          next[i].x - (scale * (anchor.x * Math.cos(angle) - anchor.y * Math.sin(angle)) + 100),
        ) < 1e-8,
      );
      assert.ok(
        Math.abs(
          next[i].y - (scale * (anchor.x * Math.sin(angle) + anchor.y * Math.cos(angle)) - 120),
        ) < 1e-8,
      );
    });
  }
});
test('mirroring retains left/right ordering and reverses tilt without flipping glasses', () => {
  const points = face().map((p) => ({ ...p, y: p.y + p.x * 0.2 }));
  const original = faceAnchors(points, 800, 600, 'sunglasses')[0];
  const mirrored = faceAnchors(displayLandmarks(points, true), 800, 600, 'sunglasses')[0];
  assert.ok(Math.abs(mirrored.angle + original.angle) < 1e-8);
  assert.ok(Math.abs(mirrored.width - original.width) < 1e-8);
  assert.equal(faceAnchors(null, 800, 600, 'sunglasses'), null);
  assert.equal(faceAnchors(face(), 800, 600, 'earrings').length, 2);
});
test('face products opt in through backend AR metadata', () => {
  assert.equal(
    normalizeProduct({ id: 3, categoryId: 999, arType: 'EYEWEAR', price: 0 }).tryOnType,
    'FACE_AR',
  );
  assert.equal(
    normalizeProduct({ id: 3, categoryId: 5, arType: 'NECKLACE', price: 0 }).tryOnType,
    'NECKLACE',
  );
});

test('smoothing dampens jitter, converges, and takes the shortest rotation arc', () => {
  const start = [{ x: 300, y: 200, width: 220, angle: Math.PI - 0.02 }];
  const target = [{ x: 302, y: 199, width: 221, angle: -Math.PI + 0.02 }];
  const next = smoothAnchors(start, target, 16);
  assert.ok(next[0].x > 300 && next[0].x < 301);
  assert.ok(next[0].y < 200 && next[0].y > 199);
  assert.ok(next[0].width > 220 && next[0].width < 221);
  assert.ok(Math.abs(next[0].angle - start[0].angle) < 0.02);
  let settled = next;
  for (let i = 0; i < 60; i++) settled = smoothAnchors(settled, target, 16);
  assert.ok(Math.abs(settled[0].x - 302) < 0.001);
  assert.deepEqual(smoothAnchors(null, target, 16), target);
});

test('lost-face grace expires and mirroring works in a non-square canvas', () => {
  assert.equal(faceVisibility(100, 0), 1);
  assert.ok(faceVisibility(trackingConfig.lostGraceMs + 60, 0) < 1);
  assert.equal(faceVisibility(1000, 0), 0);
  assert.equal(faceVisibility(0, -Infinity), 0);
  const points = face().map((p) => ({ ...p, x: p.x + 0.1, y: p.y + p.x * 0.1 }));
  const a = faceAnchors(points, 1280, 720, 'sunglasses')[0];
  const b = faceAnchors(displayLandmarks(points, true), 1280, 720, 'sunglasses')[0];
  assert.ok(Math.abs(a.x + b.x - 1280) < 1e-8);
  assert.ok(Math.abs(a.y - b.y) < 1e-8);
  assert.ok(Math.abs(a.angle + b.angle) < 1e-8);
  assert.ok(Math.abs(a.width - b.width) < 1e-8);
});

function faceAtSize(scale) {
  return face().map((p) => ({
    x: 0.5 + (p.x - 0.5) * scale,
    y: 0.5 + (p.y - 0.5) * scale,
    z: 999,
  }));
}

test('A/B: doubling only the screen-space face span doubles automatic width by hundreds of pixels', () => {
  const far = faceAnchors(faceAtSize(0.55), 1280, 720, 'sunglasses')[0];
  const near = faceAnchors(faceAtSize(1.1), 1280, 720, 'sunglasses')[0];
  assert.ok(Math.abs(far.width - 422.4) < 1e-8);
  assert.ok(Math.abs(near.width - 844.8) < 1e-8);
  assert.ok(near.width - far.width > 400);
  assert.ok(Math.abs(near.eyeDistancePx / far.eyeDistancePx - 2) < 1e-8);
  // Face-side measurement is independent of eye-centre estimation and z depth.
  const changed = faceAtSize(1.1);
  changed[133].x += 0.08;
  changed[362].x -= 0.08;
  changed.forEach((p) => {
    p.z = -200;
  });
  assert.equal(faceAnchors(changed, 1280, 720, 'sunglasses')[0].width, near.width);
});

test('C: final width = automatic width * product fit * user scale; native aspect and full opacity remain intact', () => {
  const controls = { ...defaultControls(), scale: 1.25 };
  const fit = { widthMultiplier: 0.92, verticalOffset: 0.03, rotationOffset: 4, opacity: 100 };
  const far = faceAnchors(faceAtSize(0.55), 640, 360, 'sunglasses')[0];
  const near = faceAnchors(faceAtSize(1.1), 640, 360, 'sunglasses')[0];
  const a = accessoryTransform(far, controls, 640, 360, 3, fit);
  const b = accessoryTransform(near, controls, 640, 360, 3, fit);
  assert.equal(a.width, far.width * 0.92 * 1.25);
  assert.equal(b.width, near.width * 0.92 * 1.25);
  assert.equal(b.width / a.width, 2);
  assert.equal(b.width / b.height, 3);
  assert.equal(b.opacity, 1);
  assert.equal(b.y, near.y); // The tracked bridge must not inherit a centering offset.
  assert.ok(
    accessoryTransform({ ...near, bridgeLocked: false }, controls, 640, 360, 3, fit).y > near.y,
  );
  assert.equal(b.angle, (4 * Math.PI) / 180);
});

test('D: separate size smoothing grows and shrinks to within 5% of a new size within 120 ms', () => {
  let previous = [{ x: 300, y: 200, width: 150, angle: 0 }];
  const near = [{ ...previous[0], width: 300 }];
  for (let n = 0; n < 8; n++) {
    const next = smoothAnchors(previous, near, 15);
    assert.ok(next[0].width > previous[0].width && next[0].width < 300);
    previous = next;
  }
  assert.ok(previous[0].width > 292);
  const far = [{ ...previous[0], width: 150 }];
  for (let n = 0; n < 8; n++) {
    const next = smoothAnchors(previous, far, 15);
    assert.ok(next[0].width < previous[0].width && next[0].width > 150);
    previous = next;
  }
  assert.ok(previous[0].width < 158);
});

test('transparent padding is excluded while even faint lens/edge alpha is retained', () => {
  const pixels = new Uint8ClampedArray(20 * 12 * 4);
  for (let y = 4; y <= 7; y++) for (let x = 3; x <= 16; x++) pixels[(y * 20 + x) * 4 + 3] = 80;
  pixels[(3 * 20 + 2) * 4 + 3] = 1;
  assert.deepEqual(alphaBounds(pixels, 20, 12), { x: 2, y: 3, width: 15, height: 5 });
  assert.equal(alphaBounds(new Uint8ClampedArray(20 * 12 * 4), 20, 12), null);
});

test('renderer crops once-measured bounds and scales both axes equally with high-quality smoothing', () => {
  let args;
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    drawImage(...values) {
      args = values;
    },
  };
  const image = { naturalWidth: 1000, naturalHeight: 800 };
  const asset = { image, bounds: { x: 200, y: 300, width: 600, height: 200 } };
  drawAccessory(
    ctx,
    asset,
    [{ x: 320, y: 180, width: 300, angle: 0, pivot: 0.5 }],
    defaultControls(),
    640,
    360,
    { widthMultiplier: 0.9 },
  );
  assert.deepEqual(args, [image, 200, 300, 600, 200, -135, -45, 270, 90]);
  assert.equal(ctx.imageSmoothingEnabled, true);
  assert.equal(ctx.imageSmoothingQuality, 'high');
  assert.equal(ctx.globalAlpha, 1);
});

test('AR assets respect backend image URL without substituted photographs', () => {
  const style = accessoryStyles[0];
  const product = { imageUrl: '/custom-real-product.png', accessoryStyle: 'aviator' };
  assert.equal(sunglassesAssetFor(product, style).src, product.imageUrl);
  assert.equal(sunglassesAssetFor({}, style).src, undefined);
  assert.equal(sunglassesAssetFor(product, style).fallbackSrc, null);
});
test('known Modern Clear asset retains calibrated three-part assembly', () => {
  const style = accessoryStyles.find((s) => s.id === 'clear');
  const asset = sunglassesAssetFor({ imageUrl: style.frontFrameSrc }, style);
  assert.equal(asset.src, style.frontFrameSrc);
  assert.match(asset.leftTempleSrc, /modern-clear-frame\/left-temple\.png/);
  assert.match(asset.rightTempleSrc, /modern-clear-frame\/right-temple\.png/);
});

for (const [direction, yaw] of [
  ['frontal', 0],
  ['left', -0.65],
  ['right', 0.65],
]) {
  test(`${direction} yaw: bridge follows nose roots even when eye/face midpoints drift`, () => {
    const points = face();
    // Projected nose and eye plane move differently in a turned face.
    points[6].x += yaw * 0.06;
    points[168].x += yaw * 0.05;
    points[1].x += yaw * 0.15;
    for (const id of [33, 133, 362, 263]) points[id].x -= yaw * 0.08;
    for (const id of [234, 454]) points[id].x -= yaw * 0.04;
    const anchor = faceAnchors(points, 1000, 700, 'sunglasses')[0];
    const expected = {
      x: (points[6].x * 0.85 + points[168].x * 0.15) * 1000,
      y: (points[6].y * 0.85 + points[168].y * 0.15) * 700,
    };
    const fit = accessoryStyles.find((s) => s.id === 'clear');
    const transform = accessoryTransform(anchor, defaultControls(), 1000, 700, 2.85, fit);
    const front = frontFrameGeometry(anchor, transform, fit);
    assert.ok(Math.hypot(front.bridge.x - expected.x, front.bridge.y - expected.y) < 0.001);
    if (yaw) assert.ok(Math.abs(anchor.x - ((points[133].x + points[362].x) / 2) * 1000) > 30);
    const noPerspective = frontFrameGeometry({ ...anchor, yaw: 0 }, transform, fit);
    assert.deepEqual(front.bridge, noPerspective.bridge);
    // A rigid object has unequal screen widths under perspective; bridge and
    // part attachment remain exact rather than holding the front flat.
    assert.ok(front.leftWidth > 0 && front.rightWidth > 0);
    const temples = glassesTemples(anchor, transform, fit);
    for (const arm of temples) {
      const hinge = arm.side < 0 ? front.leftHinge : front.rightHinge;
      assert.equal(arm.hingeX, hinge.x);
      assert.equal(arm.hingeY, hinge.y);
    }
  });
}

test('bridge pivot and hinges mirror naturally and remain locked through distance and roll', () => {
  const fit = accessoryStyles.find((s) => s.id === 'clear');
  const geometries = [];
  for (const scale of [0.6, 1.2]) {
    const points = faceAtSize(scale);
    points[1].x += 0.1 * scale;
    const rolled = points.map((p) => ({
      ...p,
      x: 0.5 + (p.x - 0.5) * Math.cos(0.25) - (p.y - 0.5) * Math.sin(0.25),
      y: 0.5 + (p.x - 0.5) * Math.sin(0.25) + (p.y - 0.5) * Math.cos(0.25),
    }));
    const a = faceAnchors(rolled, 1000, 1000, 'sunglasses')[0];
    const b = faceAnchors(displayLandmarks(rolled, true), 1000, 1000, 'sunglasses')[0];
    const project = (anchor) =>
      frontFrameGeometry(
        anchor,
        accessoryTransform(anchor, defaultControls(), 1000, 1000, 2.85, fit),
        fit,
      );
    const front = project(a),
      mirror = project(b);
    assert.ok(Math.abs(a.angle + b.angle) < 1e-8);
    assert.ok(Math.abs(a.yaw + b.yaw) < 1e-8);
    assert.ok(Math.abs(front.bridge.x + mirror.bridge.x - 1000) < 1e-8);
    assert.ok(Math.abs(front.leftWidth - mirror.rightWidth) < 1e-8);
    for (const [i, hinge] of front.screenHinges.entries()) {
      assert.ok(Math.abs(hinge.x + mirror.screenHinges[1 - i].x - 1000) < 1e-8);
      assert.ok(Math.abs(hinge.y - mirror.screenHinges[1 - i].y) < 1e-8);
    }
    geometries.push(front);
  }
  assert.ok(Math.abs(geometries[1].leftWidth / geometries[0].leftWidth - 2) < 1e-8);
});

test('bridge smoothing responds faster than perspective, independently of scale and roll', () => {
  const old = faceAnchors(face(), 1000, 1000, 'sunglasses')[0];
  const target = {
    ...old,
    x: old.x + 20,
    y: old.y + 8,
    yaw: 0.65,
    width: old.width * 1.5,
    angle: 0.2,
  };
  const filtered = smoothAnchors([old], [target], 33)[0];
  assert.ok(Math.hypot(target.x - filtered.x, target.y - filtered.y) < old.width * 0.01);
  assert.ok((filtered.x - old.x) / 20 > filtered.yaw / target.yaw);
  const onlyPosition = smoothAnchors(
    [old],
    [{ ...target, width: old.width, angle: old.angle }],
    33,
  )[0];
  assert.equal(filtered.x, onlyPosition.x);
  assert.equal(filtered.y, onlyPosition.y);
});

test('frontal, small, moderate and strong nose displacement progress gradually on both sides', () => {
  const levels = [0, 0.015, 0.07, 0.25, 0.45, 0.55];
  const values = levels.map(normalizeYaw);
  assert.equal(values[0], 0);
  assert.equal(values[1], 0);
  assert.ok(values[2] > 0 && values[2] < 0.05);
  assert.ok(values[3] > 0.1 && values[3] < 0.25);
  assert.ok(values[4] > values[3] && values[4] < 0.5);
  assert.ok(values[5] < 0.5);
  assert.ok(normalizeYaw(0.744) < 0.5); // Actual webcam displacement no longer saturates.
  for (let i = 2; i < values.length; i++) assert.ok(values[i] > values[i - 1]);
  for (const displacement of levels)
    assert.equal(normalizeYaw(-displacement), -normalizeYaw(displacement));
  assert.equal(normalizeYaw(NaN), 0);
  assert.ok(normalizeYaw(Math.tan((3 * Math.PI) / 180) + 0.000001) < 0.000001);
});

test('raw yaw calibration remains independent of scale, translation, roll and selfie mirroring', () => {
  for (const displacement of [0, 0.07, 0.25, 0.45]) {
    const points = face();
    points[1].x += displacement * 0.6;
    const baseline = faceAnchors(points, 1000, 1000, 'sunglasses')[0];
    assert.ok(Math.abs(baseline.rawYaw - displacement) < 1e-8);
    for (const scale of [0.6, 1.2]) {
      const moved = points.map((p) => ({
        ...p,
        x: 0.5 + 0.04 + scale * ((p.x - 0.5) * Math.cos(0.2) - (p.y - 0.5) * Math.sin(0.2)),
        y: 0.5 - 0.03 + scale * ((p.x - 0.5) * Math.sin(0.2) + (p.y - 0.5) * Math.cos(0.2)),
      }));
      const a = faceAnchors(moved, 1000, 1000, 'sunglasses')[0];
      const b = faceAnchors(displayLandmarks(moved, true), 1000, 1000, 'sunglasses')[0];
      assert.ok(Math.abs(a.rawYaw - baseline.rawYaw) < 1e-8);
      assert.ok(Math.abs(a.yaw - baseline.yaw) < 1e-8);
      assert.ok(Math.abs(b.yaw + a.yaw) < 1e-8);
    }
  }
});

// Build independent Rz * Ry * Rx matrices using general multiplication, then
// serialize like MediaPipe. Tests include scale and translation to catch index
// mistakes and extraction that accidentally interprets a translation as yaw.
function poseMatrix(degrees, roll = 0, pitch = 0, scale = 1) {
  const y = (degrees * Math.PI) / 180;
  const c = Math.cos,
    s = Math.sin;
  const rz = [
    [c(roll), -s(roll), 0],
    [s(roll), c(roll), 0],
    [0, 0, 1],
  ];
  const ry = [
    [c(y), 0, s(y)],
    [0, 1, 0],
    [-s(y), 0, c(y)],
  ];
  const rx = [
    [1, 0, 0],
    [0, c(pitch), -s(pitch)],
    [0, s(pitch), c(pitch)],
  ];
  const mul = (a, b) =>
    a.map((row) => b[0].map((_, j) => row.reduce((v, n, k) => v + n * b[k][j], 0)));
  const rotation = mul(mul(rz, ry), rx);
  const data = Array.from({ length: 16 }, (_, i) => {
    const row = i % 4,
      col = Math.floor(i / 4);
    return row === 3
      ? col === 3
        ? 1
        : 0
      : col === 3
        ? [8, -13, -50][row]
        : rotation[row][col] * scale;
  });
  return { rows: 4, columns: 4, data };
}

for (const degrees of [0, -15, 15, -30, 30, -60, 60, -75, 75]) {
  test(`column-major matrix extracts ${degrees} degrees independently of pitch, roll, scale and translation`, () => {
    for (const scale of [0.7, 1, 2])
      for (const roll of [-0.25, 0, 0.3]) {
        assert.ok(
          Math.abs(matrixYawDegrees(poseMatrix(degrees, roll, 0.18, scale)) - degrees) < 1e-8,
        );
      }
  });
}

test('matrix yaw progresses in degrees; moderate 15-30 degree turns never saturate', () => {
  const values = [0, 6, 15, 30, 60, 75].map(normalizeYawDegrees);
  assert.equal(values[0], 0);
  for (let i = 1; i < values.length; i++) assert.ok(values[i] > values[i - 1]);
  assert.ok(values[2] > 0.1 && values[2] < 0.3);
  assert.ok(values[3] > 0.3 && values[3] < 0.5);
  assert.equal(values[5], 1);
  assert.equal(normalizeYawDegrees(2), 0);
  for (const deg of [6, 15, 30, 60])
    assert.equal(normalizeYawDegrees(-deg), -normalizeYawDegrees(deg));
});

test('matrix takes priority over extreme landmark displacement and mirroring reverses it exactly once', () => {
  const original = resolveHeadPose(null, poseMatrix(30), 0.744, false, 0);
  const mirror = resolveHeadPose(null, poseMatrix(30), -0.744, true, 0);
  assert.equal(original.yawSource, 'MATRIX');
  assert.ok(Math.abs(original.rawYawDegrees - 30) < 1e-8);
  assert.ok(original.yaw < 0.5);
  assert.equal(mirror.rawYawDegrees, -original.rawYawDegrees);
  assert.equal(mirror.yaw, -original.yaw);
  const anchor = faceAnchors(face(), 1000, 1000, 'sunglasses', original)[0];
  const transform = accessoryTransform(anchor, defaultControls(), 1000, 1000, 2.85);
  assert.equal(glassesTemples(anchor, transform)[1].side, -1);
  assert.equal(glassesTemples({ ...anchor, ...mirror }, transform)[1].side, 1);
});

test('unavailable and invalid matrices fall back without NaN or premature clamp', () => {
  const invalids = [
    null,
    {},
    { ...poseMatrix(0), rows: 3 },
    { ...poseMatrix(0), data: [1] },
    { ...poseMatrix(0), data: Array(16).fill(0) },
    { ...poseMatrix(0), data: poseMatrix(0).data.map((v, i) => (i === 2 ? NaN : v)) },
    { ...poseMatrix(0), data: poseMatrix(0).data.map((v, i) => (i === 4 ? 0.5 : v)) },
  ];
  for (const matrix of invalids) {
    assert.equal(matrixYawDegrees(matrix), null);
    const pose = resolveHeadPose(null, matrix, 0.744, false, 0);
    assert.equal(pose.yawSource, 'FALLBACK');
    assert.ok(pose.yaw > 0 && pose.yaw < 0.5);
  }
});

test('single-frame yaw jumps and invalid frames hold briefly; sustained turns recover at bounded speed', () => {
  const steady = resolveHeadPose(null, poseMatrix(15), 0, false, 0);
  const spike = resolveHeadPose(steady, poseMatrix(-70), 0, false, 33);
  assert.equal(spike.rawYawDegrees, steady.rawYawDegrees);
  assert.equal(spike.held, true);
  const recovered = resolveHeadPose(spike, poseMatrix(16), 0, false, 66);
  assert.equal(recovered.held, false);
  const invalid = resolveHeadPose(recovered, null, NaN, false, 99);
  assert.equal(invalid.rawYawDegrees, recovered.rawYawDegrees);
  const sustained = resolveHeadPose(invalid, poseMatrix(60), 0, false, 270);
  assert.ok(sustained.rawYawDegrees > recovered.rawYawDegrees);
  assert.ok(
    sustained.rawYawDegrees - recovered.rawYawDegrees <=
      ((270 - 99) * headPoseConfig.maxSpeedDegreesPerSecond) / 1000,
  );
});

test('real arm aspect and measured hinge pivot survive resizing instead of stretching into a tiny tall strip', () => {
  const part = { bounds: { width: 995, height: 235 }, hingePivot: { x: 1, y: 0.145 } };
  for (const length of [90, 120, 160]) {
    const d = templeDrawGeometry({ side: -1, length }, part);
    assert.equal(d.width / d.height, 995 / 235);
    assert.equal(d.x + d.width, 0);
    assert.ok(Math.abs(d.y + d.height * 0.145) < 1e-9);
    assert.ok(d.height > 20);
  }
});

test('head-side targets come from verified face-oval groups and follow translation, scale and roll', () => {
  assert.deepEqual(headTargetLandmarks, [
    [127, 234, 93],
    [356, 454, 323],
  ]);
  const points = face();
  const a = faceAnchors(points, 1000, 1000, 'sunglasses')[0];
  assert.ok(a.headSideTargets.every((p) => Number.isFinite(p.x) && p.span > 0));
  const moved = points.map((p) => ({
    ...p,
    x: 0.5 + 0.04 + 1.2 * ((p.x - 0.5) * Math.cos(0.2) - (p.y - 0.5) * Math.sin(0.2)),
    y: 0.5 + 0.02 + 1.2 * ((p.x - 0.5) * Math.sin(0.2) + (p.y - 0.5) * Math.cos(0.2)),
  }));
  const b = faceAnchors(moved, 1000, 1000, 'sunglasses')[0];
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(a.headSideTargets[i].x - b.headSideTargets[i].x) < 1e-8);
    assert.ok(Math.abs(a.headSideTargets[i].y - b.headSideTargets[i].y) < 1e-8);
  }
});

test('invalid head-side endpoint and unrealistic contour jumps keep the previous stable proxy', () => {
  const a = faceAnchors(face(), 1000, 1000, 'sunglasses')[0];
  const previous = smoothHeadSides(null, a.headSideTargets, 33);
  assert.deepEqual(smoothHeadSides(previous, null, 33), previous);
  const invalid = previous.map((p) => ({ ...p, x: NaN }));
  assert.deepEqual(smoothHeadSides(previous, invalid, 33), previous);
  assert.deepEqual(
    smoothHeadSides(
      previous,
      previous.map((p) => ({ ...p, depth: NaN })),
      33,
    ),
    previous,
  );
  assert.deepEqual(
    smoothHeadSides(
      previous,
      previous.map((p) => ({ ...p, normal: { x: NaN, y: 0 } })),
      33,
    ),
    previous,
  );
  const jump = previous.map((p) => ({ ...p, y: p.y + 1 }));
  assert.deepEqual(smoothHeadSides(previous, jump, 33), previous);
  const next = previous.map((p) => ({ ...p, x: p.x + 0.01, y: p.y + 0.01 }));
  const filtered = smoothHeadSides(previous, next, 16);
  assert.ok(filtered[0].y > previous[0].y && filtered[0].y < next[0].y);
});

test('temple length and opacity have independent smoothing and stay tied to physical sides across yaw zero', () => {
  const before = [
    { side: -1, lengthRatio: 0.1, opacity: 0.4 },
    { side: 1, lengthRatio: 0.12, opacity: 0.8 },
  ];
  const after = [
    { side: 1, lengthRatio: 0.2, opacity: 0.4 },
    { side: -1, lengthRatio: 0.2, opacity: 0.8 },
  ];
  const next = smoothTempleVisual(before, after, 16);
  const left = next.find((p) => p.side === -1);
  assert.ok(left.lengthRatio > 0.1 && left.lengthRatio < 0.2);
  assert.ok(left.opacity > 0.4 && left.opacity < 0.8);
  assert.ok((left.lengthRatio - 0.1) / 0.1 > (left.opacity - 0.4) / 0.4);
});

test('alpha PCA and hinge-tip measurement ignore transparent canvas padding and mirror correctly', () => {
  const pixels = new Uint8ClampedArray(80 * 60 * 4);
  for (let x = 12; x < 65; x++)
    for (let y = 0; y < 60; y++)
      if (Math.abs(y - (14 + (x - 12) * 0.2)) < 1.5) pixels[(y * 80 + x) * 4 + 3] = 255;
  const measured = measureTempleAlpha(pixels, 80, 60, false);
  assert.ok(Math.abs(measured.axisDegrees - (Math.atan(0.2) * 180) / Math.PI) < 0.3);
  const padded = new Uint8ClampedArray(200 * 120 * 4);
  const mirror = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < 80; x++) {
      padded[((y + 35) * 200 + x + 75) * 4 + 3] = pixels[(y * 80 + x) * 4 + 3];
      mirror[(y * 80 + 79 - x) * 4 + 3] = pixels[(y * 80 + x) * 4 + 3];
    }
  const after = measureTempleAlpha(padded, 200, 120, false);
  assert.ok(Math.abs(after.visibleLength - measured.visibleLength) < 1e-8);
  assert.ok(Math.abs(after.axisDegrees - measured.axisDegrees) < 1e-8);
  assert.ok(
    Math.abs(measureTempleAlpha(mirror, 80, 60, true).axisDegrees + measured.axisDegrees) < 1e-8,
  );
  const placement = templeImagePlacement(160, after.bounds, after.hinge, after.tip);
  assert.ok(Math.abs(placement.scale * after.visibleLength - 160) < 1e-8);
  assert.ok(Math.abs(placement.x + (after.hinge.x - after.bounds.x) * placement.scale) < 1e-8);
  assert.ok(Math.abs(placement.y + (after.hinge.y - after.bounds.y) * placement.scale) < 1e-8);
  assert.ok(placement.width < 200); // Canvas padding is not part of the scale calculation.
});

test('normalized real asset calibration removes PCA rotation and preserves physical hook and visible length', () => {
  const sides = ['left', 'right'].map(
    (side) => modernClearTempleCalibration[`modern-clear-${side}-temple-normalized.png`],
  );
  for (const { original, normalized } of sides) {
    assert.ok(Math.abs(original.axisDegrees) > 6 && Math.abs(original.axisDegrees) < 7);
    assert.ok(Math.abs(normalized.axisDegrees) < 0.01);
    assert.equal(normalized.naturalWidth, 1014);
    assert.equal(normalized.naturalHeight, 169);
    assert.ok(Math.abs(normalized.visibleLength - original.visibleLength) < 1e-8);
    assert.ok(normalized.hingeTipDegrees > 3 && normalized.hingeTipDegrees < 5); // Legitimate hook remains.
    assert.ok(
      Math.abs(normalized.hingePivot.x * normalized.naturalWidth - normalized.hinge.x) < 1e-8,
    );
    assert.ok(
      Math.abs(normalized.hingePivot.y * normalized.naturalHeight - normalized.hinge.y) < 1e-8,
    );
  }
  assert.ok(
    Math.abs(sides[0].normalized.hingePivot.x + sides[1].normalized.hingePivot.x - 1) < 1e-8,
  );
});

test('real normalized temple and front product PNGs retain their original pixels', () => {
  for (const [path, hash] of [
    [
      'public/assets/products/eyewear/modern-clear-frame/left-temple.png',
      'e0c67dd82682115d803335d0d885adf61b6f4f462defcb4fe4890c0d1e3ea48a',
    ],
    [
      'public/assets/products/eyewear/modern-clear-frame/right-temple.png',
      '2d89fb7014346ec24435bf583cf511260ebc37beeffd3df9b3a05f7dc10861ed',
    ],
    [
      'public/assets/products/eyewear/modern-clear-frame/front.png',
      '1a79f53b743a09d66cc065d68b33768781b8eea3e92bbc4493d6064afaf2d6cb',
    ],
  ]) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(`../${path}`, import.meta.url)))
        .digest('hex'),
      hash,
      path,
    );
  }
});
