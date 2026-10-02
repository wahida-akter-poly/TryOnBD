import { test, expect } from '@playwright/test';

import { installFrameFixtures } from './frame-fixtures.js';
import { readFile } from 'node:fs/promises';

// Mock only the MediaPipe dependency, leaving the real model service, camera hook,
// renderer, smoothing, capture, DTO and lifecycle code under test.
async function simulatedStudio(
  page,
  {
    failCPU = false,
    delayedCamera = false,
    delayedModel = false,
    debug = true,
    frameFixtures = true,
  } = {},
) {
  if (frameFixtures) await installFrameFixtures(page);
  await page.addInitScript(
    ({ failCPU, delayedCamera, delayedModel }) => {
      window.testVision = { attempts: [], calls: [], closed: 0, failCPU, delayedModel };
      window.pose = { x: 0, y: 0, scale: 1, angle: 0 };
      window.testTracks = [];
      window.cameraRequests = 0;
      navigator.mediaDevices.enumerateDevices = async () => [];
      navigator.mediaDevices.getUserMedia = async () => {
        window.cameraRequests++;
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 360;
        const ctx = c.getContext('2d');
        const draw = () => {
          ctx.fillStyle = '#8899aa';
          ctx.fillRect(0, 0, c.width, c.height);
        };
        draw();
        const timer = setInterval(draw, 33),
          stream = c.captureStream(30);
        const track = stream.getVideoTracks()[0],
          stop = track.stop.bind(track);
        track.stop = () => {
          clearInterval(timer);
          stop();
        };
        track.getSettings = () => ({ facingMode: 'user' });
        window.testTracks.push(track);
        if (delayedCamera)
          await new Promise((resolve) => {
            window.allowCamera = resolve;
          });
        return stream;
      };
    },
    { failCPU, delayedCamera, delayedModel },
  );
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**/src/services/faceLandmarker.js*', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const stub = `
      const FilesetResolver = { forVisionTasks: async () => ({}) };
      const FaceLandmarker = { createFromOptions: async (_, options) => {
        const stats = window.testVision;
        stats.matrixOutputEnabled = options.outputFacialTransformationMatrixes;
        stats.attempts.push(options.baseOptions.delegate);
        if (options.baseOptions.delegate === 'GPU' || stats.failCPU) throw new Error('Simulated delegate failure');
        if (stats.delayedModel) await new Promise((resolve) => { window.allowModel = resolve; });
        const detect = () => {
          if (!window.pose) return { faceLandmarks: [] };
          const { x, y, scale, angle, yaw = 0, rawYaw = yaw * .25, bridgeShift = 0, eyeShift = 0 } = window.pose;
          const degrees = window.pose.matrixDegrees;
          const rad = degrees * Math.PI / 180;
          const matrix = { rows: 4, columns: 4, data: [Math.cos(rad),0,-Math.sin(rad),0, 0,1,0,0, Math.sin(rad),0,Math.cos(rad),0, 0,0,-50,1] };
          const p = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
          p[33] = { x: .36, y: .4 }; p[133] = { x: .42, y: .4 };
          p[263] = { x: .64, y: .4 }; p[362] = { x: .58, y: .4 };
          p[234] = { x: .25, y: .5 }; p[454] = { x: .75, y: .5 };
          p[127] = { x: .25, y: .4 }; p[93] = { x: .27, y: .56 };
          p[356] = { x: .75, y: .4 }; p[323] = { x: .73, y: .56 };
          // Raw displacement is expressed as a fraction of the .5 face span.
          // Fixtures never invert the production normalizer to force a pose.
          p[1].x += rawYaw * .5;
          p[6] = { x: .5 + bridgeShift, y: .395 };
          p[168] = { x: .5 + bridgeShift, y: .38 };
          for (const id of [33, 133, 263, 362]) p[id].x += eyeShift;
          return { facialTransformationMatrixes: degrees === undefined ? [] : [window.pose.invalidMatrix ? { ...matrix, data: [NaN] } : matrix], faceLandmarks: [p.map((v) => ({
            x: .5 + x + scale * ((v.x - .5) * Math.cos(angle) - (v.y - .5) * Math.sin(angle)),
            y: .5 + y + scale * ((v.x - .5) * Math.sin(angle) + (v.y - .5) * Math.cos(angle))
          }))] };
        };
        return { setOptions: async () => {}, detect,
          detectForVideo: (video, timestamp) => { stats.calls.push({ time: video.currentTime, timestamp }); return detect(); },
          close: () => { stats.closed++; }
        };
      } };
    `;
    const replaced = body.replace(
      /import\s*\{[^}]*FaceLandmarker[^}]*\}\s*from\s*["'][^"']+["'];?/,
      stub,
    );
    expect(replaced).not.toBe(body);
    await route.fulfill({ response, body: replaced, contentType: 'application/javascript' });
  });
  await page.goto(`/try-on?productId=2${debug ? '&arDebug=1' : ''}`);
}
const hash = (page) =>
  page.locator('.tryon-canvas').evaluate((c) => {
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i++) sum = (Math.imul(sum, 31) + pixels[i]) | 0;
    return sum;
  });

test('normal camera mode excludes all diagnostics and Pose work; explicit debug has a compact panel', async ({
  page,
}) => {
  let poseRequests = 0;
  page.on('request', (r) => {
    if (/poseLandmarker.worker|pose_landmarker_lite/.test(r.url())) poseRequests++;
  });
  await simulatedStudio(page, { debug: false, frameFixtures: false });
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible();
  await expect(
    page.locator('.eyewear-debug, .eyewear-debug-panel, [data-pose-marker], [data-temple-vector]'),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      /YAW SOURCE|MATRIX YAW|EAR_TRACKED|EAR_LOST|confidence|Matrix yaw:|Abs yaw:|turnT:|Angles:|State: frontal/,
    ),
  ).toHaveCount(0);
  expect(poseRequests).toBe(0);
  expect(
    await page.evaluate(() => window.__tryOnBridgeDebug || window.__tryOnScaleDebug),
  ).toBeUndefined();
  await page.goto('/try-on?productId=2&arDebug=0');
  await expect(page.locator('.eyewear-debug, .eyewear-debug-panel')).toHaveCount(0);
  await page.goto('/try-on?productId=2&arDebug=1');
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(page.getByLabel('AR diagnostics')).toBeVisible();
  await expect(page.getByLabel('AR diagnostics')).toContainText('Matrix yaw:');
  await expect(
    page.locator('.eyewear-debug text, .eyewear-debug polygon, .eyewear-debug path'),
  ).toHaveCount(0);
  await expect(page.locator('.eyewear-debug-panel [data-pose-line]')).toHaveCount(7);
  await page.getByRole('button', { name: 'Capture AR Result', exact: true }).click();
  await expect(page.getByLabel('AR diagnostics')).not.toBeVisible();
  await expect(page.locator('.eyewear-debug')).not.toBeVisible();
});

test('optional Pose diagnostics mirror, hold and fall back without changing stable temples or capture', async ({
  page,
}) => {
  let earMode = 'tracked';
  await page.route('**/__ear-mode', (route) => route.fulfill({ json: { mode: earMode } }));
  await page.route('**/poseLandmarker.worker.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    let calls=0;
    self.onmessage=async({data})=>{
      const {mode}=await (await fetch('/__ear-mode')).json();
      const p=Array(33).fill(null);const confidence=mode==='tracked'?.99:.2;calls++;
      p[7]={x:.82,y:.5,visibility:confidence};p[8]={x:.18,y:.5,visibility:confidence};
      data.bitmap.close();
      setTimeout(()=>self.postMessage({id:data.id,timestamp:data.timestamp,landmarks:mode==='lost'?null:p,inferenceMs:12}),5);
    };
  `,
    }),
  );
  await simulatedStudio(page, { frameFixtures: false });
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  const read = () => page.evaluate(() => window.__tryOnBridgeDebug);
  await expect
    .poll(async () => (await read())?.temples.map((p) => p.ear?.source))
    .toEqual(['POSE', 'POSE']);
  const tracked = await read();
  expect(tracked.temples.find((p) => p.side < 0).ear.landmarkId).toBe(7);
  expect(tracked.temples.find((p) => p.side > 0).ear.landmarkId).toBe(8);
  await expect(page.getByLabel('AR diagnostics')).toContainText('Matrix yaw:');
  await expect(page.locator('.eyewear-debug text')).toHaveCount(0);
  earMode = 'weak';
  await expect
    .poll(async () => (await read())?.temples.every((p) => p.ear?.source === 'HELD'), {
      intervals: [30],
    })
    .toBe(true);
  earMode = 'lost';
  await expect
    .poll(async () => (await read())?.temples.every((p) => p.ear?.source === 'FALLBACK'))
    .toBe(true);
  const fallback = await read();
  expect(fallback.renderedBridge).toEqual(tracked.renderedBridge);
  expect(fallback.frontScale).toBe(tracked.frontScale);
  expect(fallback.temples.map((p) => [p.length, p.target, p.opacity])).toEqual(
    tracked.temples.map((p) => [p.length, p.target, p.opacity]),
  );
  // No overlapping or 60 Hz Pose calls: the coordinated scheduler is bounded.
  expect(fallback.posePerformance.calls).toBeLessThan(50);
  await page.getByRole('button', { name: 'Capture AR Result', exact: true }).click();
  expect(await page.evaluate(() => window.testTracks.every((t) => t.readyState === 'ended'))).toBe(
    true,
  );
  await expect(page.locator('.eyewear-debug')).not.toBeVisible();
});

