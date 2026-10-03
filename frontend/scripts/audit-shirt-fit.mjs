// Read-only fitting audit using the existing real photo, Pose and renderer.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const file = process.argv[2] || 'public/assets/shirt.jpg';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.goto('http://127.0.0.1:5173/try-on?productId=tshirt-preview&arDebug=1');
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles({
    name: 'person.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(file),
  });
  await page.waitForFunction(() => !!window.__tryOnShirtDebug?.garment, null, { timeout: 40000 });
  const report = await page.evaluate(async () => {
    const { shirtCalibration, shirtPreviewProduct } = await import('/src/data/shirtProducts.js');
    const { loadShirtAsset } = await import('/src/components/tryon/shirtAssets.js');
    const { buildShirtMesh, drawRegion, regionImages } =
      await import('/src/components/tryon/shirtWarp.js');
    const fit = shirtCalibration(shirtPreviewProduct),
      asset = await loadShirtAsset(fit.asset);
    const g = window.__tryOnShirtDebug.geometry,
      mesh = buildShirtMesh(g, fit);
    const actual = document.querySelector('canvas[aria-label="T-shirt try-on canvas"]');
    const sleeves = ['left', 'right'].map((side) => {
      const c = Object.assign(document.createElement('canvas'), {
        width: actual.width,
        height: actual.height,
      });
      drawRegion(
        c.getContext('2d'),
        regionImages(asset, fit)[`${side}Sleeve`],
        mesh[`${side}Sleeve`],
        asset.bounds,
        fit,
      );
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data,
        sleeve = mesh.garment[`${side}Sleeve`];
      let projectedEnd = 0,
        pixels = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          if (data[(y * c.width + x) * 4 + 3] < 128) continue;
          const dx = x - sleeve.seamTop.x,
            dy = y - sleeve.seamTop.y;
          const lateral = Math.abs(dx * sleeve.normal.x + dy * sleeve.normal.y);
          if (lateral > sleeve.cuffWidth * 0.2) continue;
          projectedEnd = Math.max(projectedEnd, dx * sleeve.direction.x + dy * sleeve.direction.y);
          pixels++;
        }
      return {
        side,
        pixels,
        targetRatio: sleeve.lengthRatio,
        visibleRatio: projectedEnd / sleeve.armLength,
        angleDegrees: (sleeve.angle * 180) / Math.PI,
        seam: sleeve.seamTop,
        cuff: sleeve.cuffCenter,
      };
    });
    return {
      shoulders: [g.left.shoulder, g.right.shoulder],
      shoulderWidth: g.shoulderWidth,
      torsoHeight: g.torsoHeight,
      yaw: g.yaw,
      trackingMode: g.trackingMode,
      fusionMode: mesh.garment.trackingMode,
      widths: mesh.garment.widths,
      silhouette: g.silhouette && {
        quality: g.silhouette.quality,
        rows: g.silhouette.rows.map((r) => ({ t: r.t, sample: r.sample, weight: r.weight })),
      },
      performance: window.__tryOnShirtDebug.performance,
      fusionMode: mesh.garment.trackingMode,
      widths: mesh.garment.widths,
      silhouette: g.silhouette && {
        quality: g.silhouette.quality,
        rows: g.silhouette.rows.map((r) => ({ t: r.t, sample: r.sample, weight: r.weight })),
      },
      performance: window.__tryOnShirtDebug.performance,
      collar: mesh.garment.neckBaseCenter,
      sleeves,
    };
  });
  console.log(JSON.stringify(report, null, 2));
  if (process.argv[3]) {
    await page.getByLabel('Shirt AR diagnostics').evaluate((el) => (el.style.display = 'none'));
    await page.getByLabel('T-shirt try-on canvas').screenshot({ path: process.argv[3] });
  }
  if (process.argv[3]) {
    await page.getByLabel('Shirt AR diagnostics').evaluate((el) => (el.style.display = 'none'));
    await page.getByLabel('T-shirt try-on canvas').screenshot({ path: process.argv[3] });
  }
} finally {
  await browser.close();
}
