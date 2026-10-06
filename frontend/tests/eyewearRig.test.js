import { estimateHeadShape } from '../src/components/tryon/eyewearHeadGeometry.js';
import { measureLensApertures } from '../src/components/tryon/accessoryAssets.js';
import { sampleLensTint } from '../src/components/tryon/lensSurface.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEyewearRig,
  rigidTempleMesh,
  drawEyewearRig,
} from '../src/components/tryon/eyewearRig.js';
import { matrixOrientation, resolveHeadPose } from '../src/components/tryon/headPose.js';
import {
  smoothAnchors,
  faceVisibility,
  accessoryTransform,
  defaultControls,
} from '../src/components/tryon/faceGeometry.js';
import { modernClearTempleCalibration } from '../src/data/modernClearTempleCalibration.js';
import { accessoryStyles, sunglassesAssetFor } from '../src/data/faceAccessories.js';

const fit = accessoryStyles.find((s) => s.id === 'clear');
const anchor = {
  x: 500,
  y: 240,
  width: 300,
  angle: 0,
  bridgeLocked: true,
  rawYawDegrees: 0,
  pitchDegrees: 0,
  cameraDistance: 5,
};
const transform = { x: 500, y: 240, width: 276, height: 97, angle: 0, opacity: 1 };
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function matrix(yaw, pitch = 0, roll = 0) {
  const y = (yaw * Math.PI) / 180,
    p = (pitch * Math.PI) / 180,
    r = (roll * Math.PI) / 180;
  const c = Math.cos,
    s = Math.sin;
  // Independent Rz Ry Rx, column-major (MediaPipe y-up/z-toward).
  return {
    rows: 4,
    columns: 4,
    data: [
      c(r) * c(y),
      s(r) * c(y),
      -s(y),
      0,
      c(r) * s(y) * s(p) - s(r) * c(p),
      s(r) * s(y) * s(p) + c(r) * c(p),
      c(y) * s(p),
      0,
      c(r) * s(y) * c(p) + s(r) * s(p),
      s(r) * s(y) * c(p) - c(r) * s(p),
      c(y) * c(p),
      0,
      8,
      -3,
      -40,
      1,
    ],
  };
}
function part(side) {
  const g = modernClearTempleCalibration[`modern-clear-${side}-temple-normalized.png`].normalized;
  return {
    image: side,
    bounds: g.bounds,
    visibleHinge: g.hinge,
    visibleTip: g.tip,
    hingePivot: g.hingePivot,
  };
}

for (const degrees of [0, -15, 15, -30, 30, -55, 55]) {
  test(`rigid hinges stay attached with yaw ${degrees}, pitch, scale, roll and fit offsets`, () => {
    for (const pitch of [-20, 0, 20])
      for (const scale of [0.6, 1, 1.8]) {
        const a = { ...anchor, rawYawDegrees: degrees, pitchDegrees: pitch };
        const t = {
          ...transform,
          width: transform.width * scale,
          height: transform.height * scale,
          angle: 0.3,
        };
        const rig = createEyewearRig(a, t, fit);
        for (const temple of rig.temples) {
          const h = temple.side < 0 ? rig.front.leftHinge : rig.front.rightHinge;
          const mesh = rigidTempleMesh(rig, temple, part(temple.side < 0 ? 'left' : 'right'));
          close(mesh.hinge.x, h.x);
          close(mesh.hinge.y, h.y);
          close(mesh.hinge.depth, h.depth);
          close(temple.hingeX, h.x);
          close(temple.hingeY, h.y);
          assert.equal(temple.renderer, 'RIGID_3D');
          assert.ok(
            mesh.strips
              .flat()
              .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.perspective > 0),
          );
        }
        assert.deepEqual(rig.front.bridge, { x: t.x, y: t.y });
      }
  });
}

