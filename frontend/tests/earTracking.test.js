import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateEarTracking,
  fuseEarAnchors,
  posePointToCanvas,
  faceToCanvas,
  canvasToFace,
} from '../src/components/tryon/earTracking.js';
import { hingeToHeadPaths, templeQuad } from '../src/components/tryon/templeGeometry.js';
const face = { x: 500, y: 300, width: 400, angle: 0, yaw: 0 };
const transform = { x: 500, y: 300, width: 400, height: 140, angle: 0 };
const front = { leftHinge: { x: -180, y: 0 }, rightHinge: { x: 180, y: 0 } };
const landmarks = () => {
  const p = Array(33).fill(null);
  p[8] = { x: 0.26, y: 0.5, visibility: 0.98, presence: 0.99 };
  p[7] = { x: 0.74, y: 0.5, visibility: 0.98, presence: 0.99 };
  return p;
};
test('official ear IDs map to display sides, with upper/front calibrated offsets', () => {
  const t = updateEarTracking(null, landmarks(), face, 1000, 600, false, 0);
  assert.deepEqual(
    t.map((p) => p.landmarkId),
    [8, 7],
  );
  assert.deepEqual(
    t.map((p) => p.status),
    ['EAR_TRACKED', 'EAR_TRACKED'],
  );
  assert.ok(Math.abs(t[0].good.x - (-0.6 + 0.012)) < 1e-9);
  assert.equal(t[0].good.y, -0.035);
  const mirrored = updateEarTracking(null, landmarks(), face, 1000, 600, true, 0);
  assert.deepEqual(
    mirrored.map((p) => p.landmarkId),
    [7, 8],
  );
  assert.deepEqual(
    mirrored.map((p) => p.good),
    t.map((p) => p.good),
  );
});
test('same normalized point maps to canvas backing pixels independent of CSS and DPR', () => {
  assert.deepEqual(posePointToCanvas({ x: 0.2, y: 0.3 }, 1280, 720, true), { x: 1024, y: 216 });
  const rolled = { ...face, angle: 0.3 };
  const p = { x: -0.6, y: 0.1 };
  const restored = canvasToFace(faceToCanvas(p, rolled), rolled);
  assert.ok(Math.hypot(restored.x - p.x, restored.y - p.y) < 1e-9);
});
test('medium confidence blends the actual ear with the proxy and NaN confidence is rejected', () => {
  const p = landmarks();
  p[7].visibility = 0.75;
  p[8].visibility = 0.75;
  const tracks = updateEarTracking(null, p, face, 1000, 600, false, 0);
  const paths = hingeToHeadPaths(face, transform, front);
  const fused = fuseEarAnchors(null, tracks, face, paths, transform, 0, 1000);
  assert.ok(fused[0].poseWeight > 0 && fused[0].poseWeight < 1);
  assert.ok(
    fused[0].y > tracks[0].good.y &&
      fused[0].y < paths.find((v) => v.side < 0).target.y / face.width,
  );
  p[8].visibility = NaN;
  assert.equal(updateEarTracking(tracks, p, face, 1000, 600, false, 66)[0].status, 'EAR_WEAK');
});
test('invalid, crossed, eye-region, out-of-frame and jumped ears retain valid history', () => {
  const previous = updateEarTracking(null, landmarks(), face, 1000, 600, false, 0);
  for (const point of [
    { x: NaN, y: 0.5 },
    { x: 0.74, y: 0.5 },
    { x: 0.49, y: 0.5 },
    { x: -0.1, y: 0.5 },
    { x: 0.05, y: 0.5 },
  ]) {
    const p = landmarks();
    p[8] = { ...point, visibility: 1, presence: 1 };
    const next = updateEarTracking(previous, p, face, 1000, 600, false, 66);
    assert.deepEqual(next[0].good, previous[0].good);
    assert.equal(next[0].status, 'EAR_WEAK');
  }
});
test('ear EMA is responsive, weakness holds then loss blends to a face/yaw proxy', () => {
  const previous = updateEarTracking(null, landmarks(), face, 1000, 600, false, 0);
  const moved = landmarks();
  moved[8].x += 0.02;
  const filtered = updateEarTracking(previous, moved, face, 1000, 600, false, 66);
  assert.ok(
    filtered[0].good.x > previous[0].good.x && filtered[0].good.x < previous[0].good.x + 0.05,
  );
  const paths = hingeToHeadPaths(face, transform, front);
  const actual = fuseEarAnchors(null, previous, face, paths, transform, 0, 16);
  const weak = updateEarTracking(previous, null, face, 1000, 600, false, 100);
  const held = fuseEarAnchors(actual, weak, face, paths, transform, 100, 16);
  assert.equal(held[0].source, 'HELD');
  assert.deepEqual(held[0].x, actual[0].x);
  const lost = fuseEarAnchors(held, weak, face, paths, transform, 600, 16);
  assert.equal(lost[0].source, 'FALLBACK');
  assert.equal(lost[0].status, 'EAR_LOST');
  assert.ok(Math.abs(lost[0].x - held[0].x) < 0.03);
});
test('confident ears determine vectors regardless of yaw; hinges and curve endpoints stay fixed', () => {
  const tracks = updateEarTracking(null, landmarks(), face, 1000, 600, false, 0);
  const ears = fuseEarAnchors(
    null,
    tracks,
    face,
    hingeToHeadPaths(face, transform, front),
    transform,
    0,
    1000,
  );
  const paths = [];
  for (const yaw of [-0.375, 0, 0.375]) {
    const p = hingeToHeadPaths({ ...face, yaw, earAnchors: ears }, transform, front);
    paths.push(p);
    assert.equal(p[1].side, yaw > 0 ? -1 : 1);
    for (const arm of p) {
      const ear = ears.find((v) => v.side === arm.side);
      assert.ok(
        Math.hypot(arm.target.x - ear.x * face.width, arm.target.y - ear.y * face.width) < 1e-8,
      );
      const part = {
        bounds: { width: 996, height: 235 },
        hingePivot: { x: arm.side < 0 ? 1 : 0, y: 0.14 },
        earPivot: { y: 0.9 },
      };
      const q = templeQuad(arm, part, transform);
      assert.equal(q.strips.length, 8);
      for (const strip of q.strips) {
        const area =
          strip.reduce((sum, v, i) => {
            const n = strip[(i + 1) % 4];
            return sum + v.x * n.y - v.y * n.x;
          }, 0) / 2;
        assert.ok(area > 0);
        for (const point of strip) assert.ok(arm.side * (point.x - arm.hingeX) >= -1e-8);
      }
      assert.equal(q.hingeTop.x, arm.hingeX);
      const target = {
        x: q.targetTop.x * 0.1 + q.targetBottom.x * 0.9,
        y: q.targetTop.y * 0.1 + q.targetBottom.y * 0.9,
      };
      assert.ok(Math.hypot(target.x - arm.target.x, target.y - arm.target.y) < 1e-8);
      assert.ok(q.height < transform.width * 0.1);
    }
  }
  for (const side of [-1, 1])
    assert.deepEqual(
      paths[0].find((p) => p.side === side).target,
      paths[2].find((p) => p.side === side).target,
    );
});
