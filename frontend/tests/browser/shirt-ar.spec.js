import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function poseFixture({ scale = 1, x = 0, roll = 0, yaw = 0 } = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
    presence: 1,
  }));
  const worldLandmarks = structuredClone(landmarks);
  for (const [id, px, py] of [
    [12, 0.34, 0.29],
    [11, 0.66, 0.29],
    [24, 0.38, 0.75],
    [23, 0.62, 0.75],
    [14, 0.26, 0.49],
    [13, 0.74, 0.49],
    [16, 0.21, 0.7],
    [15, 0.79, 0.7],
  ]) {
    const dx = px - 0.5,
      dy = py - 0.5;
    landmarks[id] = {
      ...landmarks[id],
      x: 0.5 + scale * (dx * Math.cos(roll) - dy * Math.sin(roll)) + x,
      y: 0.5 + scale * (dx * Math.sin(roll) + dy * Math.cos(roll)),
      z: dx * Math.tan((yaw * Math.PI) / 180),
    };
    worldLandmarks[id] = {
      ...worldLandmarks[id],
      x: px,
      y: py,
      z: dx * Math.tan((yaw * Math.PI) / 180),
    };
  }
  return { landmarks, worldLandmarks };
}

async function installPoseFixture(page, debug = false, assetAvailable = false) {
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  // Absence is deterministic even if the owner adds the real PNG later.
  if (!assetAvailable)
    await page.route('**/assets/body-ar/shirts/tshirt-black-front.png*', (r) =>
      r.fulfill({ status: 404, body: '' }),
    );
  await page.addInitScript((pose) => {
    window.shirtFixture = pose;
    window.shirtTest = {
      workers: 0,
      closed: 0,
      inFlight: 0,
      maxInFlight: 0,
      calls: [],
      cameras: 0,
      tracks: [],
    };
    const RealWorker = window.Worker;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('poseLandmarker.worker')) return new RealWorker(url, options);
        window.shirtTest.workers++;
      }
      postMessage(message) {
        const m = window.shirtTest;
        m.inFlight++;
        m.maxInFlight = Math.max(m.maxInFlight, m.inFlight);
        m.calls.push({ live: message.live, roi: message.roi });
        setTimeout(() => {
          message.bitmap.close();
          m.inFlight--;
          if (!this.closed)
            this.onmessage?.({
              data: {
                ...structuredClone(window.shirtFixture),
                timestamp: message.timestamp,
                inferenceMs: 120,
              },
            });
        }, 120);
      }
      terminate() {
        if (!this.closed) {
          this.closed = true;
          window.shirtTest.closed++;
        }
      }
    };
    navigator.mediaDevices.enumerateDevices = async () => [];
    navigator.mediaDevices.getUserMedia = async () => {
      window.shirtTest.cameras++;
      const c = Object.assign(document.createElement('canvas'), { width: 640, height: 640 });
      const ctx = c.getContext('2d');
      const draw = () => {
        ctx.fillStyle = '#c3ceca';
        ctx.fillRect(0, 0, 640, 640);
      };
      draw();
      const timer = setInterval(draw, 33),
        stream = c.captureStream(30),
        track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        clearInterval(timer);
        stop();
      };
      track.getSettings = () => ({ facingMode: 'user' });
      window.shirtTest.tracks.push(track);
      return stream;
    };
  }, poseFixture());
  await page.goto(`/try-on?productId=tshirt-preview${debug ? '&arDebug=1' : ''}`);
}

