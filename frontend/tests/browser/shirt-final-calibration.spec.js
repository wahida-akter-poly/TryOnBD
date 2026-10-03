import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('normal real frontal photo preserves crew neck, connected shoulders, rounded cuffs and extended hem', async ({
  page,
}) => {
  test.setTimeout(120000);
  // Observe the actual production worker result; never inject pose landmarks
  // or run a second inference that can differ from the displayed IMAGE frame.
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      constructor(url, options) {
        super(url, options);
        if (String(url).includes('poseLandmarker.worker'))
          this.addEventListener('message', (event) => {
            if (event.data.landmarks) window.__shirtNormalPose = event.data;
          });
      }
    };
  });
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.goto('/try-on?productId=tshirt-preview');
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles({
    name: 'person.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('../../public/assets/shirt.jpg', import.meta.url)),
  });
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled({
    timeout: 40000,
  });
  await expect(page.getByLabel('Shirt AR diagnostics')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.__shirtNormalPose?.landmarks)).toBe(true);
  expect(await page.evaluate(() => window.__tryOnShirtDebug)).toBeUndefined();
  const measurements = await page.evaluate(async () => {
    const { shirtCalibration, shirtPreviewProduct } = await import('/src/data/shirtProducts.js');
    const { measureTorso, updateShirtTracking } =
      await import('/src/components/tryon/shirtGeometry.js');
    const { loadShirtAsset } = await import('/src/components/tryon/shirtAssets.js');
    const { buildShirtMesh, drawShirt, drawRegion, regionImages } =
      await import('/src/components/tryon/shirtWarp.js');
    const { torsoPanelPoint } = await import('/src/components/tryon/structuredShirtGeometry.js');
    const { measureTorsoSilhouette, updateSilhouetteTracking, silhouetteSnapshot } =
      await import('/src/components/tryon/shirtSilhouette.js');
    const fit = shirtCalibration(shirtPreviewProduct),
      asset = await loadShirtAsset(fit.asset);
    const visible = document.querySelector('canvas[aria-label="T-shirt try-on canvas"]');
    const canvas = () =>
      Object.assign(document.createElement('canvas'), {
        width: visible.width,
        height: visible.height,
      });
    const frame = canvas(),
      image = new Image();
    image.src = '/assets/shirt.jpg';
    await image.decode();
    frame.getContext('2d').drawImage(image, 0, 0, frame.width, frame.height);
    const result = window.__shirtNormalPose;
    const body = measureTorso(result, frame.width, frame.height, false, {
      allowShoulderFallback: true,
      fit,
    });
    if (body.error) throw new Error(body.error);
    const g = updateShirtTracking(null, body, fit, 0).geometry;
    g.silhouette = silhouetteSnapshot(
      updateSilhouetteTracking(
        null,
        measureTorsoSilhouette(
          result.segmentation,
          g,
          fit,
          { width: frame.width, height: frame.height },
          false,
        ),
        0,
        false,
      ),
      0,
    );
    const garment = canvas();
    drawShirt(garment.getContext('2d'), asset, g, fit);
    const alpha = garment.getContext('2d').getImageData(0, 0, garment.width, garment.height).data;
    const displayed = visible
      .getContext('2d')
      .getImageData(0, 0, visible.width, visible.height).data;
    const parts = regionImages(asset, fit),
      s = fit.sourceLandmarks;
    const pixel = (p) => (Math.round(p.y) * visible.width + Math.round(p.x)) * 4;
    const upperCoverage = [],
      seamCoverage = [],
      sourceOverlap = [];
    for (const side of ['left', 'right']) {
      let painted = 0,
        stable = 0,
        total = 0,
        connected = 0;
      const neck = s[side === 'left' ? 'collarLeft' : 'collarRight'],
        seam = s[`${side}ShoulderSeam`],
        pit = s[`${side}Armpit`];
      for (let i = 1; i < 10; i++)
        for (let j = 1; j < 10 - i; j++) {
          const u = neck.x * (1 - (i + j) / 10) + (seam.x * i) / 10 + (pit.x * j) / 10;
          const v = neck.y * (1 - (i + j) / 10) + (seam.y * i) / 10 + (pit.y * j) / 10;
          const p = torsoPanelPoint(u, v, buildShirtMesh(g, fit).garment, fit),
            k = pixel(p);
          total++;
          if (alpha[k + 3] >= 240) painted++;
          if (
            Math.abs(alpha[k] - displayed[k]) +
              Math.abs(alpha[k + 1] - displayed[k + 1]) +
              Math.abs(alpha[k + 2] - displayed[k + 2]) <=
            8
          )
            stable++;
        }
      const textures = [parts.torso, parts[`${side}Sleeve`]].map(
        (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data,
      );
      let both = 0;
      const dx = (pit.x - seam.x) * asset.bounds.width,
        dy = (pit.y - seam.y) * asset.bounds.height,
        len = Math.hypot(dx, dy);
      for (let i = 1; i < 10; i++) {
        const u = seam.x + ((pit.x - seam.x) * i) / 10,
          v = seam.y + ((pit.y - seam.y) * i) / 10;
        const p = torsoPanelPoint(u, v, buildShirtMesh(g, fit).garment, fit);
        if (alpha[pixel(p) + 3] >= 240) connected++;
        for (const sign of [-1, 0, 1]) {
          const delta =
            sign * (s.rightShoulderSeam.x - s.leftShoulderSeam.x) * asset.bounds.width * 0.005;
          const x = Math.round(asset.bounds.x + u * asset.bounds.width + (dy / len) * delta);
          const y = Math.round(asset.bounds.y + v * asset.bounds.height - (dx / len) * delta);
          const k = (y * parts.torso.width + x) * 4 + 3;
          if (textures.every((pixels) => pixels[k] >= 240)) both++;
        }
      }
      upperCoverage.push({ side, painted, stable, total });
      seamCoverage.push(connected);
      sourceOverlap.push(both);
    }
    const visibleSleeves = [];
    for (const yaw of [0, -10, 10, -20, 20])
      for (const side of ['left', 'right']) {
        const mesh = buildShirtMesh({ ...g, yaw }, fit),
          sl = mesh.garment[`${side}Sleeve`],
          c = canvas();
        drawRegion(
          c.getContext('2d'),
          parts[`${side}Sleeve`],
          mesh[`${side}Sleeve`],
          asset.bounds,
          fit,
        );
        const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let end = 0;
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            if (pixels[(y * c.width + x) * 4 + 3] < 128) continue;
            const dx = x - sl.seamTop.x,
              dy = y - sl.seamTop.y;
            if (Math.abs(dx * sl.normal.x + dy * sl.normal.y) > sl.cuffWidth * 0.2) continue;
            end = Math.max(end, dx * sl.direction.x + dy * sl.direction.y);
          }
        visibleSleeves.push({
          side,
          yaw,
          ratio: end / sl.armLength,
          tolerance: 1 / sl.armLength,
          down: sl.direction.y,
        });
      }
    const dress = buildShirtMesh(g, fit).garment;
    const collar = s.collarCenterBottom,
      p = torsoPanelPoint(collar.x, collar.y, dress, fit);
    const collarAlpha = alpha[pixel(p) + 3];
    const left = parts.leftSleeve.getContext('2d').getImageData(204, 509, 1, 1).data[3];
    const right = parts.rightSleeve.getContext('2d').getImageData(1070, 511, 1, 1).data[3];
    return {
      upperCoverage,
      seamCoverage,
      sourceOverlap,
      visibleSleeves,
      collarAlpha,
      roundedCuffAlpha: [left, right],
    };
  });
  console.log(`Final frontal calibration: ${JSON.stringify(measurements)}`);
  for (const sample of measurements.upperCoverage) {
    expect(sample.painted / sample.total).toBeGreaterThanOrEqual(0.95);
    expect(sample.stable / sample.total).toBeGreaterThanOrEqual(0.95);
  }
  expect(measurements.seamCoverage.every((n) => n === 9)).toBe(true);
  expect(measurements.sourceOverlap.every((n) => n === 27)).toBe(true);
  expect(measurements.collarAlpha).toBeGreaterThanOrEqual(240);
  expect(measurements.roundedCuffAlpha.every((a) => a >= 240)).toBe(true);
  for (const sleeve of measurements.visibleSleeves) {
    expect(sleeve.ratio).toBeGreaterThanOrEqual(0.5 - sleeve.tolerance);
    expect(sleeve.ratio).toBeLessThanOrEqual(0.6 + sleeve.tolerance);
    expect(sleeve.down).toBeGreaterThan(0.85);
  }
  await page
    .getByLabel('T-shirt try-on canvas')
    .screenshot({ path: 'artifacts/shirt-final-frontal.png' });
  await page
    .getByLabel('T-shirt try-on canvas')
    .screenshot({ path: 'artifacts/shirt-final-arm-down.png' });
});