test('frontal and near-frontal shafts point backward with a short tucked projection on both sides', () => {
  for (let yaw = -3; yaw <= 3; yaw++) {
    const rig = createEyewearRig({ ...anchor, rawYawDegrees: yaw }, transform, fit);
    for (const t of rig.temples) {
      assert.ok(t.target.depth > t.hingeDepth + 0.5);
      // A posterior endpoint can project inward behind the head. Measure actual
      // OUTWARD extent instead of mistaking that occluded length for an open wing.
      const extent =
        Math.max(
          ...Array.from(
            { length: 65 },
            (_, i) => (rig.project(rig.templePoint(t.side, i / 64)).x - t.hingeX) * t.side,
          ),
        ) / transform.width;
      assert.ok(extent > 0.005 && extent < 0.09, `${yaw}: root/wing extent ${extent}`);
      close(t.physicalLength / rig.physicalWidth, fit.templeDepth);
    }
  }
});

test('proximal protection recedes smoothly on the far side without deforming either temple', () => {
  let previous;
  for (let yaw = -40; yaw <= 40; yaw += 0.25) {
    const rig = createEyewearRig({ ...anchor, rawYawDegrees: yaw }, transform, fit);
    for (const temple of rig.temples) {
      assert.ok(temple.proximalVisibleFraction > 0);
      assert.ok(temple.proximalVisibleFraction <= fit.templeRootLength);
      if (temple.side * yaw <= 0) close(temple.proximalVisibleFraction, fit.templeRootLength);
      const mesh = rigidTempleMesh(rig, temple, part(temple.side < 0 ? 'left' : 'right'));
      assert.equal(mesh.proximal.strips.length + mesh.posterior.strips.length, mesh.strips.length);
      for (const section of [mesh.proximal, mesh.posterior]) {
        const start = mesh.columns.indexOf(section.columns[0]);
        assert.deepEqual(
          section.columns,
          mesh.columns.slice(start, start + section.strips.length + 1),
        );
        assert.deepEqual(section.strips, mesh.strips.slice(start, start + section.strips.length));
      }
      const source = part(temple.side < 0 ? 'left' : 'right');
      const seam =
        (source.visibleHinge.x +
          temple.proximalVisibleFraction * (source.visibleTip.x - source.visibleHinge.x) -
          source.bounds.x) /
        source.bounds.width;
      assert.ok(mesh.columns.some((u) => Math.abs(u - seam) < 1e-10));
      if (previous) {
        const old = previous.temples.find((t) => t.side === temple.side);
        assert.ok(Math.abs(old.proximalVisibleFraction - temple.proximalVisibleFraction) < 0.003);
        assert.deepEqual(rig.paths, previous.paths);
      }
    }
    previous = rig;
  }
});

test('moderate yaw projects near shaft toward the head side, far shaft behind lenses, without opening either hinge', () => {
  for (const yaw of [-35, -25, -15, 15, 25, 35]) {
    const rig = createEyewearRig({ ...anchor, rawYawDegrees: yaw }, transform, fit);
    const [far, near] = rig.temples;
    assert.ok(near.vector.x * near.side > 0);
    assert.ok(far.vector.x * far.side < 0); // hidden by the lens/face guard
    assert.equal(near.opacity, 1);
    assert.equal(far.opacity, 1); // Depth, not yaw alpha, determines visibility.
    close(near.physicalLength, far.physicalLength);
    const localNear = rig.templePoint(near.side, 1),
      localFar = rig.templePoint(far.side, 1);
    close(localNear.z, localFar.z);
    close(localNear.x, -localFar.x);
    assert.ok(near.projectedLengthRatio < 0.5);
  }
});

test('all vertices use matrix pitch, yaw and roll; mirroring is applied once', () => {
  const m = matrix(25, 18, -12),
    o = matrixOrientation(m);
  close(o.yawDegrees, 25);
  close(o.pitchDegrees, 18);
  close(o.rollRadians, (12 * Math.PI) / 180);
  const a = resolveHeadPose(null, m, 0, false, 0),
    b = resolveHeadPose(null, m, 0, true, 0);
  close(a.rawYawDegrees, -b.rawYawDegrees);
  close(a.pitchDegrees, b.pitchDegrees);
  close(a.rollRadians, -b.rollRadians);
  const flat = createEyewearRig(anchor, transform, fit);
  const pitched = createEyewearRig({ ...anchor, ...a }, transform, fit);
  assert.ok(Math.abs(pitched.temples[1].target.y - flat.temples[1].target.y) > 20);
});