test('shirt normal camera mode tracks one torso with one worker/stream, no face detector or substitute asset', async ({
  page,
}) => {
  let faces = 0,
    fakeAssets = 0;
  page.on('request', (r) => {
    if (r.url().includes('face_landmarker.task')) faces++;
    if (/overlay-clothing\.svg/.test(r.url())) fakeAssets++;
  });
  await installPoseFixture(page);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByText('Torso fitted', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Real T-shirt image unavailable');
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Shirt AR diagnostics')).toHaveCount(0);
  await expect(page.getByText(/Shoulders \d|Confidence \d|FRONTAL|TURNING_LEFT/)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.shirtTest.calls.length)).toBeGreaterThan(3);
  const stats = await page.evaluate(() => ({
    ...window.shirtTest,
    tracks: undefined,
    debug: window.__tryOnShirtDebug,
  }));
  expect(stats.workers).toBe(1);
  expect(stats.cameras).toBe(1);
  expect(stats.maxInFlight).toBe(1);
  expect(stats.debug).toBeUndefined();
  expect(faces).toBe(0);
  expect(fakeAssets).toBe(0);
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.shirtTest.closed)).toBe(1);
  expect(
    await page.evaluate(() => window.shirtTest.tracks.every((t) => t.readyState === 'ended')),
  ).toBe(true);
});