test('real Modern Clear assembly stays outside lenses, changes in yaw, scales, and captures once', async ({
  page,
}) => {
  const base = '/assets/face-ar/sunglasses/modern-clear-';
  const cartoons = [];
  page.on('request', (r) => {
    if (/face-ar\/clear\.(png|svg)/.test(r.url())) cartoons.push(r.url());
  });
  await page.addInitScript(() => {
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.matches?.('.tryon-canvas')) window.assemblyDraws = [];
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image instanceof HTMLCanvasElement && image.matches('.tryon-canvas')) {
        // Record the exact displayed frame copied by Capture, atomically. Live
        // smoothing can advance between separate Playwright hash/click calls.
        const pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
        let sum = 0;
        for (const pixel of pixels) sum = (Math.imul(sum, 31) + pixel) | 0;
        window.capturedCanvasHash = sum;
      }
      if (image instanceof HTMLImageElement && this.canvas.matches?.('.tryon-canvas')) {
        window.assemblyDraws.push({
          src: new URL(image.src).pathname,
          width: Math.hypot(this.getTransform().a * args[6], this.getTransform().b * args[6]),
          alpha: this.globalAlpha,
        });
      }
      return draw.call(this, image, ...args);
    };
  });
  await simulatedStudio(page, { debug: false, frameFixtures: false });
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).locator('img'),
  ).toHaveAttribute('src', `${base}front-clean.png`);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible();
  const draws = () =>
    page.evaluate(() => {
      const all = window.assemblyDraws || [];
      // Eight triangles form one temple pass; verify one front image and exactly
      // two contiguous arm passes, without confusing subdivisions with overlays.
      if (all.length && all.filter((d) => d.src.endsWith('front-clean.png')).length !== 1)
        throw new Error('Duplicate front overlay');
      return all.filter((d, i) => i === 0 || d.src !== all[i - 1].src);
    });
  await expect
    .poll(async () => (await draws())?.map((d) => d.src))
    .toEqual([
      `${base}left-temple-normalized.png`,
      `${base}front-clean.png`,
      `${base}right-temple-normalized.png`,
    ]);
  await expect(page.locator('.tryon-canvas')).toHaveCount(1);
  const alpha = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(image, 0, 0);
    // Includes locations previously occupied by the photographed back arms.
    return [
      [120, 140],
      [220, 210],
      [700, 140],
      [780, 200],
    ].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
  }, `${base}front-clean.png`);
  expect(alpha).toEqual([0, 0, 0, 0]);
  await page.evaluate(() => {
    window.pose.rawYaw = 0.744;
    window.pose.matrixDegrees = 30;
  });
  await expect
    .poll(async () => (await draws())?.map((d) => d.src))
    .toEqual([
      `${base}left-temple-normalized.png`,
      `${base}front-clean.png`,
      `${base}right-temple-normalized.png`,
    ]);
  await expect
    .poll(async () => {
      const d = await draws();
      return d[2].alpha - d[0].alpha;
    })
    .toBeGreaterThan(0.3);
  const turn = await draws();
  expect(turn[2].width).toBeGreaterThan(turn[0].width);
  await page.evaluate(() => {
    window.pose.rawYaw = -0.744;
    window.pose.matrixDegrees = -30;
  });
  await expect
    .poll(async () => (await draws())?.map((d) => d.src))
    .toEqual([
      `${base}right-temple-normalized.png`,
      `${base}front-clean.png`,
      `${base}left-temple-normalized.png`,
    ]);
  await expect
    .poll(async () => {
      const d = await draws();
      return d[2].alpha - d[0].alpha;
    })
    .toBeGreaterThan(0.3);
  await expect
    .poll(async () => {
      const d = await draws();
      return Math.abs(d[2].alpha - 0.94);
    })
    .toBeLessThan(0.00001);
  const far = (await draws())[1].width;
  await page.evaluate(() => {
    window.pose.scale = 1.5;
  });
  await expect.poll(async () => (await draws())[1].width).toBeGreaterThan(far * 1.48);
  await page.evaluate(() => {
    window.pose.scale = 1;
  });
  await expect.poll(async () => Math.abs((await draws())[1].width - far)).toBeLessThan(0.01);
  // Perspective has its own slower smoothing channel; allow it to settle too.
  await expect
    .poll(async () => {
      const d = await draws();
      return Math.abs(d[2].alpha - 0.94);
    })
    .toBeLessThan(0.00001);
  await page.screenshot({ path: 'artifacts/modern-clear-live.png', fullPage: true });
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByText('Captured', { exact: true })).toBeVisible();
  const live = await page.evaluate(() => window.capturedCanvasHash);
  expect(live).toBeDefined();
  expect(await hash(page)).toBe(live);
  expect(await draws()).toEqual([]); // The capture is a composite, no second glasses pass.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  await (await download).saveAs('artifacts/modern-clear-capture.png');
  const exported = (await readFile('artifacts/modern-clear-capture.png')).toString('base64');
  const exportedHash = await page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (const pixel of pixels) sum = (Math.imul(sum, 31) + pixel) | 0;
    return sum;
  }, exported);
  expect(exportedHash).toBe(live);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tryonbd:demo:v1')).data.cart.some((p) => p.productId === 2),
    ),
  ).toBe(true);
  expect(cartoons).toEqual([]);
});

