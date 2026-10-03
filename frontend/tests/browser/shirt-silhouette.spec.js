import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const localReference = (name, fallback) =>
  existsSync(new URL(`../fixtures/${name}`, import.meta.url)) ? `tests/fixtures/${name}` : fallback;
const cases = [
  { name: 'slim', file: localReference('shirt-slim-reference.png', 'public/assets/panjabi.jpg') },
  { name: 'medium', file: 'public/assets/shirt.jpg' },
  {
    name: 'broad',
    file: localReference('shirt-broad-reference.png', 'tests/fixtures/shirt-hands-on-hips.jpg'),
  },
  { name: 'left-turn', file: 'public/assets/panjabi.jpg' },
  { name: 'right-turn', file: 'tests/fixtures/shirt-hands-on-hips.jpg', mirror: true },
];
for (const scenario of cases)
  test(`real silhouette fusion: ${scenario.name} covers measured torso side boundaries`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
    await page.goto('/try-on?productId=tshirt-preview&arDebug=1');
    let bytes = await readFile(new URL(`../../${scenario.file}`, import.meta.url));
    if (scenario.mirror) {
      const encoded = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${base64}`;
        await image.decode();
        const c = Object.assign(document.createElement('canvas'), {
            width: image.width,
            height: image.height,
          }),
          ctx = c.getContext('2d');
        ctx.translate(c.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, 0);
        return c.toDataURL('image/png').split(',')[1];
      }, bytes.toString('base64'));
      bytes = Buffer.from(encoded, 'base64');
    }
    await page
      .getByLabel('Upload photo', { exact: true })
      .setInputFiles({
        name: scenario.mirror ? 'person.png' : scenario.file.split('/').at(-1),
        mimeType: scenario.mirror || scenario.file.endsWith('.png') ? 'image/png' : 'image/jpeg',
        buffer: bytes,
      });
    await expect
      .poll(() => page.evaluate(() => window.__tryOnShirtDebug?.garment?.trackingMode), {
        timeout: 45000,
      })
      .toBe('SILHOUETTE_FUSED');
    const report = await page.evaluate(async () => {
      const { shirtCalibration, shirtPreviewProduct } = await import('/src/data/shirtProducts.js');
      const { loadShirtAsset } = await import('/src/components/tryon/shirtAssets.js');
      const { drawShirt } = await import('/src/components/tryon/shirtWarp.js');
      const { structuredGarmentGeometry } =
        await import('/src/components/tryon/structuredShirtGeometry.js');
      const { inArmCorridor } = await import('/src/components/tryon/shirtSilhouette.js');
      const d = window.__tryOnShirtDebug,
        g = d.geometry,
        fit = shirtCalibration(shirtPreviewProduct),
        actual = document.querySelector('canvas[aria-label="T-shirt try-on canvas"]');
      const garment = Object.assign(document.createElement('canvas'), {
        width: actual.width,
        height: actual.height,
      });
      drawShirt(garment.getContext('2d'), await loadShirtAsset(fit.asset), g, fit);
      const pixels = garment.getContext('2d').getImageData(0, 0, actual.width, actual.height).data;
      const visible = actual.getContext('2d').getImageData(0, 0, actual.width, actual.height).data;
      const rows = [];
      for (const r of g.silhouette.diagnostics.rows.filter((r) => r.t >= 0.24 && r.sample)) {
        let covered = 0,
          same = 0,
          total = 0;
        for (const side of ['left', 'right'])
          for (const inset of [0.02, 0.04, 0.07]) {
            const edge = r[side],
              point = {
                x: edge.x + (r.center.x - edge.x) * inset,
                y: edge.y + (r.center.y - edge.y) * inset,
              };
            if (inArmCorridor(point, g.silhouette.diagnostics.corridors)) continue;
            const x = Math.round(point.x),
              y = Math.round(point.y);
            if (x < 0 || y < 0 || x >= actual.width || y >= actual.height) continue;
            const k = (y * actual.width + x) * 4;
            total++;
            if (pixels[k + 3] >= 235) covered++;
            if (
              Math.abs(pixels[k] - visible[k]) +
                Math.abs(pixels[k + 1] - visible[k + 1]) +
                Math.abs(pixels[k + 2] - visible[k + 2]) <=
              10
            )
              same++;
          }
        rows.push({
          t: r.t,
          total,
          covered,
          same,
          left: r.sample.leftRatio * g.shoulderWidth,
          right: r.sample.rightRatio * g.shoulderWidth,
          inferred: !!r.sample.inferred,
        });
      }
      const pose = structuredGarmentGeometry({ ...g, silhouette: null }, fit);
      return {
        file: null,
        canvasWidth: actual.width,
        shoulderWidth: g.shoulderWidth,
        maskQuality: g.silhouette.quality,
        mode: d.garment.trackingMode,
        widths: d.garment.widths,
        poseWidths: pose.widths,
        rows,
        performance: d.performance,
      };
    });
    report.file = scenario.file;
    console.log(`Silhouette ${scenario.name}: ${JSON.stringify(report)}`);
    expect(report.maskQuality).toBeGreaterThan(0.68);
    const samples = report.rows.reduce((sum, r) => sum + r.total, 0);
    expect(samples).toBeGreaterThanOrEqual(6);
    expect(report.rows.reduce((sum, r) => sum + r.covered, 0) / samples).toBeGreaterThanOrEqual(
      0.9,
    );
    expect(report.rows.reduce((sum, r) => sum + r.same, 0) / samples).toBeGreaterThanOrEqual(0.9);
    await expect(page.locator('[data-shirt-corridor]')).toHaveAttribute('d', /^M/);
    await expect(page.locator('[data-shirt-silhouette]')).toHaveAttribute('d', /^M/);
    await page.getByLabel('Shirt AR diagnostics').evaluate((el) => (el.style.display = 'none'));
    await page
      .getByLabel('T-shirt try-on canvas')
      .screenshot({ path: `artifacts/shirt-silhouette-${scenario.name}.png` });
    await writeFile(
      `artifacts/shirt-silhouette-${scenario.name}.json`,
      JSON.stringify(report, null, 2),
    );
  });

test('real VIDEO person mask uses one worker/stream and stays responsive while reusing silhouette rows', async ({
  page,
}) => {
  test.setTimeout(120000);
  const src = `data:image/jpeg;base64,${(await readFile(new URL('../../tests/fixtures/shirt-hands-on-hips.jpg', import.meta.url))).toString('base64')}`;
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.addInitScript((src) => {
    const WorkerBase = window.Worker;
    window.silhouettePerf = { workers: 0, cameras: 0, inFlight: 0, maxInFlight: 0, tracks: [] };
    window.Worker = class extends WorkerBase {
      constructor(url, options) {
        super(url, options);
        if (String(url).includes('poseLandmarker.worker')) {
          window.silhouettePerf.workers++;
          this.addEventListener('message', () => window.silhouettePerf.inFlight--);
          const post = this.postMessage.bind(this);
          this.postMessage = (...args) => {
            window.silhouettePerf.inFlight++;
            window.silhouettePerf.maxInFlight = Math.max(
              window.silhouettePerf.maxInFlight,
              window.silhouettePerf.inFlight,
            );
            post(...args);
          };
        }
      }
    };
    navigator.mediaDevices.enumerateDevices = async () => [];
    navigator.mediaDevices.getUserMedia = async () => {
      window.silhouettePerf.cameras++;
      const image = new Image();
      image.src = src;
      await image.decode();
      const c = Object.assign(document.createElement('canvas'), {
          width: image.width,
          height: image.height,
        }),
        ctx = c.getContext('2d');
      const draw = () => ctx.drawImage(image, 0, 0);
      draw();
      const timer = setInterval(draw, 33),
        stream = c.captureStream(30),
        track = stream.getVideoTracks()[0],
        stop = track.stop.bind(track);
      track.stop = () => {
        clearInterval(timer);
        stop();
      };
      track.getSettings = () => ({ facingMode: 'user' });
      window.silhouettePerf.tracks.push(track);
      return stream;
    };
  }, src);
  await page.goto('/try-on?productId=tshirt-preview&arDebug=1');
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__tryOnShirtDebug?.performance.poseCalls || 0), {
      timeout: 45000,
    })
    .toBeGreaterThan(12);
  const metrics = await page.evaluate(() => ({
    ...window.__tryOnShirtDebug.performance,
    mode: window.__tryOnShirtDebug.garment?.trackingMode,
    worker: window.silhouettePerf.workers,
    camera: window.silhouettePerf.cameras,
    maxInFlight: window.silhouettePerf.maxInFlight,
  }));
  console.log(`Silhouette VIDEO performance: ${JSON.stringify(metrics)}`);
  expect(metrics.worker).toBe(1);
  expect(metrics.camera).toBe(1);
  expect(metrics.maxInFlight).toBe(1);
  expect(metrics.segmentationCalls).toBeGreaterThan(10);
  expect(metrics.poseHz).toBeGreaterThan(2);
  expect(metrics.renderHz).toBeGreaterThan(8);
  expect(metrics.segmentationHz).toBeLessThanOrEqual(15.5);
  await writeFile('artifacts/shirt-silhouette-performance.json', JSON.stringify(metrics, null, 2));
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.silhouettePerf.tracks.every((t) => t.readyState === 'ended')),
    )
    .toBe(true);
});