test('head movement changes projection continuously without independently rotating arms', () => {
  let previous;
  for (let yaw = -40; yaw <= 40; yaw += 0.25) {
    const rig = createEyewearRig({ ...anchor, rawYawDegrees: yaw }, transform, fit);
    if (previous)
      for (const t of rig.temples) {
        const old = previous.temples.find((p) => p.side === t.side);
        assert.ok(Math.hypot(t.target.x - old.target.x, t.target.y - old.target.y) < 2);
        close(rig.templePoint(t.side, 1).z, previous.templePoint(t.side, 1).z);
      }
    previous = rig;
  }
});

test('perspective affects front and shafts together while the bridge stays fixed', () => {
  const rig = createEyewearRig({ ...anchor, rawYawDegrees: 30 }, transform, fit);
  assert.notEqual(rig.front.leftHinge.perspective, rig.front.rightHinge.perspective);
  close(rig.project({ x: 0, y: 0, z: 0 }).x, 0);
  close(rig.project({ x: 0, y: 0, z: 0 }).y, 0);
  const smaller = createEyewearRig(
    { ...anchor, rawYawDegrees: 30 },
    { ...transform, width: 138, height: 48.5 },
    fit,
  );
  close(rig.temples[1].target.x, smaller.temples[1].target.x * 2);
});

test('orientation EMA filters actual degrees and pitch before every part is projected', () => {
  const old = { ...anchor, yaw: 0 },
    next = { ...old, rawYawDegrees: 30, pitchDegrees: 20, yaw: 0.3 };
  const a = smoothAnchors([old], [next], 16)[0];
  assert.ok(a.rawYawDegrees > 0 && a.rawYawDegrees < 10);
  assert.ok(a.pitchDegrees > 0 && a.pitchDegrees < 7);
  let v = [old];
  for (let i = 0; i < 30; i++) v = smoothAnchors(v, [next], 16);
  close(v[0].rawYawDegrees, 30, 0.2);
  const rig = createEyewearRig(a, transform, fit);
  close(rig.yawDegrees, a.rawYawDegrees);
  assert.deepEqual(
    rig.temples.map((t) => t.renderer),
    ['RIGID_3D', 'RIGID_3D'],
  );
});

test('invalid matrix falls back to landmarks and lost tracking still holds then fades', () => {
  const p = resolveHeadPose(
    null,
    { rows: 4, columns: 4, data: Array(16).fill(NaN) },
    0.3,
    false,
    0,
    0.1,
  );
  assert.equal(p.yawSource, 'FALLBACK');
  close(p.rollRadians, 0.1);
  close(p.pitchDegrees, 0);
  assert.ok(
    Number.isFinite(createEyewearRig({ ...anchor, ...p }, transform, fit).temples[0].target.x),
  );
  assert.equal(faceVisibility(140, 0), 1);
  assert.ok(faceVisibility(200, 0) < 1);
  assert.equal(faceVisibility(300, 0), 0);
});

test('head masks and lens guards enclose rear drawing and both temples are painted before the front', () => {
  const calls = [],
    draws = [],
    stack = [];
  let headClipped = false;
  const ctx = {
    save() {
      stack.push(headClipped);
    },
    restore() {
      headClipped = stack.pop();
    },
    translate() {},
    rotate() {},
    beginPath() {},
    rect() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    clip(rule) {
      if (rule === 'evenodd') headClipped = true;
    },
    transform() {},
    drawImage(img) {
      calls.push(img);
      draws.push({ img, headClipped });
    },
  };
  const a = {
    ...anchor,
    rawYawDegrees: 25,
    headContour: [
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
      { x: 0.5, y: 0.7 },
      { x: -0.5, y: 0.7 },
    ],
  };
  const asset = {
    image: 'front',
    bounds: { x: 0, y: 0, width: 944, height: 333 },
    leftTemple: part('left'),
    rightTemple: part('right'),
  };
  drawEyewearRig(ctx, asset, a, transform, fit);
  assert.ok(draws.some((d) => d.img === 'right' && d.headClipped));
  assert.ok(draws.some((d) => d.img === 'right' && !d.headClipped));
  assert.ok(draws.filter((d) => d.img !== 'right').every((d) => !d.headClipped));
  const firstFront = calls.indexOf('front');
  assert.ok(firstFront > 0);
  assert.ok(calls.slice(firstFront).every((c) => c === 'front'));
  assert.ok(calls.slice(0, firstFront).includes('left'));
  assert.ok(calls.slice(0, firstFront).includes('right'));
});