test('matrix head turns override distorted 2D yaw while both real dandi remain visible at 15-30 degrees', async ({
  page,
}) => {
  await simulatedStudio(page, { debug: true, frameFixtures: false });
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  const read = () => page.evaluate(() => window.__tryOnBridgeDebug);
  for (const degrees of [0, 2, -2, 10, 20, 30, 60, 30, 15, 0, -10, -20, -30, -60, 0]) {
    await page.evaluate((matrixDegrees) => {
      window.pose = {
        x: 0,
        y: 0,
        scale: 1,
        angle: 0,
        matrixDegrees,
        rawYaw: Math.sign(matrixDegrees) * 0.744,
      };
    }, degrees);
    const expected = -(Math.sign(degrees) * Math.max(0, Math.abs(degrees) - 3)) / 72;
    // Both frontal fallback and frontal matrix normalize to zero. Wait for
    // fresh detection metadata as well as the filtered orientation.
    await expect.poll(async () => (await read())?.yawSource).toBe('MATRIX');
    await expect.poll(async () => (await read())?.matrixYawDegrees).toBeCloseTo(degrees, 5);
    await expect.poll(async () => Math.abs((await read())?.yaw - expected)).toBeLessThan(0.001);
    await expect.poll(async () => (await read())?.bridgeErrorPx).toBeLessThan(0.8);
    const d = await read();
    expect(d.yawSource).toBe('MATRIX');
    expect(d.matrixYawDegrees).toBeCloseTo(degrees, 5);
    expect(d.frontScale).toBeGreaterThanOrEqual(0.97);
    expect(d.leftWidth).toBeCloseTo(d.rightWidth, 5);
    if (Math.abs(degrees) <= 30) {
      expect(Math.abs(d.yaw)).toBeLessThan(0.5);
      for (const arm of d.temples) {
        expect(arm.opacity).toBeGreaterThan(0.24);
        expect(arm.length).toBeGreaterThan(20);
      }
    }
    if (Math.abs(degrees) > 3) expect(d.temples[1].side).toBe(Math.sign(degrees));
    else {
      await expect
        .poll(async () =>
          Math.max(...(await read()).temples.map((p) => Math.abs(p.projectedLengthRatio - 0.15))),
        )
        .toBeLessThan(0.001);
      expect((await read()).temples.every((p) => p.state === 'frontal')).toBe(true);
      await expect(page.getByLabel('AR diagnostics')).toContainText('State: frontal');
    }
  }
  expect(await page.evaluate(() => window.testVision.matrixOutputEnabled)).toBe(true);
  await expect(page.getByLabel('AR diagnostics')).toContainText('(MATRIX)');
  await expect(page.getByLabel('AR diagnostics')).toContainText('Left ');
  // Invalid output uses the fallback, retaining a finite stable orientation.
  await page.evaluate(() => {
    window.pose.invalidMatrix = true;
    window.pose.rawYaw = -0.25;
  });
  await expect.poll(async () => (await read())?.yawSource).toBe('FALLBACK');
  expect(Number.isFinite((await read()).yaw)).toBe(true);
});

