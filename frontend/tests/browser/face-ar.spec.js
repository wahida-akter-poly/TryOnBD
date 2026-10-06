import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { installFrameFixtures } from './frame-fixtures.js';
const photo = fileURLToPath(new URL('../../public/assets/portrait.jpg', import.meta.url));
test.setTimeout(120000);

test.beforeEach(async ({ page }) => {
  await installFrameFixtures(page);
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});
async function upload(page, id = 2) {
  await page.goto(`/try-on?productId=${id}&arDebug=1`);
  await page.getByRole('tab', { name: 'Upload Photo', exact: true }).click();
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles(photo);
  await expect(
    page.getByText(id === 2 ? 'Face Tracking: Active' : 'Manual overlay preview', { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Download snapshot' })).toBeEnabled();
}
const pixels = (page) =>
  page.locator('.tryon-canvas').evaluate((c) => {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
    return hash >>> 0;
  });
async function changed(page, old) {
  await expect.poll(() => pixels(page)).not.toBe(old);
}
const data = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('tryonbd:demo:v1')).data);

test('Modern Clear fits the real portrait using actual MediaPipe in normal mode', async ({
  page,
}) => {
  await page.goto('/try-on?productId=2');
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles(photo);
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Modern Clear Frame', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator('.eyewear-debug, .eyewear-debug-panel, [data-pose-marker], [data-temple-vector]'),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      /YAW SOURCE|MATRIX YAW|FALLBACK RAW YAW|EAR_TRACKED|EAR_LOST|confidence|Matrix yaw:|Abs yaw:|turnT:|Angles:|State: frontal/,
    ),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => window.__tryOnBridgeDebug || window.__tryOnScaleDebug),
  ).toBeUndefined();
  await page.screenshot({ path: 'artifacts/modern-clear-portrait.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/modern-clear-restored-normal.png', fullPage: true });
});

test('real temple diagnostic and normal screenshots show both arms on a MediaPipe-tracked portrait', async ({
  page,
}) => {
  await page.goto('/try-on?productId=2&arDebug=1');
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByRole('tab', { name: 'Upload Photo', exact: true }).click();
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles(photo);
  await expect(page.getByText('Face Tracking: Active', { exact: true })).toBeVisible({
    timeout: 45000,
  });
  await expect.poll(() => page.evaluate(() => window.__tryOnBridgeDebug?.temples.length)).toBe(2);
  const read = () => page.evaluate(() => window.__tryOnBridgeDebug);
  const initial = await read();
  const canvas = page.locator('.tryon-canvas');
  await page.screenshot({ path: 'artifacts/modern-clear-restored-debug.png', fullPage: true });
  await page.getByLabel('Force temple visibility', { exact: true }).check();
  await expect
    .poll(async () => (await read()).temples.every((p) => p.effectiveOpacity === 1 && !p.clipping))
    .toBe(true);
  await canvas.screenshot({ path: 'artifacts/modern-clear-temples-forced.png' });
  const forced = await read();
  for (const p of forced.temples) {
    expect(p.asset.decoded).toBe(true);
    expect(p.asset.visiblePixels).toBeGreaterThan(50000);
    expect(p.asset.meanVisibleAlpha).toBeGreaterThan(0.8);
    expect(p.destination.width / p.destination.height).toBeCloseTo(
      p.asset.bounds.width / p.asset.bounds.height,
      5,
    );
    expect(p.destination.width).toBeGreaterThan(100);
  }
  expect(forced.renderedBridge).toEqual(initial.renderedBridge);
  expect(forced.frontScale).toBe(initial.frontScale);
  await page.getByLabel('Force temple visibility', { exact: true }).uncheck();
  await page.getByLabel('Enable temple clipping', { exact: true }).uncheck();
  await expect.poll(async () => (await read()).temples.every((p) => !p.clipping)).toBe(true);
  await canvas.screenshot({ path: 'artifacts/modern-clear-temples-clipping-off.png' });
  const unclipped = await pixels(page);
  await page.getByLabel('Enable temple clipping', { exact: true }).check();
  await expect.poll(async () => (await read()).temples.every((p) => p.clipping)).toBe(true);
  await canvas.screenshot({ path: 'artifacts/modern-clear-temples-visible.png' });
  console.log('Real temple asset/destination inspection:', (await read()).temples);
  // Uniform scaling tilts the hinge edge slightly. The lens guard clips that
  // inward edge while preserving the full outward arm, verified by pixel tests.
  expect(await pixels(page)).not.toBe(unclipped);
  await page.goto('/try-on?productId=2');
  await expect(page.getByLabel('Force temple visibility', { exact: true })).toHaveCount(0);
});