test('several backend products reuse the same rig and dynamic real front image without creating substitute arms', () => {
  const items = [
    { id: 2, imageUrl: fit.src },
    { id: 300, imageUrl: fit.src },
    { id: 3, imageUrl: '/assets/products/eyewear/classic-aviator/front.png' },
    { id: 777, imageUrl: 'https://store.example/real-frame.png' },
  ];
  for (const p of items) {
    const asset = sunglassesAssetFor(p, fit);
    assert.equal(asset.src, p.imageUrl);
    assert.equal(asset.frontFrameSrc, p.imageUrl);
    if (p.imageUrl !== fit.src) {
      assert.equal(asset.leftTempleSrc, null);
      assert.equal(asset.rightTempleSrc, null);
    }
    const t = accessoryTransform(anchor, defaultControls(), 1000, 750, 2.85, asset.fit);
    assert.ok(createEyewearRig(anchor, t, asset.fit).front.mesh.strips.length > 1);
  }
});

test('pitch and roll spikes are held with yaw; a sustained new orientation recovers without repeated holds', () => {
  const initial = resolveHeadPose(null, matrix(0), 0, false, 0);
  const spike = resolveHeadPose(initial, matrix(0, 55, 70), 0, false, 33);
  assert.equal(spike.held, true);
  close(spike.pitchDegrees, 0);
  close(spike.rollRadians, 0);
  const returned = resolveHeadPose(spike, matrix(1, 1, 1), 0, false, 66);
  assert.equal(returned.held, false);
  let pose = resolveHeadPose(returned, matrix(60, 35, 40), 0, false, 270);
  const accepted = pose.rawYawDegrees;
  pose = resolveHeadPose(pose, matrix(60, 35, 40), 0, false, 303);
  assert.equal(pose.held, false);
  assert.ok(pose.rawYawDegrees > accepted);
});

test('real asset manifest calibration is independent of database ID, style guesses and cache query strings', () => {
  const p = { id: 989, imageUrl: fit.src + '?v=2' };
  const a = sunglassesAssetFor(p, accessoryStyles[0]);
  assert.equal(a.frontFrameSrc, p.imageUrl);
  assert.equal(a.leftTempleSrc, fit.leftTempleSrc);
  assert.deepEqual(a.fit.bridgePivot, fit.bridgePivot);
});