test('real temple cutouts survive hinge clipping on both sides without entering the lens region', async ({
  page,
}) => {
  await page.goto('/try-on?productId=2');
  const measurements = await page.evaluate(async () => {
    const { loadGlassesAssembly } = await import('/src/components/tryon/accessoryAssets.js');
    const {
      drawAccessory,
      defaultControls,
      accessoryTransform,
      frontFrameGeometry,
      glassesTemples,
    } = await import('/src/components/tryon/faceGeometry.js');
    const { normalizeYawDegrees } = await import('/src/components/tryon/headPose.js');
    const { templeQuad } = await import('/src/components/tryon/templeGeometry.js');
    const { accessoryStyles } = await import('/src/data/faceAccessories.js');
    const fit = accessoryStyles.find((s) => s.id === 'clear');
    const asset = await loadGlassesAssembly(
      fit.frontFrameSrc,
      fit.leftTempleSrc,
      fit.rightTempleSrc,
    );
    const blank = document.createElement('canvas');
    blank.width = asset.image.naturalWidth;
    blank.height = asset.image.naturalHeight;
    const templesOnly = { ...asset, image: blank };
    return [0, 15, -15, 30, -30, 60, -60].map((degrees) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      const anchor = {
        x: 500,
        y: 250,
        width: 400,
        angle: 0.2,
        bridgeLocked: true,
        yaw: normalizeYawDegrees(degrees),
        templeSides: [
          { x: -0.5, y: 0.1 },
          { x: 0.5, y: 0.1 },
        ],
      };
      const controls = defaultControls();
      drawAccessory(ctx, templesOnly, [anchor], controls, 1000, 600, fit);
      const transform = accessoryTransform(
        anchor,
        controls,
        1000,
        600,
        asset.bounds.width / asset.bounds.height,
        fit,
      );
      const front = frontFrameGeometry(anchor, transform, fit);
      const pixels = ctx.getImageData(0, 0, 1000, 600).data;
      let left = 0,
        right = 0,
        inside = 0;
      for (let y = 0; y < 600; y++)
        for (let x = 0; x < 1000; x++) {
          if (pixels[(y * 1000 + x) * 4 + 3] < 10) continue;
          const localX =
            (x + 0.5 - transform.x) * Math.cos(transform.angle) +
            (y + 0.5 - transform.y) * Math.sin(transform.angle);
          if (localX < front.leftHinge.x + 1) left++;
          else if (localX > front.rightHinge.x - 1) right++;
          else inside++;
        }
      // Verify the FINAL three-part assembly too. Front pixels alone only
      // extend ~2.5% beyond the hinge; require substantial arm projection.
      ctx.clearRect(0, 0, 1000, 600);
      drawAccessory(ctx, asset, [anchor], controls, 1000, 600, fit);
      const full = ctx.getImageData(0, 0, 1000, 600).data;
      let leftExtent = 0,
        rightExtent = 0,
        fullLeft = 0,
        fullRight = 0;
      for (let y = 0; y < 600; y++)
        for (let x = 0; x < 1000; x++) {
          if (full[(y * 1000 + x) * 4 + 3] < 25) continue;
          const lx =
            (x + 0.5 - transform.x) * Math.cos(transform.angle) +
            (y + 0.5 - transform.y) * Math.sin(transform.angle);
          if (lx < front.leftHinge.x - transform.width * 0.05) {
            fullLeft++;
            leftExtent = Math.max(leftExtent, front.leftHinge.x - lx);
          }
          if (lx > front.rightHinge.x + transform.width * 0.05) {
            fullRight++;
            rightExtent = Math.max(rightExtent, lx - front.rightHinge.x);
          }
        }
      const expectedCoverage = glassesTemples(anchor, transform, fit).map((p) => {
        const part = p.side < 0 ? asset.leftTemple : asset.rightTemple;
        return {
          side: p.side,
          pixels:
            ((part.inspection.visiblePixels / (part.bounds.width * part.bounds.height)) *
              p.length *
              templeQuad(p, part, transform).height *
              (1 + p.targetTaper)) /
            2,
          projection: Math.abs(p.vector.x) / transform.width,
        };
      });
      return {
        degrees,
        left,
        right,
        inside,
        fullLeft,
        fullRight,
        leftExtent: leftExtent / transform.width,
        rightExtent: rightExtent / transform.width,
        expectedLeftPixels: expectedCoverage.find((p) => p.side < 0).pixels,
        expectedRightPixels: expectedCoverage.find((p) => p.side > 0).pixels,
        leftProjection: expectedCoverage.find((p) => p.side < 0).projection,
        rightProjection: expectedCoverage.find((p) => p.side > 0).projection,
      };
    });
  });
  for (const m of measurements) {
    expect(m.inside, `lens intrusion at ${m.degrees} degrees`).toBe(0);
    expect(m.left, `left arm surviving clip at ${m.degrees} degrees`).toBeGreaterThan(40);
    expect(m.right, `right arm surviving clip at ${m.degrees} degrees`).toBeGreaterThan(40);
    if (Math.abs(m.degrees) <= 30) {
      // Coverage is based on the tapered quad's area, not uniform scaling.
      // The final assembly must also retain pixels beyond the hinge overlap.
      expect(m.left).toBeGreaterThan(m.expectedLeftPixels * 0.5);
      expect(m.right).toBeGreaterThan(m.expectedRightPixels * 0.5);
      expect(m.fullLeft).toBeGreaterThan(40);
      expect(m.fullRight).toBeGreaterThan(40);
      expect(m.leftExtent).toBeGreaterThan(m.leftProjection * 0.7);
      expect(m.rightExtent).toBeGreaterThan(m.rightProjection * 0.7);
    }
  }
});