test('shirt frontal/turn/scale/tilt fixtures stay attached; diagnostic screenshots honestly show missing real asset', async ({
  page,
}) => {
  await installPoseFixture(page, true);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const read = () => page.evaluate(() => window.__tryOnShirtDebug);
  await expect.poll(async () => (await read())?.geometry?.shoulderWidth).toBeCloseTo(204.8, 1);
  for (const [name, options] of [
    ['frontal', {}],
    ['left-turn', { yaw: -25 }],
    ['right-turn', { yaw: 25 }],
    ['shoulder-tilt', { roll: 0.15 }],
  ]) {
    await page.evaluate((p) => {
      window.shirtFixture = p;
    }, poseFixture(options));
    // Selfie mirroring reverses visible yaw and shoulder roll.
    await expect
      .poll(async () => (await read())?.geometry?.yaw)
      .toBeCloseTo(-(options.yaw || 0), 1);
    await expect
      .poll(async () => (await read())?.geometry?.roll)
      .toBeCloseTo(-(options.roll || 0), 2);
    const d = await read(),
      g = d.geometry;
    expect(d.assetCode).toBe('REAL_SHIRT_ASSET_REQUIRED');
    expect(d.rendered).toBe(false);
    expect(
      Math.hypot(g.collar.x - g.shoulderMidpoint.x, g.collar.y - g.shoulderMidpoint.y),
    ).toBeLessThan(g.torsoHeight * 0.05);
    expect(g.quad[0].x).toBeLessThan(g.left.shoulder.x);
    expect(g.quad[1].x).toBeGreaterThan(g.right.shoulder.x);
    await expect(page.getByLabel('Shirt AR diagnostics')).toBeVisible();
    await page.screenshot({ path: `artifacts/shirt-ar-tracking-${name}.png` });
  }
  for (const scale of [0.7, 1.1, 0.7]) {
    await page.evaluate((p) => {
      window.shirtFixture = p;
    }, poseFixture({ scale }));
    await expect
      .poll(async () => (await read())?.geometry?.shoulderWidth)
      .toBeCloseTo(204.8 * scale, 1);
    await expect
      .poll(async () => (await read())?.geometry?.torsoHeight)
      .toBeCloseTo(294.4 * scale, 1);
  }
  const weak = poseFixture({ scale: 0.7 });
  weak.landmarks[23].visibility = 0.1;
  await page.evaluate((p) => {
    window.shirtFixture = p;
  }, weak);
  await expect(
    page.getByText('Stand back to include your waist for a closer fit.', { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await read())?.geometry?.trackingMode).toBe('SHOULDERS_ONLY');
  weak.landmarks[11].visibility = 0.1;
  await page.evaluate((p) => {
    window.shirtFixture = p;
  }, weak);
  await expect(page.getByText('Keep both shoulders in view.', { exact: true })).toBeVisible();
  await expect.poll(async () => (await read())?.visibility).toBe(0);
  await page.evaluate((p) => {
    window.shirtFixture = p;
  }, poseFixture());
  await expect(page.getByText('Torso fitted', { exact: true })).toBeVisible();
  await page.getByLabel('Selected product').selectOption('1');
  await expect.poll(() => page.evaluate(() => window.shirtTest.closed)).toBe(1);
  expect(await page.evaluate(() => window.__tryOnShirtDebug)).toBeUndefined();
});

test('shirt photo uses IMAGE once with no camera and retry handles missing shoulders/hips', async ({
  page,
}) => {
  await installPoseFixture(page, true);
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles({
    name: 'person.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('../../public/assets/portrait.jpg', import.meta.url)),
  });
  await expect(page.getByText('Torso fitted', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.shirtTest.calls.every((c) => c.live === false))).toBe(
    true,
  );
  expect(await page.evaluate(() => window.shirtTest.cameras)).toBe(0);
  const weak = poseFixture();
  weak.landmarks[11].presence = 0.1;
  await page.evaluate((p) => {
    window.shirtFixture = p;
  }, weak);
  await page.getByRole('button', { name: 'Retry fitting', exact: true }).click();
  await expect(page.getByText('Keep both shoulders in view.', { exact: true })).toBeVisible();
  await page.evaluate((p) => {
    window.shirtFixture = p;
  }, poseFixture());
  await page.getByRole('button', { name: 'Retry fitting', exact: true }).click();
  await expect(page.getByText('Torso fitted', { exact: true })).toBeVisible();
});

test('shirt affine mesh has actual torso pixel coverage for frontal, left/right, near/far and roll', async ({
  page,
}) => {
  await page.goto('/try-on?productId=tshirt-preview');
  const fixtures = [
    {},
    { yaw: -25 },
    { yaw: 25 },
    { scale: 0.7 },
    { scale: 1.1 },
    { roll: 0.18 },
  ].map(poseFixture);
  const results = await page.evaluate(async (poses) => {
    const { measureTorso, torsoQuad } = await import('/src/components/tryon/shirtGeometry.js');
    const { drawShirt } = await import('/src/components/tryon/shirtWarp.js');
    const { shirtCalibration } = await import('/src/data/shirtProducts.js');
    // Numerical raster probe only, held in memory and never shown as a product,
    // loaded by the shirt asset loader, persisted, or used for visual screenshots.
    const probe = Object.assign(document.createElement('canvas'), { width: 160, height: 180 });
    const pc = probe.getContext('2d');
    pc.fillStyle = '#9b3456';
    pc.fillRect(20, 20, 120, 140);
    const fit = shirtCalibration(),
      asset = { image: probe, bounds: { x: 20, y: 20, width: 120, height: 140 } };
    return poses.map((pose) => {
      const geometry = torsoQuad(measureTorso(pose, 800, 800), fit);
      const canvas = Object.assign(document.createElement('canvas'), { width: 800, height: 800 });
      const ctx = canvas.getContext('2d');
      drawShirt(ctx, asset, geometry, fit);
      const data = ctx.getImageData(0, 0, 800, 800).data;
      const coverage = [
        [-0.12, 0.3],
        [0, 0.5],
        [0.12, 0.75],
        [0, 0.8],
      ].map(([offset, t]) => {
        // Body-derived coverage targets, independent of the source-image warp.
        const across = { x: Math.cos(geometry.roll), y: Math.sin(geometry.roll) };
        const p = {
          x:
            geometry.shoulderMidpoint.x +
            (geometry.hipMidpoint.x - geometry.shoulderMidpoint.x) * t +
            across.x * geometry.shoulderWidth * offset,
          y:
            geometry.shoulderMidpoint.y +
            (geometry.hipMidpoint.y - geometry.shoulderMidpoint.y) * t +
            across.y * geometry.shoulderWidth * offset,
        };
        let covered = 0;
        for (let y = Math.round(p.y) - 3; y <= Math.round(p.y) + 3; y++)
          for (let x = Math.round(p.x) - 3; x <= Math.round(p.x) + 3; x++)
            if (data[(y * 800 + x) * 4 + 3] > 128) covered++;
        return covered;
      });
      let pixels = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) pixels++;
      return { coverage, pixels };
    });
  }, fixtures);
  for (const r of results) {
    expect(r.pixels).toBeGreaterThan(10000);
    expect(r.coverage.every((p) => p >= 40)).toBe(true);
  }
  expect(results[4].pixels / results[3].pixels).toBeGreaterThan(2);
});