test('lens material samples the real photograph and rejects transparent samples', () => {
  const pixels = new Uint8ClampedArray(12 * 12 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([80, 82, 60, 255], i);
  // A small dark obstruction cannot change the robust real tint measurement.
  pixels.set([10, 8, 6, 255], (6 * 12 + 6) * 4);
  assert.deepEqual(sampleLensTint(pixels, 12, 12, [[6, 6]]), [80, 82, 60, 255]);
  assert.throws(
    () => sampleLensTint(new Uint8ClampedArray(12 * 12 * 4), 12, 12, [[6, 6]]),
    /visible product pixels/,
  );
});

test('Aviator lens calibration stays product-asset driven and has no invented temple assets', () => {
  const style = accessoryStyles.find((s) => s.id === 'aviator');
  const config = sunglassesAssetFor({ id: 2020, imageUrl: style.src }, fit);
  assert.equal(config.src, style.src);
  assert.equal(config.leftTempleSrc, null);
  assert.equal(config.fit.lensSurface.width, 1900);
  assert.equal(config.fit.lensSurface.apertures.length, 2);
});

test('stable lateral mesh aggregates recover the same head dimensions under rigid yaw and pitch', () => {
  for (const yaw of [-30, -15, 0, 15, 30])
    for (const pitch of [-10, 0, 10]) {
      const y = (yaw * Math.PI) / 180,
        p = (pitch * Math.PI) / 180,
        c = Math.cos,
        s = Math.sin;
      const surface = Array.from({ length: 468 }, () => ({ x: 0, y: 0, z: 0 }));
      for (const [i, id] of [127, 234, 93, 356, 454, 323, 162, 389].entries()) {
        const x = i < 3 || i === 6 ? -0.5 : 0.5,
          py = i < 6 ? ((i % 3) - 0.5) * 0.06 : -0.09,
          z = 0.3;
        const yy = c(p) * py - s(p) * z,
          zz = s(p) * py + c(p) * z;
        surface[id] = {
          x: (c(y) * x - s(y) * zz) / c(y),
          y: yy / c(y),
          z: (s(y) * x + c(y) * zz) / c(y),
        };
      }
      const shape = estimateHeadShape(surface, yaw, pitch);
      close(shape.radius, 0.5);
      close(shape.sideDepth, 0.3);
      close(shape.sideHeight, -0.03);
      // One unstable lateral vertex cannot determine a temple endpoint.
      surface[127] = { x: 10, y: 3, z: 10 };
      const noisy = estimateHeadShape(surface, yaw, pitch);
      close(noisy.radius, 0.5);
      close(noisy.sideDepth, 0.3);
    }
  assert.equal(estimateHeadShape(null), null);
  assert.equal(estimateHeadShape(Array(468).fill({ x: 0, y: 0, z: NaN })), null);
});

test('proximal wrap recedes in depth and fits narrow/wide heads without changing frame-relative temple length', () => {
  for (const radius of [0.44, 0.55])
    for (const scale of [0.6, 1, 1.6]) {
      const t = { ...transform, width: transform.width * scale, height: transform.height * scale };
      const rig = createEyewearRig({ ...anchor, headShape: { radius, sideDepth: 0.3 } }, t, fit);
      for (const side of [-1, 1]) {
        const h = rig.templePoint(side, 0),
          p = rig.templePoint(side, fit.templeRootLength);
        assert.ok(p.z - h.z > Math.abs(p.x - h.x));
        close(rig.temples[0].physicalLength / t.width, fit.templeDepth);
        assert.ok(rig.templePoint(side, 0.52).x * side > Math.abs(h.x));
      }
    }
});

test('frontal wrap clears the hinge while posterior shafts seat on the upper head side for every product', () => {
  for (const widthMultiplier of [0.9, 0.98, 1.05])
    for (const sideHeight of [-0.12, -0.04, 0.04])
      for (const templeVerticalOffset of [-0.01, 0.016]) {
        const profile = {
          widthMultiplier,
          frontalVisibleFraction: 0.065,
          earSeatOffset: -0.02,
          earSeatWeight: 0.95,
          templeVerticalOffset,
        };
        for (const yaw of [-30, -15, 0, 15, 30]) {
          const rig = createEyewearRig(
            {
              ...anchor,
              rawYawDegrees: yaw,
              headShape: { radius: 0.5, sideDepth: 0.3, sideHeight },
            },
            transform,
            profile,
          );
          for (const side of [-1, 1]) {
            const hinge = rig.templePoint(side, 0),
              root = rig.templePoint(side, rig.headFit.rootLength),
              seat = rig.templePoint(side, 1),
              shaft = rig.templePoint(side, rig.headFit.sideProgress);
            close(root.y, hinge.y);
            assert.ok(seat.y < hinge.y && seat.y >= hinge.y - 0.09);
            assert.ok(shaft.y >= seat.y && shaft.y < hinge.y);
            assert.ok(seat.x * side >= Math.abs(hinge.x));
            if (yaw === 0) {
              const h = rig.project(hinge),
                r = rig.project(root);
              assert.ok(((r.x - h.x) * side) / rig.physicalWidth >= 0.065 - 1e-8);
              assert.ok(((r.x - h.x) * side) / rig.physicalWidth < 0.09);
            }
          }
        }
      }
});

test('upper side height uses head-local landmarks and rejects an isolated lower-face outlier', () => {
  const surface = Array.from({ length: 468 }, () => ({ x: 0, y: 0, z: 0 }));
  [127, 234, 93, 356, 454, 323].forEach((id, i) => {
    surface[id] = { x: i < 3 ? -0.5 : 0.5, y: [-0.03, 0.03, 0.09][i % 3], z: 0.3 };
  });
  surface[162] = { x: -0.48, y: -0.09, z: 0.28 };
  surface[389] = { x: 0.48, y: -0.09, z: 0.28 };
  close(estimateHeadShape(surface).sideHeight, -0.03);
  surface[93].y = 10;
  close(estimateHeadShape(surface).sideHeight, -0.03);
});

test('real lens aperture extraction excludes exterior transparency and preserves hinge neighborhoods', () => {
  const w = 40,
    h = 18,
    pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 2; y < 16; y++) for (let x = 1; x < 39; x++) pixels[(y * w + x) * 4 + 3] = 255;
  for (let y = 4; y < 14; y++)
    for (const [a, b] of [
      [4, 17],
      [23, 36],
    ])
      for (let x = a; x < b; x++) pixels[(y * w + x) * 4 + 3] = 0;
  const holes = measureLensApertures(pixels, w, h, { x: 1, y: 2, width: 38, height: 14 });
  assert.equal(holes.length, 2);
  assert.equal(
    holes.reduce((n, r) => n + r.pixels.length, 0),
    260,
  );
  assert.ok(holes.flatMap((r) => r.pixels).every((i) => i % w >= 4 && i % w < 36));
  // Opening a rim to exterior disables that aperture, rather than masking roots.
  for (let x = 1; x < 5; x++) pixels[(8 * w + x) * 4 + 3] = 0;
  assert.equal(measureLensApertures(pixels, w, h, { x: 1, y: 2, width: 38, height: 14 }).length, 1);
});