test('physical nose displacement produces gradual yaw and bounded rigid glasses in both directions', async ({
  page,
}) => {
  await simulatedStudio(page, { debug: true, frameFixtures: false });
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  const read = () => page.evaluate(() => window.__tryOnBridgeDebug);
  for (const sign of [-1, 1]) {
    let previousYaw = -1;
    let previousFarOpacity = Infinity;
    for (const raw of [0, 0.07, 0.25, 0.45]) {
      await page.evaluate((rawYaw) => {
        window.pose = { x: 0, y: 0, scale: 1, angle: 0, rawYaw };
      }, sign * raw);
      // Explicit physical fixture expectations, independent of the production normalizer.
      const expected = raw === 0 ? 0 : raw === 0.07 ? 0.013947 : raw === 0.25 ? 0.153282 : 0.294829;
      await expect
        .poll(async () => Math.abs(Math.abs((await read())?.yaw) - expected))
        .toBeLessThan(0.002);
      // Alpha has its own slower filter. Compare progressive visibility only
      // once its target has settled, including after crossing between sides.
      const t = Math.max(0, Math.min(1, ((Math.atan(raw) * 180) / Math.PI - 3) / 21));
      const expectedFarOpacity = 0.9 - 0.3 * t * t * (3 - 2 * t);
      await expect
        .poll(async () => Math.abs((await read())?.temples[0].opacity - expectedFarOpacity))
        .toBeLessThan(0.0001);
      const d = await read();
      expect(d.rawYaw).toBeCloseTo(-sign * raw, 5);
      expect(d.yawSource).toBe('FALLBACK');
      expect(Math.abs(d.yaw)).toBeGreaterThan(previousYaw);
      expect(d.bridgeErrorPx).toBeLessThan(0.8);
      expect(d.eyeMidpoint).toBeDefined();
      expect(d.leftWidth).toBeCloseTo(d.rightWidth, 5);
      expect(d.frontScale).toBeGreaterThanOrEqual(0.97);
      const frameWidth = (d.leftWidth + d.rightWidth) / d.frontScale;
      expect(d.temples[0].length).toBeLessThanOrEqual(frameWidth * 0.4 + 0.001);
      expect(d.temples[1].length).toBeLessThanOrEqual(frameWidth * 0.58 + 0.001);
      expect(d.temples[0].opacity).toBeLessThan(previousFarOpacity);
      if (raw === 0.25) {
        expect(Math.abs(d.yaw)).toBeLessThan(0.5);
        expect(d.frontScale).toBeGreaterThan(0.99);
      }
      previousYaw = Math.abs(d.yaw);
      previousFarOpacity = d.temples[0].opacity;
    }
  }
});