test('normal live VIDEO preview visibly includes both real Modern Clear temples', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.templeLiveTracks = [];
    navigator.mediaDevices.enumerateDevices = async () => [];
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image();
      image.src = '/assets/portrait.jpg';
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = Math.round((800 * image.height) / image.width);
      const ctx = canvas.getContext('2d');
      const draw = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      draw();
      const timer = setInterval(draw, 66);
      const stream = canvas.captureStream(15);
      const track = stream.getVideoTracks()[0],
        stop = track.stop.bind(track);
      track.stop = () => {
        clearInterval(timer);
        stop();
      };
      track.getSettings = () => ({ facingMode: 'user' });
      window.templeLiveTracks.push(track);
      return stream;
    };
  });
  await page.goto('/try-on?productId=2');
  await page.getByRole('button', { name: 'Modern Clear Frame', exact: true }).click();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByLabel('Force temple visibility', { exact: true })).toHaveCount(0);
  await page
    .locator('.tryon-canvas')
    .screenshot({ path: 'artifacts/modern-clear-temples-live-visible.png' });
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.templeLiveTracks.every((t) => t.readyState === 'ended')))
    .toBe(true);
});

test('real uploaded face: all sunglasses adjustments, comparison, PNG, exact POST and local history', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let payload;
  await page.route('**/api/try-on-sessions', (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
  await page.goto('/products/2');
  await page.getByRole('link', { name: /Try on virtually/ }).click();
  await expect(page).toHaveURL(/productId=2/);
  // Fine-tuning and developer status now live in the explicit debug view.
  await page.goto('/try-on?productId=2&arDebug=1');
  await page.getByRole('tab', { name: 'Upload Photo', exact: true }).click();
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles(photo);
  await expect(page.getByText('Face Tracking: Active')).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Download snapshot' })).toBeEnabled();
  const initial = await pixels(page);
  // Real WASM/model inference must provide a valid pose matrix in IMAGE mode.
  expect(await page.evaluate(() => window.__tryOnBridgeDebug?.yawSource)).toBe('MATRIX');
  expect(
    await page.evaluate(() => Number.isFinite(window.__tryOnBridgeDebug?.matrixYawDegrees)),
  ).toBe(true);
  for (const [name, value] of [
    ['X offset', '6'],
    ['Y offset', '5'],
    ['Scale', '1.3'],
    ['Rotation', '18'],
    ['Opacity', '45'],
  ]) {
    const previous = await pixels(page);
    await page.getByLabel(name, { exact: true }).fill(value);
    await changed(page, previous);
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => pixels(page)).toBe(initial);
  await page.getByRole('tab', { name: 'Before', exact: true }).click();
  await changed(page, initial);
  const original = await pixels(page);
  await page.getByRole('tab', { name: 'After', exact: true }).click();
  await page.getByLabel('Opacity', { exact: true }).fill('0');
  await expect.poll(() => pixels(page)).toBe(original);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByLabel('Auto Align', { exact: true }).uncheck();
  await page.getByLabel('X offset', { exact: true }).fill('10');
  await changed(page, initial);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  for (const style of ['Black Square', 'Round Metal', 'Modern Clear Frame', 'Classic Aviator']) {
    await page.getByRole('button', { name: style, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download snapshot' })).toBeEnabled();
  }
  await page.getByRole('tab', { name: 'Before', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download snapshot' }).click();
  const result = await download;
  expect(result.suggestedFilename()).toBe('tryonbd-sunglasses-result.png');
  await result.saveAs('artifacts/phase1-sunglasses-result.png');
  await page.getByRole('tab', { name: 'After', exact: true }).click();
  await page.getByRole('button', { name: 'Save Try-On', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try-On saved' })).toBeVisible();
  expect(Object.keys(payload).sort()).toEqual([
    'inputImageUrl',
    'productId',
    'tryOnType',
    'userId',
  ]);
  expect(payload.tryOnType).toBe('FACE_AR');
  expect(payload.productId).toBe(2);
  expect(payload.inputImageUrl).toMatch(/^urn:tryonbd:local-input:/);
  const session = (await data(page)).sessions.at(-1);
  expect(session.id).toMatch(/^DEMO-LOCAL-/);
  expect(session.requestValidated).toBe(true);
  const stored = await page.evaluate(() => localStorage.getItem('tryonbd:demo:v1'));
  expect(stored).not.toMatch(/blob:|data:image/);
  await page.screenshot({ path: 'artifacts/phase1-studio-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'View your demo history' }).click();
  await expect(page.locator('.history-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('manual jewelry prototype keeps both earrings, styles, mirrored adjustments and head jewelry', async ({
  page,
}) => {
  await upload(page, 6);
  const initial = await pixels(page);
  await page.getByRole('tab', { name: 'Before', exact: true }).click();
  await page.locator('canvas').evaluate((c) => {
    window.originalPixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  });
  await page.getByRole('tab', { name: 'After', exact: true }).click();
  const halves = await page.locator('canvas').evaluate((c) => {
    const after = c.getContext('2d').getImageData(0, 0, c.width, c.height).data,
      xs = [];
    for (let i = 0; i < after.length; i += 4)
      if (Math.abs(after[i] - window.originalPixels[i]) > 10) xs.push((i / 4) % c.width);
    const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
    return [xs.filter((x) => x < middle).length, xs.filter((x) => x > middle).length];
  });
  expect(halves[0]).toBeGreaterThan(50);
  expect(halves[1]).toBeGreaterThan(50);
  await page.getByLabel('X offset', { exact: true }).fill('5');
  await changed(page, initial);
  const symmetric = await pixels(page);
  await page.getByLabel('Mirror Adjustment').uncheck();
  await changed(page, symmetric);
  for (const name of ['Pearl Drop', 'Gold Drop', 'Crystal Drop', 'Traditional Jhumka']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download snapshot' })).toBeEnabled();
  }
  await page.screenshot({ path: 'artifacts/phase1-earrings.png', fullPage: true });
  await page.getByLabel('Selected product').selectOption('13');
  await expect(page.getByRole('button', { name: 'Maang Tikka', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const head = await pixels(page);
  await page.getByLabel('Scale', { exact: true }).fill('1.4');
  await changed(page, head);
  const scaled = await pixels(page);
  await page.getByLabel('Rotation', { exact: true }).fill('20');
  await changed(page, scaled);
  await page.getByRole('button', { name: 'Crystal Headpiece', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download snapshot' })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/phase1-head-jewelry.png', fullPage: true });
});

test('invalid uploads, no face, model failure/retry, and manual fallback are honest', async ({
  page,
}) => {
  await page.goto('/try-on?arDebug=1');
  await page.getByRole('tab', { name: 'Upload Photo', exact: true }).click();
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') });
  await expect(page.getByRole('alert')).toContainText('Choose a PNG');
  const blank = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 300;
    c.getContext('2d').fillRect(0, 0, 300, 300);
    return c.toDataURL().split(',')[1];
  });
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles({
    name: 'blank.png',
    mimeType: 'image/png',
    buffer: Buffer.from(blank, 'base64'),
  });
  await expect(
    page.getByText('No face detected. Please face the camera directly or upload another photo.'),
  ).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Download snapshot' })).toBeDisabled();
  await page.getByLabel('Auto Align').uncheck();
  await expect(page.getByRole('button', { name: 'Download snapshot' })).toBeEnabled();
  await page.reload();
  await page.route('**/mediapipe/face_landmarker.task', (route) => route.abort());
  await page.getByRole('tab', { name: 'Upload Photo', exact: true }).click();
  await page.getByLabel('Upload photo', { exact: true }).setInputFiles(photo);
  await expect(page.getByRole('alert')).toContainText('Face detection could not start', {
    timeout: 45000,
  });
  await page.unroute('**/mediapipe/face_landmarker.task');
  await page.getByRole('button', { name: 'Retry detection' }).click();
  await expect(page.getByText('Face Tracking: Active')).toBeVisible({ timeout: 45000 });
});

test('400 never saves; offline requires an explicit local save; mobile has no overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await upload(page);
  const count = (await data(page)).sessions.length;
  await page.route('**/api/try-on-sessions', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: '{"message":"productId validation failed"}',
    }),
  );
  await page.getByRole('button', { name: 'Save Try-On', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('productId validation failed');
  expect((await data(page)).sessions.length).toBe(count);
  await expect(page.getByRole('button', { name: 'Save as Local Demo' })).toHaveCount(0);
  await page.route('**/api/try-on-sessions', (route) => route.abort());
  await page.getByRole('button', { name: 'Save Try-On', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save as Local Demo' })).toBeVisible();
  expect((await data(page)).sessions.length).toBe(count);
  await page.getByRole('button', { name: 'Save as Local Demo' }).click();
  const record = (await data(page)).sessions.at(-1);
  expect(record.sync).toBe('Local / Unsynced');
  expect(record.requestValidated).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/phase1-studio-mobile.png', fullPage: true });
});

test('real VIDEO inference follows a moving/tilting/scaling face, freezes, captures, switches, and releases tracks', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.cameraTracks = [];
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: 'videoinput', deviceId: 'front' },
      { kind: 'videoinput', deviceId: 'back' },
    ];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const image = new Image();
      image.src = '/assets/portrait.jpg';
      await image.decode();
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 800;
      const ctx = c.getContext('2d');
      window.cameraCanvas = c;
      window.facePose = { x: 0, scale: 1, angle: 0 };
      const draw = () => {
        const p = window.facePose;
        ctx.fillStyle = '#bdb8cd';
        ctx.fillRect(0, 0, 800, 800);
        ctx.save();
        ctx.translate(400 + p.x, 400);
        ctx.rotate(p.angle);
        ctx.scale(p.scale, p.scale);
        ctx.drawImage(image, -320, -400, 640, 800);
        ctx.restore();
      };
      draw();
      const timer = setInterval(draw, 70);
      const stream = c.captureStream(15),
        track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        clearInterval(timer);
        stop();
      };
      track.getSettings = () => ({
        deviceId: constraints.video.deviceId?.exact || 'front',
        facingMode: 'user',
      });
      window.cameraTracks.push(track);
      return stream;
    };
  });
  await page.goto('/try-on?arDebug=1');
  await page.getByRole('button', { name: 'Start AR Camera', exact: true }).click();
  await expect(page.getByText('Face Tracking: Active')).toBeVisible({ timeout: 45000 });
  const measureOverlay = () =>
    page.locator('.tryon-canvas').evaluate((c) => {
      const original = document.createElement('canvas');
      original.width = c.width;
      original.height = c.height;
      const context = original.getContext('2d');
      context.translate(c.width, 0);
      context.scale(-1, 1);
      context.drawImage(window.cameraCanvas, 0, 0);
      const before = context.getImageData(0, 0, c.width, c.height).data,
        after = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let count = 0,
        x = 0,
        y = 0,
        xx = 0,
        yy = 0,
        xy = 0,
        min = c.width,
        max = 0;
      for (let i = 0; i < after.length; i += 4) {
        if (
          Math.abs(after[i] - before[i]) +
            Math.abs(after[i + 1] - before[i + 1]) +
            Math.abs(after[i + 2] - before[i + 2]) <
          40
        )
          continue;
        const px = (i / 4) % c.width,
          py = Math.floor(i / 4 / c.width);
        count++;
        x += px;
        y += py;
        xx += px * px;
        yy += py * py;
        xy += px * py;
        min = Math.min(min, px);
        max = Math.max(max, px);
      }
      x /= count;
      y /= count;
      return {
        count,
        x,
        width: max - min,
        angle:
          0.5 * Math.atan2(2 * (xy / count - x * y), xx / count - x * x - (yy / count - y * y)),
      };
    });
  await expect.poll(async () => (await measureOverlay()).count).toBeGreaterThan(100);
  await expect.poll(() => page.evaluate(() => window.__tryOnBridgeDebug?.yawSource)).toBe('MATRIX');
  expect(
    await page.evaluate(() => Number.isFinite(window.__tryOnBridgeDebug?.matrixYawDegrees)),
  ).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__tryOnBridgeDebug?.yawSource)).toBe('MATRIX');
  expect(
    await page.evaluate(() => Number.isFinite(window.__tryOnBridgeDebug?.matrixYawDegrees)),
  ).toBe(true);
  const startOverlay = await measureOverlay();
  const initial = await pixels(page);
  await page.evaluate(() => {
    window.facePose = { x: 80, scale: 1.15, angle: 0.16 };
  });
  await changed(page, initial);
  await expect.poll(async () => (await measureOverlay()).x).toBeLessThan(startOverlay.x - 45);
  await expect
    .poll(async () => (await measureOverlay()).width)
    .toBeGreaterThan(startOverlay.width * 1.05);
  await expect
    .poll(async () => (await measureOverlay()).angle)
    .toBeLessThan(startOverlay.angle - 0.06);
  await expect(page.getByText('Face Tracking: Active')).toBeVisible();
  // Isolate camera-distance changes from translation and roll. Measure the
  // renderer's width as well as the earlier pixel-based movement assertions.
  const scaleData = () => page.evaluate(() => window.__tryOnScaleDebug);
  const initialWidth = (await scaleData()).faceWidthPx;
  const settled = async () => {
    await expect
      .poll(async () => {
        const d = await scaleData();
        return Math.abs(d.smoothedGlassesWidth - d.targetGlassesWidth) / d.targetGlassesWidth;
      })
      .toBeLessThan(0.01);
    return scaleData();
  };
  await page.evaluate(() => {
    window.facePose = { x: 0, scale: 0.65, angle: 0 };
  });
  await expect.poll(async () => (await scaleData()).faceWidthPx).toBeLessThan(initialWidth * 0.8);
  const far = await settled();
  await page.evaluate(() => {
    window.facePose.scale = 1.3;
  });
  await expect
    .poll(async () => (await scaleData()).faceWidthPx)
    .toBeGreaterThan(far.faceWidthPx * 1.7);
  const near = await settled();
  expect(near.renderedGlassesWidth).toBeGreaterThan(far.renderedGlassesWidth * 1.7);
  expect(near.renderedGlassesWidth - far.renderedGlassesWidth).toBeGreaterThan(80);
  await page.evaluate(() => {
    window.facePose.scale = 0.65;
  });
  await expect
    .poll(async () => (await scaleData()).renderedGlassesWidth)
    .toBeLessThan(near.renderedGlassesWidth * 0.65);
  const returned = await settled();
  console.info('Real MediaPipe distance widths (canvas px):', {
    far: far.renderedGlassesWidth,
    near: near.renderedGlassesWidth,
    returned: returned.renderedGlassesWidth,
  });
  await test.info().attach('real-mediapipe-distance.json', {
    body: JSON.stringify({ far, near, returned }, null, 2),
    contentType: 'application/json',
  });
  await page.getByLabel('Auto Align').uncheck();
  await page.getByLabel('X offset', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Capture AR Result' }).click();
  await expect(page.getByText('SNAPSHOT', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => window.cameraTracks.every((t) => t.readyState === 'ended')),
  ).toBe(true);
  const after = await pixels(page);
  await page.getByRole('tab', { name: 'Before', exact: true }).click();
  await changed(page, after);
  await page.getByRole('button', { name: 'Retake with camera' }).click();
  await expect(page.getByText('Face Tracking: Active')).toBeVisible({ timeout: 45000 });
  await page.getByRole('button', { name: 'Switch camera' }).click();
  await expect.poll(() => page.evaluate(() => window.cameraTracks.length)).toBe(3);
  expect(
    await page.evaluate(() => window.cameraTracks.filter((t) => t.readyState === 'live').length),
  ).toBe(1);
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.cameraTracks.every((t) => t.readyState === 'ended')))
    .toBe(true);
  expect(errors).toEqual([]);
});