test('three separately calibrated backend eyewear packages share one engine and retain their own assets', () => {
  for (const [n, width, depth, curve] of [
    [1, 0.9, 0.55, 0.045],
    [2, 1, 0.62, 0.065],
    [3, 1.05, 0.75, 0.08],
  ]) {
    const base = `/assets/products/eyewear/measured-${n}/`;
    const profile = {
      widthMultiplier: width,
      templeDepth: depth,
      templeCurve: curve,
      templeRootLength: 0.2,
      templeVerticalOffset: 0.02,
      hinges: { left: { x: 0.035, y: 0.25 }, right: { x: 0.965, y: 0.25 } },
    };
    const product = {
      id: 900 + n,
      imageUrl: base + 'front.png',
      arMetadata: {
        frontAsset: base + 'front.png',
        leftTempleAsset: base + 'left-temple.png',
        rightTempleAsset: base + 'right-temple.png',
        fitProfile: profile,
      },
    };
    const resolved = sunglassesAssetFor(product, fit);
    assert.equal(resolved.frontFrameSrc, product.imageUrl);
    assert.equal(resolved.leftTempleSrc, product.arMetadata.leftTempleAsset);
    assert.equal(resolved.rightTempleSrc, product.arMetadata.rightTempleAsset);
    const t = accessoryTransform(anchor, defaultControls(), 1000, 750, 2.85, resolved.fit),
      rig = createEyewearRig(anchor, t, resolved.fit);
    close(rig.depth, depth);
    close(rig.headFit.curve, curve);
    for (const temple of rig.temples) {
      const mesh = rigidTempleMesh(rig, temple, part(temple.side < 0 ? 'left' : 'right'));
      assert.ok(mesh.strips.length >= 16 && mesh.strips.length <= 20);
      close(mesh.hinge.x, temple.hingeX);
      close(mesh.hinge.y, temple.hingeY);
    }
  }
});