test('nose bridge stays locked in mirrored yaw, roll and distance for Clear and Aviator; debug is excluded from capture', async ({
  page,
}) => {
  await simulatedStudio(page, { debug: true, frameFixtures: false });
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(page.getByText('Face Tracking: Active', { exact: true })).toBeVisible();
  const read = () => page.evaluate(() => window.__tryOnBridgeDebug);
  for (const style of ['Modern Clear Frame', 'Classic Aviator']) {
    await page.getByRole('button', { name: style, exact: true }).click();
    for (const yaw of [0, -0.6, 0.6]) {
      await page.evaluate((yaw) => {
        window.pose = {
          x: 0.03,
          y: 0.01,
          scale: 1,
          angle: 0,
          yaw,
          bridgeShift: yaw * 0.05,
          eyeShift: -yaw * 0.08,
        };
      }, yaw);
      // The selfie image is mirrored once: the screen-space bridge moves left
      // when the physical nose-root projection moves right.
      const expectedX = (0.5 - 0.03 - yaw * 0.05) * 640;
      const expectedY = (0.395 * 0.85 + 0.38 * 0.15 + 0.01) * 360;
      await expect
        .poll(async () => Math.abs((await read())?.renderedBridge.x - expectedX))
        .toBeLessThan(0.8);
      await expect
        .poll(async () => Math.abs((await read())?.renderedBridge.y - expectedY))
        .toBeLessThan(0.8);
      await expect.poll(async () => (await read())?.bridgeErrorPx).toBeLessThan(0.8);
      await expect(page.locator('.eyewear-debug')).toBeVisible();
      if (yaw) {
        await expect
          .poll(async () => {
            const d = await read();
            return Math.sign(d.yaw);
          })
          .toBe(-Math.sign(yaw));
        const d = await read();
        expect(d.leftWidth).toBeCloseTo(d.rightWidth, 5);
        expect(Math.abs(d.yaw)).toBeLessThan(0.5);
      }
    }
    await page.evaluate(() => {
      window.pose = {
        x: 0.07,
        y: 0.02,
        scale: 1.3,
        angle: 0.22,
        yaw: 0,
        bridgeShift: 0,
        eyeShift: 0,
      };
    });
    await expect.poll(async () => (await read())?.bridgeErrorPx).toBeLessThan(0.8);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const d = window.__tryOnScaleDebug;
          return Math.abs(d.targetGlassesWidth - d.smoothedGlassesWidth);
        }),
      )
      .toBeLessThan(0.01);
  }
  await expect.poll(async () => Math.abs((await read())?.yaw)).toBeLessThan(0.0000001);
  await expect.poll(async () => (await read())?.bridgeErrorPx).toBeLessThan(0.00001);
  const visible = await hash(page);
  await page.screenshot({ path: 'artifacts/nose-bridge-debug.png', fullPage: true });
  await page.getByRole('button', { name: 'Capture AR Result' }).click();
  await expect(page.getByText('SNAPSHOT', { exact: true })).toBeVisible();
  expect(await hash(page)).toBe(visible);
  await expect(page.locator('.eyewear-debug')).toBeHidden();
  expect(await page.evaluate(() => window.__tryOnBridgeDebug)).toBeUndefined();
  await page.goto('/try-on?productId=2');
  await expect(page.locator('.eyewear-debug')).toHaveCount(0);
});

test('missing Modern Clear temple reports unavailable and never renders a partial pair', async ({
  page,
}) => {
  await simulatedStudio(page, { debug: false, frameFixtures: false });
  await page.route(
    '**/assets/face-ar/sunglasses/modern-clear-left-temple-normalized.png',
    (route) => route.abort(),
  );
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(
    page.getByText('Realistic try-on asset unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toHaveCount(0);
});

test('clean studio uses the real Aviator everywhere, fits live, captures and downloads without technical controls', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const src = '/assets/face-ar/sunglasses/aviator-real.png';
  const response = await request.get(src);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
  expect(Array.from((await response.body()).subarray(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  const requestedImages = [];
  page.on('request', (r) => {
    if (r.url().includes('/assets/')) requestedImages.push(r.url());
  });
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image instanceof HTMLImageElement && this.canvas.matches?.('.tryon-canvas')) {
        window.drawnFrame = { src: new URL(image.src).pathname, width: args[6], height: args[7] };
      }
      return draw.call(this, image, ...args);
    };
  });
  await simulatedStudio(page, { debug: false, frameFixtures: false });
  await page.goto('/products/2');
  await expect(page.locator('.detail-image img')).toHaveAttribute('src', src);
  await page.getByRole('link', { name: /Try on virtually/ }).click();
  await expect(page).toHaveURL(/\/try-on\?productId=2$/);
  await expect(page.getByRole('heading', { name: 'Find your frame.' })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('.face-style-grid button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Classic Aviator', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Classic Aviator', exact: true }).locator('img'),
  ).toHaveAttribute('src', src);
  for (const label of ['Auto Align', 'X offset', 'Y offset', 'Rotation', 'Opacity', 'Size'])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.drawnFrame?.src)).toBe(src);
  const far = await page.evaluate(() => window.drawnFrame.width);
  await page.evaluate(() => {
    window.pose.scale = 1.5;
  });
  await expect.poll(() => page.evaluate(() => window.drawnFrame.width)).toBeGreaterThan(far * 1.45);
  expect(await page.evaluate(() => window.__tryOnScaleDebug)).toBeUndefined();
  await page.getByRole('button', { name: 'Adjust fit', exact: true }).click();
  await expect(page.getByLabel('Size', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Auto Align', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByText('Captured', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testTracks.every((t) => t.readyState === 'ended'))).toBe(
    true,
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('tryonbd-sunglasses-result.png');
  await page.getByRole('button', { name: 'Save Try-On', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try-On saved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tryonbd:demo:v1')).data.cart.some(
        (item) => item.productId === 2,
      ),
    ),
  ).toBe(true);
  expect(
    requestedImages.some((url) =>
      /overlay-glasses\.svg|face-ar\/(aviator|square|round|clear)\.(png|svg)/.test(url),
    ),
  ).toBe(false);
  await page.screenshot({ path: 'artifacts/clean-eyewear-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/clean-eyewear-mobile.png', fullPage: true });
});

