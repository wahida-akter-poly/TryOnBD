import { test, expect } from '@playwright/test';
import { installFrameFixtures } from './frame-fixtures.js';

test('restored PNG projections show both real arms on a portrait without destructive contour shortening', async ({
  page,
}) => {
  test.setTimeout(120000);
  await installFrameFixtures(page);
  await page.goto('/try-on?productId=2');
  const results = await page.evaluate(async () => {
    const { acquireFaceLandmarker } = await import('/src/services/faceLandmarker.js');
    const { loadGlassesAssembly } = await import('/src/components/tryon/accessoryAssets.js');
    const { faceAnchors, defaultControls, accessoryTransform, glassesTemples, drawAccessory } =
      await import('/src/components/tryon/faceGeometry.js');
    const { resolveHeadPose } = await import('/src/components/tryon/headPose.js');
    const { accessoryStyles } = await import('/src/data/faceAccessories.js');
    const image = new Image();
    image.src = '/assets/portrait.jpg';
    await image.decode();
    const lease = acquireFaceLandmarker();
    const detection = await lease.detect(image, false);
    lease.release();
    if (!detection) throw new Error('Portrait fixture has no detected face');
    const fit = accessoryStyles.find((s) => s.id === 'clear');
    const asset = await loadGlassesAssembly(
      fit.frontFrameSrc,
      fit.leftTempleSrc,
      fit.rightTempleSrc,
    );
    const blank = document.createElement('canvas');
    blank.width = asset.image.width;
    blank.height = asset.image.height;
    const controls = defaultControls(),
      width = image.width,
      height = image.height;
    return [0, -30, 30].map((degrees) => {
      // Deterministic yaw inputs exercise the existing matrix resolver on the
      // same detected portrait. These are pose fixtures, not real turned photos.
      const radians = (degrees * Math.PI) / 180,
        c = Math.cos(radians),
        s = Math.sin(radians);
      const matrix = {
        rows: 4,
        columns: 4,
        data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1],
      };
      const pose = resolveHeadPose(null, matrix, 0, false, 0);
      const anchor = faceAnchors(detection.landmarks, width, height, 'sunglasses', pose)[0];
      const transform = accessoryTransform(
        anchor,
        controls,
        width,
        height,
        asset.bounds.width / asset.bounds.height,
        fit,
      );
      const paths = glassesTemples(anchor, transform, fit, asset);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const measure = (occluded) => {
        ctx.clearRect(0, 0, width, height);
        drawAccessory(
          ctx,
          { ...asset, image: blank },
          [{ ...anchor, headContour: occluded ? anchor.headContour : null }],
          controls,
          width,
          height,
          fit,
        );
        const pixels = ctx.getImageData(0, 0, width, height).data;
        return paths.map((p) => {
          let count = 0,
            along = 0,
            intrusion = 0;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              if (pixels[(y * width + x) * 4 + 3] < 10) continue;
              const dx = x + 0.5 - transform.x,
                dy = y + 0.5 - transform.y;
              const lx = dx * Math.cos(transform.angle) + dy * Math.sin(transform.angle);
              const ly = -dx * Math.sin(transform.angle) + dy * Math.cos(transform.angle);
              if ((lx - p.hingeX) * p.side <= 1) continue;
              count++;
              const vx = lx - p.hingeX,
                vy = ly - p.hingeY;
              const t = (vx * p.vector.x + vy * p.vector.y) / (p.length * p.length);
              const perpendicular = Math.abs(vx * p.vector.y - vy * p.vector.x) / p.length;
              if (t > 0.15 && t < 1.15 && perpendicular < transform.width * 0.085) along++;
            }
          // Inward lens pixels are checked independently of each arm's vector.
          const hinges = paths.map((v) => v.hingeX).sort((a, b) => a - b);
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              const dx = x + 0.5 - transform.x,
                dy = y + 0.5 - transform.y;
              const lx = dx * Math.cos(transform.angle) + dy * Math.sin(transform.angle);
              if (lx > hinges[0] + 1 && lx < hinges[1] - 1 && pixels[(y * width + x) * 4 + 3] >= 10)
                intrusion++;
            }
          return { side: p.side, near: p.near, length: p.length, count, along, intrusion };
        });
      };
      const visible = measure(true),
        unmasked = measure(false);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0);
      drawAccessory(ctx, asset, [anchor], controls, width, height, fit);
      canvas.dataset.pose = String(degrees);
      canvas.style.width = '800px';
      canvas.style.height = 'auto';
      document.body.append(canvas);
      return { degrees, visible, unmasked };
    });
  });
  console.log('Portrait temple coverage:', JSON.stringify(results));
  // The user-facing stable renderer must not let a close-up contour completely
  // erase the far arm. Depth is expressed through its yaw length and alpha.
  for (const result of results) expect(result.visible).toEqual(result.unmasked);
  for (const result of results)
    for (const p of result.visible) {
      expect(p.count, `${result.degrees}: outside hinge ${p.side}`).toBeGreaterThan(25);
      expect(p.along, `${result.degrees}: along head vector ${p.side}`).toBeGreaterThan(20);
      expect(p.intrusion).toBe(0);
      expect(p.count).toBeLessThanOrEqual(result.unmasked.find((v) => v.side === p.side).count);
    }
  for (const result of results.slice(1)) {
    const near = result.visible.find((p) => p.near),
      far = result.visible.find((p) => !p.near);
    expect(near.length).toBeGreaterThan(
      results[0].visible.find((p) => p.side === near.side).length,
    );
    expect(far.length).toBeLessThan(near.length * 0.55);
    expect(far.count).toBeLessThan(near.count);
  }
  for (const [degrees, name] of [
    [0, 'frontal'],
    [-30, 'left-yaw'],
    [30, 'right-yaw'],
  ])
    await page
      .locator(`canvas[data-pose="${degrees}"]`)
      .screenshot({ path: `artifacts/modern-clear-head-target-${name}.png` });
});