test('working shirt PNG follows torso pixels and captures/downloads the exact composite without diagnostics', async ({
  page,
}) => {
  const path = new URL(
    '../../public/assets/body-ar/shirts/tshirt-black-front.png',
    import.meta.url,
  );
  const available = await readFile(path).then(
    () => true,
    () => false,
  );
  test.skip(!available, 'REAL_SHIRT_ASSET_REQUIRED: asset-dependent visual acceptance is pending');
  await installPoseFixture(page, true, true);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeEnabled();
  const read = () => page.evaluate(() => window.__tryOnShirtDebug);
  for (const [name, options] of [
    ['frontal', {}],
    ['left-turn', { yaw: -25 }],
    ['right-turn', { yaw: 25 }],
    ['shoulder-tilt', { roll: 0.15 }],
  ]) {
    await page.evaluate((p) => {
      window.shirtFixture = p;
    }, poseFixture(options));
    await expect
      .poll(async () => (await read())?.geometry?.yaw)
      .toBeCloseTo(-(options.yaw || 0), 2);
    await expect
      .poll(async () => (await read())?.geometry?.roll)
      .toBeCloseTo(-(options.roll || 0), 3);
    const coverage = await page.evaluate(async () => {
      const { shirtBodyPoint } = await import('/src/components/tryon/shirtWarp.js');
      const {shirtCalibration}=await import('/src/data/shirtProducts.js');
      const {shirtPreviewProduct}=await import('/tests/fixtures/shirtProduct.js');
      const canvas = document.querySelector('canvas[aria-label="T-shirt try-on canvas"]');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const g = window.__tryOnShirtDebug.geometry,
        fit = shirtCalibration(shirtPreviewProduct);
      return [
        [0.4, 0.45],
        [0.5, 0.6],
        [0.6, 0.8],
      ].map(([u, v]) => {
        const p = shirtBodyPoint(u, v, g, fit);
        let covered = 0;
        for (let y = Math.round(p.y) - 3; y <= Math.round(p.y) + 3; y++)
          for (let x = Math.round(p.x) - 3; x <= Math.round(p.x) + 3; x++) {
            const i = (y * canvas.width + x) * 4;
            if (data[i] < 150 && data[i + 1] < 150 && data[i + 2] < 150) covered++;
          }
        return covered;
      });
    });
    expect(coverage.every((pixels) => pixels >= 40)).toBe(true);
    expect((await read()).rendered).toBe(true);
    await page.screenshot({ path: `artifacts/shirt-ar-${name}.png` });
  }
  for (const scale of [0.7, 1.1, 0.7]) {
    await page.evaluate((p) => {
      window.shirtFixture = p;
    }, poseFixture({ scale }));
    await expect
      .poll(async () => (await read())?.geometry?.shoulderWidth)
      .toBeCloseTo(204.8 * scale, 1);
  }
  await page.evaluate(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (input, ...args) {
      if (input?.getAttribute?.('aria-label') === 'T-shirt try-on canvas')
        window.shirtCapturedCanvas = input.toDataURL();
      return draw.call(this, input, ...args);
    };
  });
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByText('Captured', { exact: true })).toBeVisible();
  const captured = await page.evaluate(() => window.shirtCapturedCanvas);
  expect(await page.getByLabel('T-shirt try-on canvas').evaluate((c) => c.toDataURL())).toBe(
    captured,
  );
  await expect(page.getByLabel('Shirt AR diagnostics')).not.toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('tryonbd-tshirt-result.png');
  expect((await readFile(await download.path())).toString('base64')).toBe(captured.split(',')[1]);
  expect(
    await page.evaluate(() => window.shirtTest.tracks.every((t) => t.readyState === 'ended')),
  ).toBe(true);
});