test('posterior head shell is finite and behind the bridge in frontal pose, and follows the same root', () => {
  const rig = createEyewearRig(
    { ...anchor, faceSurface: Array(468).fill({ x: 0, y: 0, z: 0 }) },
    transform,
    fit,
  );
  assert.equal(rig.headShell.length, 8 * 24 * 6);
  assert.ok(
    rig.headShell.every((p) => p.depth >= 0.029 && p.perspective > 0 && Number.isFinite(p.x)),
  );
  const mesh = rigidTempleMesh(rig, rig.temples[0], part('left'));
  // Left hinge is at the right PHOTO edge, right hinge at its left PHOTO edge.
  assert.ok(mesh.strips[0][0].depth > mesh.strips.at(-1)[1].depth);
  const right = rigidTempleMesh(rig, rig.temples[1], part('right'));
  assert.ok(right.strips[0][0].depth < right.strips.at(-1)[1].depth);
});

// Test texture interpolation, not the diagnostic mesh.hinge property.
test('photographic hinge has an exact texture seam under every rigid pose', () => {
  for (const yaw of [0, -15, 15, -30, 30])
    for (const pitch of [-10, 0, 10]) {
      const rig = createEyewearRig(
        { ...anchor, rawYawDegrees: yaw, pitchDegrees: pitch },
        transform,
        fit,
      );
      for (const temple of rig.temples) {
        const asset = part(temple.side < 0 ? 'left' : 'right');
        const mesh = rigidTempleMesh(rig, temple, asset);
        const u = (asset.visibleHinge.x - asset.bounds.x) / asset.bounds.width;
        const index = mesh.columns.findIndex((c) => Math.abs(c - u) < 1e-12);
        assert.ok(index >= 0);
        const edge =
          index < mesh.strips.length
            ? [mesh.strips[index][0], mesh.strips[index][3]]
            : [mesh.strips.at(-1)[1], mesh.strips.at(-1)[2]];
        const v = (asset.visibleHinge.y - asset.bounds.y) / asset.bounds.height;
        const h = temple.side < 0 ? rig.front.leftHinge : rig.front.rightHinge;
        const w0 = 1 / edge[0].perspective,
          w1 = 1 / edge[1].perspective,
          w = w0 * (1 - v) + w1 * v;
        for (const k of ['x', 'y'])
          close((edge[0][k] * w0 * (1 - v) + edge[1][k] * w1 * v) / w, h[k]);
        close(edge[0].depth + v * (edge[1].depth - edge[0].depth), h.depth);
      }
    }
});

test('live face depth and eyewear root share filtered yaw/pitch through reversals', () => {
  const local = Array.from({ length: 468 }, (_, i) => ({
    x: ((i % 13) - 6) / 14,
    y: ((i % 7) - 3) / 8,
    z: 0.1 + (i % 5) / 30,
  }));
  const measured = (yaw, pitch) => {
    const y = (yaw * Math.PI) / 180,
      t = (pitch * Math.PI) / 180,
      c = Math.cos(y);
    return {
      ...anchor,
      rawYawDegrees: yaw,
      pitchDegrees: pitch,
      faceSurface: local.map((p) => {
        const py = Math.cos(t) * p.y - Math.sin(t) * p.z,
          pz = Math.sin(t) * p.y + Math.cos(t) * p.z;
        return {
          x: (Math.cos(y) * p.x - Math.sin(y) * pz) / c,
          y: py / c,
          z: (Math.sin(y) * p.x + Math.cos(y) * pz) / c,
        };
      }),
    };
  };
  let filtered = smoothAnchors(null, [measured(0, 0)], 16);
  for (const [yaw, pitch] of [
    [30, 10],
    [-30, -10],
    [15, 5],
    [0, 0],
  ]) {
    filtered = smoothAnchors(filtered, [measured(yaw, pitch)], 16);
    const actual = filtered[0],
      expected = measured(actual.rawYawDegrees, actual.pitchDegrees);
    assert.ok(Math.abs(actual.rawYawDegrees - yaw) > 1);
    for (let i = 0; i < 468; i++)
      for (const k of ['x', 'y', 'z']) close(actual.faceSurface[i][k], expected.faceSurface[i][k]);
  }
});
