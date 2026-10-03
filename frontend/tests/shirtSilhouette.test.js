import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shirtCalibration } from '../src/data/shirtProducts.js';
import { measureTorso } from '../src/components/tryon/shirtGeometry.js';
import {
  structuredGarmentGeometry,
  torsoPanelPoint,
} from '../src/components/tryon/structuredShirtGeometry.js';
import {
  maskConfidence,
  measureTorsoSilhouette,
  silhouetteArmCorridors,
  inArmCorridor,
  updateSilhouetteTracking,
  silhouetteSnapshot,
} from '../src/components/tryon/shirtSilhouette.js';
const fit = shirtCalibration(),
  dimensions = { width: 800, height: 800 };
function pose() {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  for (const [id, x, y] of [
    [12, 0.34, 0.29],
    [11, 0.66, 0.29],
    [24, 0.38, 0.75],
    [23, 0.62, 0.75],
    [14, 0.2, 0.5],
    [13, 0.8, 0.5],
    [16, 0.16, 0.75],
    [15, 0.84, 0.75],
  ])
    landmarks[id] = { ...landmarks[id], x, y };
  return measureTorso({ landmarks }, 800, 800);
}
function mask(widthRatio, arms = false) {
  const pixels = new Uint8Array(800 * 800),
    body = pose();
  for (let y = 175; y < 790; y++)
    for (let x = 0; x < 800; x++) {
      const torso = Math.abs(x - 400) < (body.shoulderWidth * widthRatio) / 2;
      const limb = arms && (Math.abs(x - 145) < 25 || Math.abs(x - 655) < 25);
      pixels[y * 800 + x] = torso || limb ? 255 : 0;
    }
  return { width: 800, height: 800, pixels };
}
const fuse = (m, b = pose()) => {
  const measurement = measureTorsoSilhouette(m, b, fit, dimensions);
  return {
    measurement,
    g: structuredGarmentGeometry(
      {
        ...b,
        silhouette: silhouetteSnapshot(updateSilhouetteTracking(null, measurement, 0, false), 0),
      },
      fit,
    ),
  };
};
test('person mask maps intrinsic coordinates, ROI and selfie reflection once', () => {
  const m = { width: 2, height: 1, pixels: Uint8Array.of(0, 255) };
  assert.equal(maskConfidence(m, { x: 600, y: 400 }, dimensions), 1);
  assert.equal(maskConfidence(m, { x: 600, y: 400 }, dimensions, true), 0);
  assert.equal(
    maskConfidence(
      { ...m, roi: { x: 0.25, y: 0, width: 0.5, height: 1 } },
      { x: 500, y: 400 },
      dimensions,
    ),
    1,
  );
  assert.equal(maskConfidence(m, { x: 800, y: 400 }, dimensions), 0);
});
test('five torso heights plus shoulder row derive slim/medium/broad widths from pixels with the same skeleton', () => {
  const skeleton = pose();
  // Isolate body width with the same visible skeleton; limb-contamination
  // behaviour is covered independently below with elbow/wrist corridors.
  skeleton.left.elbow = skeleton.right.elbow = skeleton.left.wrist = skeleton.right.wrist = null;
  const shapes = [0.88, 1.15, 1.55].map((width) => fuse(mask(width), skeleton));
  for (const { measurement, g } of shapes) {
    assert.equal(measurement.validRows, 6);
    assert.equal(g.trackingMode, 'SILHOUETTE_FUSED');
    assert.ok(g.torso.rows.length >= 6);
  }
  for (const t of [0.12, 0.24, 0.5, 0.74, 1])
    assert.ok(
      shapes[0].g.widths[t] < shapes[1].g.widths[t] &&
        shapes[1].g.widths[t] < shapes[2].g.widths[t],
    );
});
test('row-specific chest/waist/hem widths adapt independently rather than one global multiplier', () => {
  const m = mask(1.5),
    b = pose();
  for (let y = 400; y < 790; y++)
    for (let x = 0; x < 800; x++)
      m.pixels[y * 800 + x] = Math.abs(x - 400) < b.shoulderWidth * 0.52 ? 255 : 0;
  const { g } = fuse(m, b);
  assert.ok(g.widths[0.24] > g.widths[0.74]);
  assert.ok(g.widths[0.74] < g.widths[1] * 1.02);
});
test('arm corridors use shoulder/elbow/wrist and disconnected arm foreground does not inflate torso widths', () => {
  const b = pose(),
    corridors = silhouetteArmCorridors(b);
  assert.equal(corridors.length, 4);
  assert.equal(inArmCorridor(b.left.elbow, corridors), true);
  const a = fuse(mask(1.15)).g,
    c = fuse(mask(1.15, true)).g;
  assert.deepEqual(a.widths, c.widths);
});
test('empty, noisy, implausibly narrow/wide masks retain exactly the existing Pose-only garment', () => {
  const baseline = structuredGarmentGeometry(pose(), fit);
  for (const m of [
    mask(0.2),
    mask(3),
    { width: 800, height: 800, pixels: new Uint8Array(800 * 800) },
  ]) {
    const { g } = fuse(m);
    assert.equal(g.trackingMode, 'POSE_ONLY');
    assert.deepEqual(g.torso, baseline.torso);
  }
});
test('silhouette borders smooth independently, reject isolated jumps, and accept sustained changes', () => {
  const first = measureTorsoSilhouette(mask(1.15), pose(), fit, dimensions);
  let state = updateSilhouetteTracking(null, first, 0, true);
  const changed = structuredClone(first);
  changed.rows.forEach((r) => (r.sample.leftRatio += 0.05));
  const next = updateSilhouetteTracking(state, changed, 70, true);
  assert.ok(next.rows[2].sample.leftRatio > state.rows[2].sample.leftRatio);
  assert.ok(next.rows[2].sample.leftRatio < changed.rows[2].sample.leftRatio);
  assert.equal(next.rows[2].sample.rightRatio, state.rows[2].sample.rightRatio);
  const jump = structuredClone(first);
  jump.rows.forEach((r) => (r.sample.leftRatio += 0.3));
  state = updateSilhouetteTracking(state, jump, 80, true);
  assert.equal(state.rows[2].sample.leftRatio, first.rows[2].sample.leftRatio);
  state = updateSilhouetteTracking(state, jump, 500, true);
  assert.ok(state.rows[2].sample.leftRatio > first.rows[2].sample.leftRatio);
});
test('missing segmentation holds briefly, fades to Pose-only and shoulder fallback never disappears', () => {
  const measurement = measureTorsoSilhouette(mask(1.15), pose(), fit, dimensions);
  let state = updateSilhouetteTracking(null, measurement, 0, false);
  state = updateSilhouetteTracking(state, null, 300);
  assert.equal(silhouetteSnapshot(state, 300).rows[2].weight, 1);
  assert.ok(silhouetteSnapshot(state, 600).rows[2].weight < 1);
  assert.equal(silhouetteSnapshot(state, 900), null);
  assert.equal(
    structuredGarmentGeometry({ ...pose(), trackingMode: 'SHOULDERS_ONLY' }, fit).trackingMode,
    'SHOULDER_FALLBACK',
  );
});
test('broad silhouette leaves collar size, sleeve length and vertical hem unchanged; wrists do not drive hem', () => {
  const a = fuse(mask(0.88)).g,
    b = fuse(mask(1.55)).g;
  assert.deepEqual(a.collarCenterBottom, b.collarCenterBottom);
  assert.deepEqual(a.leftNeckAnchor, b.leftNeckAnchor);
  assert.equal(a.leftSleeve.projectedLength, b.leftSleeve.projectedLength);
  assert.equal(a.torso.rows.at(-1).center.y, b.torso.rows.at(-1).center.y);
  const body = pose(),
    silhouette = fuse(mask(1.55)).measurement;
  const fused = {
    ...body,
    silhouette: silhouetteSnapshot(updateSilhouetteTracking(null, silhouette, 0, false), 0),
  };
  const before = structuredGarmentGeometry(fused, fit);
  fused.left.wrist = { x: 400, y: 100 };
  fused.right.wrist = { x: 400, y: 600 };
  assert.deepEqual(structuredGarmentGeometry(fused, fit).torso, before.torso);
});
test('logo-band remapping limits horizontal expansion while keeping fabric edges on the silhouette', () => {
  const g = fuse(mask(1.55)).g,
    logo = fit.silhouette.logo;
  const v = (logo.top + logo.bottom) / 2;
  const p = torsoPanelPoint(logo.left, v, g, fit),
    q = torsoPanelPoint(logo.right, v, g, fit);
  const baseline = structuredGarmentGeometry(pose(), fit);
  const bp = torsoPanelPoint(logo.left, v, baseline, fit),
    bq = torsoPanelPoint(logo.right, v, baseline, fit);
  assert.ok(Math.hypot(q.x - p.x, q.y - p.y) <= Math.hypot(bq.x - bp.x, bq.y - bp.y) * 1.14);
});
test('silhouette ease metadata is validated independently of original garment calibration', () => {
  assert.throws(() => shirtCalibration({ shirtAR: { silhouette: { waistEase: 0.5 } } }));
  assert.equal(shirtCalibration().hemLengthExtension, 0.07);
});
test('worker defaults to masks disabled, transfers copied shirt masks, and preserves Pose when mask extraction fails', async () => {
  const code = readFileSync(
    new URL('../src/services/poseLandmarker.worker.js', import.meta.url),
    'utf8',
  ).replace(/^import[^;]+;/, '');
  const responses = [],
    options = [],
    source = Float32Array.of(0, 0.5, 1, 1);
  let throws = false,
    closed = 0;
  const result = {
    landmarks: [[{ x: 0.5, y: 0.5, z: 0.2 }]],
    worldLandmarks: [[{ x: 0, y: 0, z: 0 }]],
    segmentationMasks: [
      {
        width: 2,
        height: 2,
        getAsFloat32Array() {
          if (throws) throw Error('Mask unavailable');
          return source;
        },
      },
    ],
    close() {
      closed++;
    },
  };
  const model = {
    async setOptions(o) {
      options.push(o);
    },
    detect() {
      return result;
    },
    detectForVideo() {
      return result;
    },
  };
  const self = {
    location: { origin: 'http://local' },
    postMessage(data, transfers) {
      responses.push({ data, transfers });
    },
  };
  new Function('self', 'FilesetResolver', 'PoseLandmarker', code)(
    self,
    { forVisionTasks: async () => ({}) },
    {
      createFromOptions: async (_, o) => {
        options.push(o);
        return model;
      },
    },
  );
  const message = (segmentation) => ({
    data: {
      segmentation,
      id: 1,
      timestamp: 1,
      live: false,
      roi: { x: 0, y: 0, width: 1, height: 1 },
      bitmap: { close() {} },
    },
  });
  await self.onmessage(message(false));
  assert.equal(options[0].outputSegmentationMasks, false);
  assert.equal(responses[0].data.segmentation, null);
  await self.onmessage(message(true));
  assert.deepEqual([...responses[1].data.segmentation.pixels], [0, 128, 255, 255]);
  assert.equal(responses[1].transfers.length, 1);
  assert.equal(source[1], 0.5);
  throws = true;
  await self.onmessage(message(true));
  assert.equal(responses[2].data.landmarks.length, 1);
  assert.equal(responses[2].data.segmentation, null);
  assert.match(responses[2].data.segmentationError, /Mask unavailable/);
  assert.equal(closed, 3);
});