test('working shirt PNG loads measured alpha bounds in clean photo mode and exports the visible result', async ({
  page,
}) => {
  const assetPath = new URL(
    '../../public/assets/body-ar/shirts/tshirt-black-front.png',
    import.meta.url,
  );
  test.skip(
    !(await readFile(assetPath).then(
      () => true,
      () => false,
    )),
    'REAL_SHIRT_ASSET_REQUIRED',
  );
  await installPoseFixture(page, false, true);
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles({
    name: 'person.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('../../public/assets/portrait.jpg', import.meta.url)),
  });
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Shirt AR diagnostics')).toHaveCount(0);
  expect(await page.evaluate(() => window.__tryOnShirtDebug)).toBeUndefined();
  const measured = await page.evaluate(async () => {
    const { loadShirtAsset } = await import('/src/components/tryon/shirtAssets.js');
    const asset = await loadShirtAsset('/assets/body-ar/shirts/tshirt-black-front.png');
    return {
      ...asset.bounds,
      sourceWidth: asset.image.naturalWidth,
      sourceHeight: asset.image.naturalHeight,
    };
  });
  expect(measured.x).toBeGreaterThan(0);
  expect(measured.y).toBeGreaterThan(0);
  expect(measured.width).toBeLessThan(measured.sourceWidth);
  expect(measured.height).toBeLessThan(measured.sourceHeight);
  expect(await page.evaluate(() => window.shirtTest.calls.every((c) => c.live === false))).toBe(
    true,
  );
  expect(await page.evaluate(() => window.shirtTest.cameras)).toBe(0);
  const png = await page.getByLabel('T-shirt try-on canvas').evaluate((c) => c.toDataURL());
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  expect((await readFile(await (await event).path())).toString('base64')).toBe(png.split(',')[1]);
});

test('shirt retries a missing working PNG without reopening the camera or pose worker', async ({
  page,
}) => {
  const png = await readFile(
    new URL('../../public/assets/body-ar/shirts/tshirt-black-front.png', import.meta.url),
  ).catch(() => null);
  test.skip(!png, 'REAL_SHIRT_ASSET_REQUIRED');
  await installPoseFixture(page, false, true);
  let added = false;
  await page.route('**/assets/body-ar/shirts/tshirt-black-front.png*', (r) =>
    added
      ? r.fulfill({ contentType: 'image/png', body: png })
      : r.fulfill({ status: 404, body: '' }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Real T-shirt image unavailable');
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeDisabled();
  added = true;
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.shirtTest.cameras)).toBe(1);
  expect(await page.evaluate(() => window.shirtTest.workers)).toBe(1);
});

test('shirt camera denial keeps upload available and pose worker failure has a clean retry state', async ({
  page,
}) => {
  await installPoseFixture(page);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError');
    };
  });
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/permission|denied/i);
  expect(await page.evaluate(() => window.shirtTest.workers)).toBe(0);
  await page.evaluate(() => {
    window.Worker = class {
      postMessage(m) {
        m.bitmap.close();
        setTimeout(() => this.onmessage?.({ data: { error: 'fixture model unavailable' } }), 0);
      }
      terminate() {}
    };
  });
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles({
    name: 'person.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('../../public/assets/portrait.jpg', import.meta.url)),
  });
  await expect(
    page.getByText('Body tracking is unavailable. Retry fitting or use another photo.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry fitting', exact: true })).toBeEnabled();
});

test('real Pose worker exposes complete body and world landmarks in IMAGE mode', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/try-on?productId=tshirt-preview');
  const result = await page.evaluate(async () => {
    const { acquirePoseLandmarker } = await import('/src/services/poseLandmarker.js');
    const image = new Image();
    image.src = '/assets/portrait.jpg';
    await image.decode();
    const worker = acquirePoseLandmarker();
    try {
      const result = await worker.detect(image, false);
      return {
        body: result?.landmarks?.length,
        world: result?.worldLandmarks?.length,
        error: worker.metrics.error,
      };
    } finally {
      worker.release();
    }
  });
  expect(result.error).toBe('');
  expect(result.body).toBe(33);
  expect(result.world).toBe(33);
});
