import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('normalized real temples have visible hinge-to-tip length, sane mirrored axes and unchanged front pixels', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/__temple-fixture.jpg', async (r) =>
    r.fulfill({
      contentType: 'image/jpeg',
      body: await readFile(new URL('../fixtures/ear-front.jpg', import.meta.url)),
    }),
  );
  await page.goto('/try-on?productId=2');
  const results = await page.evaluate(async () => {
    const { acquireFaceLandmarker } = await import('/src/services/faceLandmarker.js');
    const { loadGlassesAssembly } = await import('/src/components/tryon/accessoryAssets.js');
    const {
      faceAnchors,
      defaultControls,
      accessoryTransform,
      frontFrameGeometry,
      glassesTemples,
      drawAccessory,
    } = await import('/src/components/tryon/faceGeometry.js');
    const { resolveHeadPose } = await import('/src/components/tryon/headPose.js');
    const { accessoryStyles } = await import('/src/data/faceAccessories.js');
    const image = new Image();
    image.src = '/__temple-fixture.jpg';
    await image.decode();
    const width = 1000,
      height = Math.round((width * image.height) / image.width);
    const source = Object.assign(document.createElement('canvas'), { width, height });
    source.getContext('2d').drawImage(image, 0, 0, width, height);
    const detector = acquireFaceLandmarker();
    const detection = await detector.detect(source, false);
    detector.release();
    if (!detection) throw new Error('No actual face detected');
    const fit = accessoryStyles.find((s) => s.id === 'clear');
    const asset = await loadGlassesAssembly(
      fit.frontFrameSrc,
      fit.leftTempleSrc,
      fit.rightTempleSrc,
    );
    const controls = defaultControls();
    const blank = Object.assign(document.createElement('canvas'), {
      width: asset.image.width,
      height: asset.image.height,
    });
    return [0, -10, -15, -20, 10, 15, 20].map((degrees) => {
      const a = (degrees * Math.PI) / 180,
        c = Math.cos(a),
        s = Math.sin(a);
      const head = resolveHeadPose(
        null,
        { rows: 4, columns: 4, data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1] },
        0,
        false,
        0,
      );
      const anchor = faceAnchors(detection.landmarks, width, height, 'sunglasses', head)[0];
      const t = accessoryTransform(
        anchor,
        controls,
        width,
        height,
        asset.bounds.width / asset.bounds.height,
        fit,
      );
      const front = frontFrameGeometry(anchor, t, fit);
      const paths = glassesTemples(anchor, t, fit, asset);
      const canvas = Object.assign(document.createElement('canvas'), { width, height }),
        ctx = canvas.getContext('2d');
      drawAccessory(ctx, { ...asset, image: blank }, [anchor], controls, width, height, fit);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const arms = paths.map((p) => {
        const cloud = [];
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const w = pixels[(y * width + x) * 4 + 3] / 255;
            if (w < 16 / 255) continue;
            const dx = x + 0.5 - t.x,
              dy = y + 0.5 - t.y;
            const q = {
              x: dx * Math.cos(t.angle) + dy * Math.sin(t.angle),
              y: -dx * Math.sin(t.angle) + dy * Math.cos(t.angle),
              w,
            };
            if (p.side * (q.x - p.hingeX) >= -0.5) cloud.push(q);
          }
        if (!cloud.length) throw new Error('Temple erased');
        const axis = { x: p.side * Math.cos(p.assetAngle), y: p.side * Math.sin(p.assetAngle) };
        const projection = (q) => (q.x - p.hingeX) * axis.x + (q.y - p.hingeY) * axis.y;
        const end = Math.max(...cloud.map(projection));
        const tipPixels = cloud.filter((q) => projection(q) >= end - p.length * 0.02);
        const w = tipPixels.reduce((v, q) => v + q.w, 0);
        const tip = {
          x: tipPixels.reduce((v, q) => v + q.x * q.w, 0) / w,
          y: tipPixels.reduce((v, q) => v + q.y * q.w, 0) / w,
        };
        const hingePixel = cloud.reduce((closest, q) =>
          Math.hypot(q.x - p.hingeX, q.y - p.hingeY) <
          Math.hypot(closest.x - p.hingeX, closest.y - p.hingeY)
            ? q
            : closest,
        );
        const weight = cloud.reduce((v, q) => v + q.w, 0);
        const cx = cloud.reduce((v, q) => v + q.x * q.w, 0) / weight;
        const cy = cloud.reduce((v, q) => v + q.y * q.w, 0) / weight;
        const xx = cloud.reduce((v, q) => v + q.w * (q.x - cx) ** 2, 0) / weight;
        const yy = cloud.reduce((v, q) => v + q.w * (q.y - cy) ** 2, 0) / weight;
        const xy = cloud.reduce((v, q) => v + q.w * (q.x - cx) * (q.y - cy), 0) / weight;
        return {
          side: p.side,
          near: p.near,
          pixels: cloud.length,
          visibleRatio:
            Math.hypot(tip.x - hingePixel.x, tip.y - hingePixel.y) /
            (front.leftWidth + front.rightWidth),
          axisDegrees: (Math.atan2(2 * xy, xx - yy) * 90) / Math.PI,
          hingeError: Math.hypot(hingePixel.x - p.hingeX, hingePixel.y - p.hingeY),
          tipError: Math.hypot(tip.x - p.target.x, tip.y - p.target.y),
        };
      });
      // Verify identical front draw arguments/transform and alpha footprint.
      // GPU readback can round translucent RGB by one after multiple passes.
      const recordFront = (context) => {
        let draw;
        const original = context.drawImage.bind(context);
        context.drawImage = (image, ...args) => {
          if (image === asset.image) {
            const m = context.getTransform();
            draw = { args, transform: [m.a, m.b, m.c, m.d, m.e, m.f], alpha: context.globalAlpha };
          }
          return original(image, ...args);
        };
        return () => draw;
      };
      const frontCanvas = Object.assign(document.createElement('canvas'), { width, height });
      const frontCtx = frontCanvas.getContext('2d');
      const frontDraw = recordFront(frontCtx),
        fullDraw = recordFront(ctx);
      drawAccessory(
        frontCtx,
        { image: asset.image, bounds: asset.bounds },
        [anchor],
        controls,
        width,
        height,
        fit,
      );
      ctx.clearRect(0, 0, width, height);
      drawAccessory(ctx, asset, [anchor], controls, width, height, fit);
      const full = ctx.getImageData(0, 0, width, height).data,
        only = frontCtx.getImageData(0, 0, width, height).data;
      let frontDifference = 0;
      let maxFrontDifference = 0;
      let frontAlphaDifference = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const lx = (x + 0.5 - t.x) * Math.cos(t.angle) + (y + 0.5 - t.y) * Math.sin(t.angle);
          if (lx <= front.leftHinge.x + 2 || lx >= front.rightHinge.x - 2) continue;
          for (let channel = 0; channel < 4; channel++)
            if (full[(y * width + x) * 4 + channel] !== only[(y * width + x) * 4 + channel]) {
              frontDifference++;
              maxFrontDifference = Math.max(
                maxFrontDifference,
                Math.abs(full[(y * width + x) * 4 + channel] - only[(y * width + x) * 4 + channel]),
              );
              if (channel === 3) frontAlphaDifference++;
            }
        }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(source, 0, 0);
      drawAccessory(ctx, asset, [anchor], controls, width, height, fit);
      const panel = document.createElement('div');
      panel.dataset.templeCalibration = String(degrees);
      panel.style.cssText =
        'position:fixed;left:0;top:0;width:900px;height:850px;overflow:hidden;z-index:9999;background:white;visibility:hidden';
      const zoom = 900 / (anchor.width * 2.5);
      canvas.style.width = `${width * zoom}px`;
      canvas.style.height = `${height * zoom}px`;
      canvas.style.marginLeft = `${-(anchor.x - anchor.width * 1.25) * zoom}px`;
      canvas.style.marginTop = `${-Math.max(0, anchor.y - anchor.width * 0.85) * zoom}px`;
      panel.append(canvas);
      document.body.append(panel);
      return {
        degrees,
        arms,
        frontDifference,
        maxFrontDifference,
        frontAlphaDifference,
        sameFrontDraw: JSON.stringify(frontDraw()) === JSON.stringify(fullDraw()),
      };
    });
  });
  console.log('Actual normalized temple pixels:', JSON.stringify(results));
  for (const r of results) {
    expect(r.sameFrontDraw).toBe(true);
    expect(r.frontAlphaDifference).toBe(0);
    expect(r.maxFrontDifference).toBeLessThanOrEqual(1);
    for (const p of r.arms) {
      expect(p.pixels).toBeGreaterThan(!r.degrees ? 80 : Math.abs(r.degrees) === 10 ? 110 : 150);
      expect(p.hingeError).toBeLessThan(2);
      expect(p.tipError).toBeLessThan(4);
      expect(Math.abs(p.axisDegrees)).toBeLessThan(8);
      // Pixel centroids have a small raster tolerance around the nominal
      // projection targets tested exactly in faceGeometry.test.js.
      const ranges = {
        0: { near: [0.14, 0.16], far: [0.14, 0.16] },
        10: { near: [0.25, 0.31], far: [0.18, 0.21] },
        15: { near: [0.38, 0.43], far: [0.22, 0.26] },
        20: { near: [0.5, 0.55], far: [0.28, 0.32] },
      };
      const [min, max] = ranges[Math.abs(r.degrees)][p.near ? 'near' : 'far'];
      expect(p.visibleRatio).toBeGreaterThan(min);
      expect(p.visibleRatio).toBeLessThan(max);
    }
    if (!r.degrees) expect(Math.abs(r.arms[0].axisDegrees + r.arms[1].axisDegrees)).toBeLessThan(1);
  }
  for (const [degrees, name] of [
    [0, 'frontal'],
    [-10, 'left-10'],
    [-15, 'left-15'],
    [-20, 'left-20'],
    [10, 'right-10'],
    [15, 'right-15'],
    [20, 'right-20'],
  ]) {
    const panel = page.locator(`[data-temple-calibration="${degrees}"]`);
    await panel.evaluate((el) => {
      el.style.visibility = 'visible';
    });
    await panel.screenshot({ path: `artifacts/modern-clear-tuned-${name}.png` });
    await panel.evaluate((el) => {
      el.style.visibility = 'hidden';
    });
  }
});
