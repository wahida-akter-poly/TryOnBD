import { test, expect } from '@playwright/test';
import { installFrameFixtures } from './frame-fixtures.js';
import { readFile } from 'node:fs/promises';

test('real Pose worker detects portrait ears in IMAGE and VIDEO without blocking the render loop', async ({
  page,
}) => {
  test.setTimeout(120000);
  await installFrameFixtures(page);
  await page.goto('/try-on?productId=2');
  const result = await page.evaluate(async () => {
    const { acquirePoseLandmarker } = await import('/src/services/poseLandmarker.js');
    const img = new Image();
    img.src = '/assets/portrait.jpg';
    await img.decode();
    const detector = acquirePoseLandmarker();
    let ticks = 0;
    const timer = setInterval(() => ticks++, 16);
    const photo = await detector.detect(img, false, 1);
    const frames = [];
    for (let i = 0; i < 8; i++) {
      const start = performance.now();
      const frame = await detector.detect(img, true, 100 + i * 100);
      frames.push({ ms: performance.now() - start, ears: frame?.landmarks?.slice(7, 9) });
    }
    clearInterval(timer);
    const metrics = { ...detector.metrics };
    const { acquireFaceLandmarker } = await import('/src/services/faceLandmarker.js');
    const face = acquireFaceLandmarker();
    await face.detect(img, true); // Exclude model startup from the comparison.
    const benchmark = async (dual) => {
      const start = performance.now();
      let renders = 0,
        faces = 0,
        poses = 0,
        lastFace = -Infinity,
        lastPose = -Infinity,
        faceBusy = false,
        poseBusy = false;
      let faceJob, poseJob;
      await new Promise((resolve) => {
        const tick = (now) => {
          renders++;
          if (!faceBusy && now - lastFace >= 1000 / 30) {
            lastFace = now;
            faceBusy = true;
            faceJob = face.detect(img, true).then(() => {
              faces++;
              faceBusy = false;
            });
          }
          if (dual && !poseBusy && now - lastPose >= 1000 / 15) {
            lastPose = now;
            poseBusy = true;
            poseJob = detector.detect(img, true, now).then(() => {
              poses++;
              poseBusy = false;
            });
          }
          if (now - start >= 1800) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const elapsed = performance.now() - start;
      await Promise.all([faceJob, poseJob]);
      return {
        renderHz: (renders * 1000) / elapsed,
        faceHz: (faces * 1000) / elapsed,
        poseHz: (poses * 1000) / elapsed,
      };
    };
    const baseline = await benchmark(false),
      dual = await benchmark(true);
    face.release();
    detector.release();
    return { photoEars: photo?.landmarks?.slice(7, 9), frames, ticks, metrics, baseline, dual };
  });
  console.log('Real Pose worker measurements:', JSON.stringify(result));
  expect(result.metrics.error).toBe('');
  expect(result.metrics.calls).toBe(9);
  expect(result.photoEars).toHaveLength(2);
  expect(result.frames.every((f) => f.ears?.length === 2)).toBe(true);
  expect(result.ticks).toBeGreaterThan(5);
  expect(result.dual.poseHz).toBeGreaterThan(2);
  expect(result.dual.renderHz).toBeGreaterThan(10);
  expect(result.dual.renderHz / result.baseline.renderHz).toBeGreaterThan(0.5);
});

test('stable real PNG temples retain visible hinge projection despite actual Pose ears in frontal and yaw fixtures', async ({
  page,
}) => {
  test.setTimeout(120000);
  await installFrameFixtures(page);
  await page.goto('/try-on?productId=2');
  await page.route('**/__ear-fixture.jpg', async (route) =>
    route.fulfill({
      contentType: 'image/jpeg',
      body: await readFile(new URL('../fixtures/ear-front.jpg', import.meta.url)),
    }),
  );
  const results = await page.evaluate(async () => {
    const { acquireFaceLandmarker } = await import('/src/services/faceLandmarker.js');
    const { acquirePoseLandmarker } = await import('/src/services/poseLandmarker.js');
    const { updateEarTracking, fuseEarAnchors } =
      await import('/src/components/tryon/earTracking.js');
    const { faceAnchors, accessoryTransform, defaultControls, glassesTemples, drawAccessory } =
      await import('/src/components/tryon/faceGeometry.js');
    const { resolveHeadPose } = await import('/src/components/tryon/headPose.js');
    const { loadGlassesAssembly } = await import('/src/components/tryon/accessoryAssets.js');
    const { accessoryStyles } = await import('/src/data/faceAccessories.js');
    const img = new Image();
    img.src = '/__ear-fixture.jpg';
    await img.decode();
    const source = document.createElement('canvas');
    source.width = 800;
    source.height = Math.round((800 * img.height) / img.width);
    source.getContext('2d').drawImage(img, 0, 0, source.width, source.height);
    const faceDetector = acquireFaceLandmarker(),
      poseDetector = acquirePoseLandmarker();
    const detection = await faceDetector.detect(source, false);
    const initial = faceAnchors(detection.landmarks, source.width, source.height, 'sunglasses')[0];
    const pose = await poseDetector.detect(source, false, 1, {
      x: initial.x / source.width,
      y: initial.y / source.height,
      width: initial.width / source.width,
    });
    faceDetector.release();
    poseDetector.release();
    if (!detection || !pose?.landmarks)
      throw new Error('Actual face/pose fixture detection unavailable');
    const fit = accessoryStyles.find((s) => s.id === 'clear'),
      controls = defaultControls();
    const asset = await loadGlassesAssembly(
      fit.frontFrameSrc,
      fit.leftTempleSrc,
      fit.rightTempleSrc,
    );
    const blank = document.createElement('canvas');
    blank.width = asset.image.width;
    blank.height = asset.image.height;
    return [0, -30, 30].map((degrees) => {
      // Actual ears remain deliberately irrelevant to the visible model. Only
      // the existing matrix yaw input changes in these deterministic fixtures.
      const r = (degrees * Math.PI) / 180,
        c = Math.cos(r),
        s = Math.sin(r);
      const head = resolveHeadPose(
        null,
        { rows: 4, columns: 4, data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1] },
        0,
        false,
        0,
      );
      const anchor = faceAnchors(
        detection.landmarks,
        source.width,
        source.height,
        'sunglasses',
        head,
      )[0];
      const transform = accessoryTransform(
        anchor,
        controls,
        source.width,
        source.height,
        asset.bounds.width / asset.bounds.height,
        fit,
      );
      const tracks = updateEarTracking(
        null,
        pose.landmarks,
        anchor,
        source.width,
        source.height,
        false,
        0,
      );
      const stableBefore = glassesTemples(anchor, transform, fit, asset);
      anchor.earAnchors = fuseEarAnchors(
        null,
        tracks,
        anchor,
        glassesTemples(anchor, transform, fit),
        transform,
        0,
        1000,
      );
      const paths = glassesTemples(anchor, transform, fit, asset);
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      drawAccessory(
        ctx,
        { ...asset, image: blank },
        [anchor],
        controls,
        canvas.width,
        canvas.height,
        fit,
      );
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const coverage = paths.map((p) => {
        const buckets = Array(4).fill(0);
        let inside = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            if (pixels[(y * canvas.width + x) * 4 + 3] < 10) continue;
            const dx = x + 0.5 - transform.x,
              dy = y + 0.5 - transform.y,
              lx = dx * Math.cos(transform.angle) + dy * Math.sin(transform.angle),
              ly = -dx * Math.sin(transform.angle) + dy * Math.cos(transform.angle);
            if (p.side * (lx - p.hingeX) < 0) {
              if (Math.abs(lx) < Math.abs(p.hingeX) - 1) inside++;
              continue;
            }
            const vx = lx - p.hingeX,
              vy = ly - p.hingeY;
            const t = (vx * p.vector.x + vy * p.vector.y) / (p.length * p.length),
              distance = Math.abs(vx * p.vector.y - vy * p.vector.x) / p.length;
            if (t >= 0 && t < 1.1 && distance < transform.width * 0.1)
              buckets[Math.min(3, Math.floor(t * 4))]++;
          }
        return {
          side: p.side,
          source: anchor.earAnchors.find((ear) => ear.side === p.side).source,
          confidence: anchor.earAnchors.find((ear) => ear.side === p.side).confidence,
          target: p.target,
          expected: stableBefore.find((path) => path.side === p.side).target,
          lengthRatio: p.length / transform.width,
          renderer: p.renderer,
          buckets,
          near: p.near,
        };
      });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0);
      drawAccessory(ctx, asset, [anchor], controls, canvas.width, canvas.height, fit);
      canvas.dataset.earPose = String(degrees);
      const panel = document.createElement('div');
      panel.dataset.earPreview = String(degrees);
      panel.style.cssText =
        'position:fixed;left:0;top:0;width:800px;height:800px;overflow:hidden;z-index:9999;background:white';
      panel.style.visibility = 'hidden';
      const zoom = 800 / (anchor.width * 2);
      canvas.style.width = `${canvas.width * zoom}px`;
      canvas.style.height = `${canvas.height * zoom}px`;
      canvas.style.marginLeft = `${-(anchor.x - anchor.width) * zoom}px`;
      canvas.style.marginTop = `${-Math.max(0, anchor.y - anchor.width * 0.85) * zoom}px`;
      panel.append(canvas);
      document.body.append(panel);
      return { degrees, coverage, earPoints: pose.landmarks.slice(7, 9) };
    });
  });
  console.log('Stable PNG projection pixel coverage:', JSON.stringify(results));
  for (const result of results)
    for (const p of result.coverage) {
      expect(p.confidence).toBeGreaterThan(0.65);
      expect(p.renderer).toBe('STABLE_PNG');
      expect(Math.hypot(p.target.x - p.expected.x, p.target.y - p.expected.y)).toBeLessThan(1);
      expect(p.lengthRatio).toBeGreaterThanOrEqual(0.15);
      if (result.degrees === 0) expect(p.lengthRatio).toBeCloseTo(0.15, 6);
      // Texture must cover a meaningful arm length, through its outer quarter.
      expect(p.buckets.every((count) => count > 2)).toBe(true);
    }
  for (const [degrees, name] of [
    [0, 'frontal'],
    [-30, 'left'],
    [30, 'right'],
  ]) {
    const panel = page.locator(`[data-ear-preview="${degrees}"]`);
    await panel.evaluate((el) => {
      el.style.visibility = 'visible';
    });
    await panel.screenshot({ path: `artifacts/modern-clear-restored-temples-${name}.png` });
    await panel.evaluate((el) => {
      el.style.visibility = 'hidden';
    });
  }
});