test('clean photo input fits automatically and missing real assets never load cartoons', async ({
  page,
}) => {
  await simulatedStudio(page, { debug: false, frameFixtures: false });
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('public/assets/portrait.jpg');
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  const cartoons = [];
  page.on('request', (r) => {
    if (/overlay-glasses\.svg/.test(r.url())) cartoons.push(r.url());
  });
  await page.route('**/assets/face-ar/sunglasses/aviator-real.png', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(
    page.getByText('Realistic try-on asset unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toHaveCount(0);
  expect(cartoons).toEqual([]);
});

test('clean frame switching changes only the configured asset without restarting camera or model', async ({
  page,
}) => {
  // Alternative configs reuse a real photograph as test fixtures, not public catalog entries.
  await simulatedStudio(page, { debug: false });
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible();
  const before = await hash(page);
  const attempts = await page.evaluate(() => window.testVision.attempts.length);
  await page.getByRole('button', { name: 'Round Metal', exact: true }).click();
  await expect.poll(() => hash(page)).not.toBe(before);
  expect(await page.evaluate(() => window.cameraRequests)).toBe(1);
  expect(await page.evaluate(() => window.testVision.attempts.length)).toBe(attempts);
  expect(await page.evaluate(() => window.testVision.closed)).toBe(0);
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeEnabled();
});

test('distance alone doubles and then restores the actual drawn sunglasses width', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image instanceof HTMLImageElement && this.canvas.matches?.('.tryon-canvas')) {
        window.glassesDraw = {
          width: args.length === 8 ? args[6] : args[2],
          height: args.length === 8 ? args[7] : args[3],
        };
      }
      return original.call(this, image, ...args);
    };
  });
  await simulatedStudio(page, { debug: true });
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(page.getByText('Face Tracking: Active', { exact: true })).toBeVisible();
  const settleAt = async (scale) => {
    await page.evaluate((scale) => {
      window.pose = { x: 0, y: 0, scale, angle: 0 };
    }, scale);
    await expect
      .poll(() => page.evaluate(() => window.__tryOnScaleDebug?.faceWidthPx))
      .toBeCloseTo(320 * scale, 1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const d = window.__tryOnScaleDebug;
          return Math.abs(d.smoothedGlassesWidth - d.targetGlassesWidth) / d.targetGlassesWidth;
        }),
      )
      .toBeLessThan(0.01);
    return page.evaluate(() => ({
      ...window.__tryOnScaleDebug,
      drawWidth: window.glassesDraw.width,
    }));
  };
  const far = await settleAt(0.65),
    near = await settleAt(1.3);
  expect(near.drawWidth).toBeGreaterThan(far.drawWidth * 1.95);
  expect(near.drawWidth - far.drawWidth).toBeGreaterThan(170);
  expect(near.displayedGlassesWidth).toBeGreaterThan(far.displayedGlassesWidth * 1.95);
  await page.getByLabel('Scale', { exact: true }).fill('1.25');
  await expect
    .poll(() => page.evaluate(() => window.glassesDraw.width))
    .toBeCloseTo(near.targetGlassesWidth * 1.25, 0);
  await page.getByLabel('Scale', { exact: true }).fill('1');
  const returned = await settleAt(0.65);
  expect(returned.drawWidth).toBeLessThan(near.drawWidth * 0.52);
  console.info('Distance-only rendered widths (canvas px):', {
    far: far.drawWidth,
    near: near.drawWidth,
    returned: returned.drawWidth,
  });
  await test.info().attach('distance-widths.json', {
    body: JSON.stringify({ far, near, returned }, null, 2),
    contentType: 'application/json',
  });
});

test('transparent product PNG uses visible bounds and configured fit, with an honest missing-photo error', async ({
  page,
}) => {
  await simulatedStudio(page, { debug: true });
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 500;
    c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#182020';
    ctx.fillRect(100, 90, 300, 90);
    return c.toDataURL().split(',')[1];
  });
  await page.route('**/assets/face-ar/sunglasses/fixture.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }),
  );
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('tryonbd:demo:v1'));
    saved.data.products.find((p) => p.id === 2).tryOnAsset = {
      src: '/assets/face-ar/sunglasses/fixture.png',
      widthMultiplier: 0.95,
      verticalOffset: 0.02,
      rotationOffset: 0,
      opacity: 100,
    };
    localStorage.setItem('tryonbd:demo:v1', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__tryOnScaleDebug?.assetBounds))
    .toEqual({ x: 100, y: 90, width: 300, height: 90 });
  const loaded = await page.evaluate(() => window.__tryOnScaleDebug);
  expect(loaded.fallbackAsset).toBe(false);
  expect(loaded.productFitMultiplier).toBe(0.95);
  await expect(page.getByRole('button', { name: 'Capture AR Result' })).toBeEnabled();
  await page.route('**/assets/face-ar/sunglasses/fixture.png', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(
    page.getByText('Realistic try-on asset unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Capture AR Result' })).toBeDisabled();
});

