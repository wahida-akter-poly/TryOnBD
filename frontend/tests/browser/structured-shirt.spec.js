import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const scenarios = [
  { name: 'frontal', file: 'public/assets/shirt.jpg' },
  { name: 'hands-on-hips', file: 'tests/fixtures/shirt-hands-on-hips.jpg', occlusion: true },
  { name: 'left-turn', file: 'public/assets/panjabi.jpg' },
  {
    name: 'right-turn',
    file: 'tests/fixtures/shirt-hands-on-hips.jpg',
    live: true,
    occlusion: true,
  },
  { name: 'arm-raised', file: 'public/assets/editorial.jpg', occlusion: true },
  { name: 'right-arm-raised', file: 'public/assets/editorial.jpg', mirror: true },
];
for (const scenario of scenarios)
  test(`structured real portrait: ${scenario.name} uses shared pose fitting and connected garment regions`, async ({
    page,
  }) => {
    await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
    const bytes = await readFile(new URL(`../../${scenario.file}`, import.meta.url));
    const src = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    if (scenario.live)
      await page.addInitScript((src) => {
        navigator.mediaDevices.enumerateDevices = async () => [];
        navigator.mediaDevices.getUserMedia = async () => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = Object.assign(document.createElement('canvas'), {
              width: image.width,
              height: image.height,
            }),
            ctx = canvas.getContext('2d');
          const draw = () => ctx.drawImage(image, 0, 0);
          draw();
          const timer = setInterval(draw, 33),
            stream = canvas.captureStream(30),
            track = stream.getVideoTracks()[0],
            stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(timer);
            stop();
          };
          track.getSettings = () => ({ facingMode: 'user' });
          return stream;
        };
      }, src);
    await page.goto('/try-on?productId=tshirt-preview&arDebug=1');
    if (scenario.live) await page.getByRole('button', { name: 'Camera', exact: true }).click();
    else {
      const upload = scenario.mirror
        ? await page.evaluate(async (src) => {
            const image = new Image();
            image.src = src;
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
          }, src)
        : null;
      await page.getByLabel('Upload photo', { exact: true }).setInputFiles({
        name: scenario.mirror ? 'person.png' : 'person.jpg',
        mimeType: scenario.mirror ? 'image/png' : 'image/jpeg',
        buffer: upload ? Buffer.from(upload, 'base64') : bytes,
      });
    }
    await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled({
      timeout: 30000,
    });
    await expect.poll(() => page.evaluate(() => !!window.__tryOnShirtDebug?.garment)).toBe(true);
    const metrics = await page.evaluate(
      async ({ src, mirrored, live }) => {
        const { shirtCalibration, shirtPreviewProduct } =
          await import('/src/data/shirtProducts.js');
        const { loadShirtAsset } = await import('/src/components/tryon/shirtAssets.js');
        const { drawShirt } = await import('/src/components/tryon/shirtWarp.js');
        const { sleevePatchPoint, structuredGarmentGeometry } =
          await import('/src/components/tryon/structuredShirtGeometry.js');
        const { torsoPanelPoint } =
          await import('/src/components/tryon/structuredShirtGeometry.js');
        const { armOcclusionMasks, paintArmMasks } =
          await import('/src/components/tryon/shirtOcclusion.js');
        const fit = shirtCalibration(shirtPreviewProduct);
        // Imports can outlast a short VIDEO tracking hold. Snapshot only a
        // rendered frame, keeping the metadata and pixels from that same tick.
        const started = performance.now();
        while (!window.__tryOnShirtDebug?.garment || window.__tryOnShirtDebug.visibility < 0.95) {
          if (performance.now() - started > 10000)
            throw new Error('No visible tracked garment frame');
          await new Promise(requestAnimationFrame);
        }
        const debug = structuredClone(window.__tryOnShirtDebug),
          g = debug.geometry,
          dress = debug.garment;
        const c = document.querySelector('canvas[aria-label="T-shirt try-on canvas"]'),
          data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const image = new Image();
        image.src = src;
        await image.decode();
        const frame = Object.assign(document.createElement('canvas'), {
            width: c.width,
            height: c.height,
          }),
          fc = frame.getContext('2d');
        if (mirrored) {
          fc.translate(c.width, 0);
          fc.scale(-1, 1);
        }
        // Video colour conversion differs from the decoded JPEG. Compare to
        // the same decoded video frame that the production compositor uses.
        fc.drawImage(live ? document.querySelector('video') : image, 0, 0, c.width, c.height);
        const original = fc.getImageData(0, 0, c.width, c.height).data;
        const shirt = Object.assign(document.createElement('canvas'), {
          width: c.width,
          height: c.height,
        });
        drawShirt(shirt.getContext('2d'), await loadShirtAsset(fit.asset), g, fit);
        const garmentPixels = shirt.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const fading = Object.assign(document.createElement('canvas'), {
          width: c.width,
          height: c.height,
        });
        const fadingCtx = fading.getContext('2d');
        fadingCtx.drawImage(frame, 0, 0);
        drawShirt(fadingCtx, await loadShirtAsset(fit.asset), g, fit, 0.35, frame);
        const fadingPixels = fadingCtx.getImageData(0, 0, c.width, c.height).data;
        const maskCanvas = Object.assign(document.createElement('canvas'), {
          width: c.width,
          height: c.height,
        });
        paintArmMasks(
          maskCanvas.getContext('2d'),
          armOcclusionMasks(g, dress, fit).filter((m) => m.part === 'forearm'),
        );
        const maskPixels = maskCanvas.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let overlap = 0,
          restored = 0,
          fadingRestored = 0;
        // Check the actual tapered area, including edge overlaps that a sparse
        // forearm centreline misses. Exclude antialiased boundary pixels.
        for (let i = 0; i < data.length; i += 4) {
          if (maskPixels[i + 3] < 254 || garmentPixels[i + 3] < 240) continue;
          if (
            Math.abs(original[i] - garmentPixels[i]) +
              Math.abs(original[i + 1] - garmentPixels[i + 1]) +
              Math.abs(original[i + 2] - garmentPixels[i + 2]) <
            60
          )
            continue;
          overlap++;
          if (
            Math.abs(original[i] - fadingPixels[i]) +
              Math.abs(original[i + 1] - fadingPixels[i + 1]) +
              Math.abs(original[i + 2] - fadingPixels[i + 2]) <=
            6
          )
            fadingRestored++;
          if (
            Math.abs(original[i] - data[i]) +
              Math.abs(original[i + 1] - data[i + 1]) +
              Math.abs(original[i + 2] - data[i + 2]) <=
            6
          )
            restored++;
        }
        const row = dress.torso.rows[2],
          center = { x: (row.left.x + row.right.x) / 2, y: (row.left.y + row.right.y) / 2 };
        let torsoCoverage = 0;
        for (let y = Math.round(center.y) - 3; y <= Math.round(center.y) + 3; y++)
          for (let x = Math.round(center.x) - 3; x <= Math.round(center.x) + 3; x++)
            if (garmentPixels[(y * c.width + x) * 4 + 3] > 240) torsoCoverage++;
        const hem = dress.torso.rows.at(-1);
        const movedHands = structuredClone(g);
        movedHands.left.wrist = { x: c.width / 2, y: c.height / 3, z: -0.9 };
        movedHands.right.wrist = { x: c.width / 4, y: c.height * 0.8, z: 0.6 };
        const shifted = structuredGarmentGeometry(movedHands, fit);
        return {
          yaw: g.yaw,
          visibility: debug.visibility,
          trackingMode: g.trackingMode,
          torsoCoverage,
          hemTilt: Math.abs(hem.left.y - hem.right.y) / g.shoulderWidth,
          wristIndependent: JSON.stringify(shifted.torso) === JSON.stringify(dress.torso),
          cuffTapers: [dress.leftSleeve, dress.rightSleeve].map((s) => s.cuffWidth / s.bodyWidth),
          overlap,
          restored,
          fadingRestored,
          sleeveCoverage: ['left', 'right'].map((side) => {
            const p = sleevePatchPoint(0.85, 0.5, dress, side, fit);
            let pixels = 0;
            for (let y = Math.round(p.y) - 2; y <= Math.round(p.y) + 2; y++)
              for (let x = Math.round(p.x) - 2; x <= Math.round(p.x) + 2; x++)
                if (garmentPixels[(y * c.width + x) * 4 + 3] > 230) pixels++;
            return pixels;
          }),
          neckDistance:
            Math.hypot(
              dress.collarCenterBottom.x - g.shoulderMidpoint.x,
              dress.collarCenterBottom.y - g.shoulderMidpoint.y,
            ) / g.shoulderWidth,
          seams: ['left', 'right'].map(
            (side) =>
              Math.hypot(
                dress[`${side}Sleeve`].seamTop.x - g[side].shoulder.x,
                dress[`${side}Sleeve`].seamTop.y - g[side].shoulder.y,
              ) / g.shoulderWidth,
          ),
          ratios: [dress.leftSleeve.lengthRatio, dress.rightSleeve.lengthRatio],
          fusionMode: dress.trackingMode,
          seamAttachment: ['left', 'right'].map((side) => {
            const s = fit.sourceLandmarks[`${side}ShoulderSeam`],
              p = torsoPanelPoint(s.x, s.y, dress, fit);
            return Math.hypot(
              p.x - dress[`${side}Sleeve`].seamTop.x,
              p.y - dress[`${side}Sleeve`].seamTop.y,
            );
          }),
        };
      },
      { src, mirrored: scenario.live || scenario.mirror, live: !!scenario.live },
    );
    console.log(`Structured ${scenario.name}: ${JSON.stringify(metrics)}`);
    expect(metrics.neckDistance).toBeCloseTo(0.16, 2);
    expect(metrics.seams.every((x) => Number.isFinite(x) && x < 0.45)).toBe(true);
    expect(metrics.seamAttachment.every((x) => x < 0.001)).toBe(true);
    if (metrics.fusionMode === 'POSE_ONLY')
      expect(metrics.seams.every((x) => Math.abs(x - Math.hypot(0.075, 0.12)) < 0.001)).toBe(true);
    expect(metrics.ratios.every((x) => x >= 0.52 - 1e-9 && x <= 0.573 + 1e-9)).toBe(true);
    expect(metrics.hemTilt).toBeLessThanOrEqual(0.060001);
    expect(metrics.wristIndependent).toBe(true);
    expect(metrics.cuffTapers.every((x) => Math.abs(x - 0.9) < 0.0001)).toBe(true);
    expect(metrics.torsoCoverage).toBeGreaterThanOrEqual(40);
    expect(metrics.sleeveCoverage.every((x) => x >= 20)).toBe(true);
    await expect(page.getByLabel('Collar source points').locator('circle')).toHaveCount(4);
    for (const name of ['data-shirt-seams', 'data-shirt-overlap', 'data-shirt-arm-masks'])
      await expect(page.locator(`[${name}]`)).toHaveAttribute('d', /^M/);
    if (scenario.occlusion) {
      expect(metrics.overlap).toBeGreaterThan(0);
      expect(metrics.restored / metrics.overlap).toBeGreaterThan(0.9);
      expect(metrics.fadingRestored / metrics.overlap).toBeGreaterThan(0.9);
    }
    await page.getByLabel('Shirt AR diagnostics').evaluate((el) => (el.style.display = 'none'));
    await page
      .getByLabel('T-shirt try-on canvas')
      .screenshot({ path: `artifacts/shirt-structured-${scenario.name}.png` });
    if (['frontal', 'hands-on-hips', 'left-turn', 'right-turn'].includes(scenario.name))
      await page
        .getByLabel('T-shirt try-on canvas')
        .screenshot({ path: `artifacts/shirt-polished-${scenario.name}.png` });
    if (['left-turn', 'right-turn'].includes(scenario.name))
      await page
        .getByLabel('T-shirt try-on canvas')
        .screenshot({ path: `artifacts/shirt-final-${scenario.name}.png` });
    if (scenario.live) {
      await page.getByRole('button', { name: 'Capture', exact: true }).click();
      await expect(page.getByText('Captured', { exact: true })).toBeVisible();
    }
  });