test('GPU fallback, live product switch, lost/reacquired face, exact composite, PNG, save and cart', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await simulatedStudio(page);
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(page.getByText('Face Tracking: Active', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testVision.attempts)).toEqual(['GPU', 'CPU']);
  await page.getByRole('tab', { name: 'Before', exact: true }).click();
  const raw = await hash(page);
  await page.getByRole('tab', { name: 'After', exact: true }).click();
  await expect.poll(() => hash(page)).not.toBe(raw);
  await page.getByLabel('Selected product').selectOption('9');
  await expect(page.getByRole('button', { name: 'Black Square', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => window.cameraRequests)).toBe(1);
  expect(await page.evaluate(() => window.testVision.attempts.length)).toBe(2);
  await page.evaluate(() => {
    window.pose = null;
  });
  await expect(page.getByText('Face Tracking: Lost', { exact: true })).toBeVisible();
  await expect.poll(() => hash(page)).toBe(raw);
  await expect(page.getByRole('button', { name: 'Capture AR Result' })).toBeDisabled();
  await page.evaluate(() => {
    window.pose = { x: 0.15, y: 0.02, scale: 1.2, angle: 0.1 };
  });
  await expect(page.getByText('Face Tracking: Active', { exact: true })).toBeVisible();
  await expect.poll(() => hash(page)).not.toBe(raw);
  await page.getByLabel('Selected product').selectOption('2');
  await expect(page.getByRole('button', { name: 'Capture AR Result' })).toBeEnabled();
  const visible = await hash(page);
  await page.getByRole('button', { name: 'Capture AR Result' }).click();
  await expect(page.getByText('SNAPSHOT', { exact: true })).toBeVisible();
  expect(await hash(page)).toBe(visible);
  expect(await page.evaluate(() => window.testTracks.every((t) => t.readyState === 'ended'))).toBe(
    true,
  );
  await expect.poll(() => page.evaluate(() => window.testVision.closed)).toBe(1);
  await page.getByRole('tab', { name: 'Before', exact: true }).click();
  expect(await hash(page)).toBe(raw);
  await page.getByRole('tab', { name: 'After', exact: true }).click();
  expect(await hash(page)).toBe(visible);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download snapshot' }).click();
  expect((await download).suggestedFilename()).toBe('tryonbd-sunglasses-result.png');
  await page.getByRole('button', { name: 'Save Try-On', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try-On saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Add product to cart' }).click();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tryonbd:demo:v1')).data.cart.some((p) => p.productId === 2),
    ),
  ).toBe(true);
  const calls = await page.evaluate(() => window.testVision.calls);
  expect(calls.length).toBeGreaterThan(2);
  expect(new Set(calls.map((c) => c.time)).size).toBe(calls.length);
  expect(calls.every((c, i) => !i || c.timestamp > calls[i - 1].timestamp)).toBe(true);
  expect(errors).toEqual([]);
});

test('mode changes stop camera and model; clothing and jewelry need no model', async ({ page }) => {
  await simulatedStudio(page);
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(page.getByText('Face Tracking: Active', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Clothing', exact: true }).click();
  await expect(page.getByText('MANUAL DEMO OVERLAY', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testTracks.every((t) => t.readyState === 'ended'))).toBe(
    true,
  );
  await expect.poll(() => page.evaluate(() => window.testVision.closed)).toBe(1);
  const calls = await page.evaluate(() => window.testVision.calls.length);
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture snapshot' })).toBeEnabled();
  expect(await page.evaluate(() => window.testVision.calls.length)).toBe(calls);
  await page.getByRole('button', { name: 'Capture snapshot' }).click();
  await expect(page.getByText('SNAPSHOT', { exact: true })).toBeVisible();
  const captured = await hash(page);
  await page.getByLabel('X offset', { exact: true }).fill('10');
  await expect.poll(() => hash(page)).not.toBe(captured);
  await page.getByRole('tab', { name: 'Jewelry', exact: true }).click();
  await expect(page.getByText('Manual overlay preview', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testTracks.every((t) => t.readyState === 'ended'))).toBe(
    true,
  );
});

test('both delegates failing preserves camera and manual upload fallback', async ({ page }) => {
  await simulatedStudio(page, { failCPU: true });
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('AR unavailable');
  await page.getByLabel('Auto Align', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Capture AR Result' })).toBeEnabled();
  await page.getByRole('tab', { name: 'Upload Photo', exact: true }).click();
  await expect(page.getByLabel('Upload photo', { exact: true })).toBeAttached();
  expect(await page.evaluate(() => window.testTracks.every((t) => t.readyState === 'ended'))).toBe(
    true,
  );
});

test('stop during permission prompt releases the late stream and prevents duplicate requests', async ({
  page,
}) => {
  await simulatedStudio(page, { delayedCamera: true });
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start AR Camera', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => Boolean(window.allowCamera))).toBe(true);
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await page.evaluate(() => window.allowCamera());
  await expect
    .poll(() => page.evaluate(() => window.testTracks.every((t) => t.readyState === 'ended')))
    .toBe(true);
  expect(await page.evaluate(() => window.cameraRequests)).toBe(1);
  await expect(page.getByText('Camera Off', { exact: true })).toBeVisible();
});

test('unmount during model loading closes the late model without starting detection', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await simulatedStudio(page, { delayedModel: true });
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.allowModel))).toBe(true);
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  // React keeps the studio mounted while the destination route loads.
  await expect(page.locator('.tryon-canvas')).toHaveCount(0);
  await page.evaluate(() => window.allowModel());
  await expect.poll(() => page.evaluate(() => window.testVision.closed)).toBe(1);
  expect(await page.evaluate(() => window.testVision.calls.length)).toBe(0);
  expect(await page.evaluate(() => window.testTracks.every((t) => t.readyState === 'ended'))).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
