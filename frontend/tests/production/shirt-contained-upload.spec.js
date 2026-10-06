import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile('public/assets/products/clothing/black-t-shirt/product.json', 'utf8'),
);
const product = {
  ...manifest,
  id: 1,
  categoryId: 1,
  categoryName: 'Clothing',
  imageUrl: `/assets/products/clothing/black-t-shirt/${manifest.frontAsset}`,
  arMetadata: {
    ...manifest,
    frontAsset: `/assets/products/clothing/black-t-shirt/${manifest.frontAsset}`,
  },
};

test('Black T-Shirt modal contains portrait, landscape and tall uploads with aligned fitting', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.route('**/assets/products/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith('.webp') ? 'image/webp' : 'image/png',
      body: await readFile(`public${path}`),
    });
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products/1') return route.fulfill({ json: product });
    if (path === '/api/products') return route.fulfill({ json: [product] });
    if (path === '/api/categories')
      return route.fulfill({ json: [{ id: 1, categoryName: 'Clothing' }] });
    return route.fulfill({ status: 401, json: { message: 'Sign in required' } });
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    };
  });
  await page.goto('/products/1?tryOn=true');
  const dialog = page.getByRole('dialog', { name: product.name, exact: true });
  await expect(dialog).toBeVisible();
  const photo = Buffer.from(await readFile('tests/fixtures/shirt-hands-on-hips.jpg')).toString(
    'base64',
  );
  for (const [name, width, height, emptyPoint, imagePoint] of [
    ['portrait', 600, 800, [10, 240], [145, 240]],
    ['landscape', 1200, 800, [320, 5], [320, 40]],
    ['tall-phone', 400, 900, [10, 240], [220, 240]],
  ]) {
    const encoded = await page.evaluate(
      async ({ photo, width, height }) => {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${photo}`;
        await image.decode();
        const canvas = Object.assign(document.createElement('canvas'), { width, height });
        const context = canvas.getContext('2d');
        context.fillStyle = '#718293';
        context.fillRect(0, 0, width, height);
        const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        context.drawImage(
          image,
          (width - drawWidth) / 2,
          (height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { photo, width, height },
    );
    await dialog.getByLabel('Upload photo', { exact: true }).setInputFiles({
      name: `${name}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(encoded, 'base64'),
    });
    await expect(dialog.getByText('Torso fitted', { exact: true })).toBeVisible({
      timeout: 60000,
    });
    const canvas = dialog.getByLabel('T-shirt try-on canvas');
    await expect(canvas).toHaveAttribute('width', '640');
    await expect(canvas).toHaveAttribute('height', '480');
    const pixels = await canvas.evaluate(
      (element, points) => {
        const context = element.getContext('2d');
        return points.map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]);
      },
      [emptyPoint, imagePoint],
    );
    expect(pixels[0], `${name} letterbox should remain inside the stage`).toBe(0);
    expect(pixels[1], `${name} source image should remain visible`).toBeGreaterThan(0);
    await expect(canvas).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Close virtual try-on' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Black T-Shirt modal still fits live camera input and releases its track on close', async ({
  page,
}) => {
  await page.route('**/assets/products/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: 'image/png',
      body: await readFile(`public${path}`),
    });
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products/1') return route.fulfill({ json: product });
    if (path === '/api/products') return route.fulfill({ json: [product] });
    if (path === '/api/categories')
      return route.fulfill({ json: [{ id: 1, categoryName: 'Clothing' }] });
    return route.fulfill({ status: 401, json: { message: 'Sign in required' } });
  });
  await page.addInitScript(() => {
    const points = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 1,
      presence: 1,
    }));
    for (const [id, x, y] of [
      [11, 0.66, 0.29],
      [12, 0.34, 0.29],
      [23, 0.62, 0.75],
      [24, 0.38, 0.75],
      [13, 0.74, 0.49],
      [14, 0.26, 0.49],
      [15, 0.79, 0.7],
      [16, 0.21, 0.7],
    ])
      points[id] = { ...points[id], x, y };
    window.shirtTracks = [];
    window.shirtFixture = { landmarks: points, worldLandmarks: points };
    const RealWorker = window.Worker;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('poseLandmarker.worker')) return new RealWorker(url, options);
        this.closed = false;
      }
      postMessage(message) {
        setTimeout(() => {
          message.bitmap.close();
          if (!this.closed)
            this.onmessage?.({
              data: {
                ...structuredClone(window.shirtFixture),
                timestamp: message.timestamp,
                inferenceMs: 20,
              },
            });
        }, 20);
      }
      terminate() {
        this.closed = true;
      }
    };
    navigator.mediaDevices.enumerateDevices = async () => [];
    navigator.mediaDevices.getUserMedia = async () => {
      const source = Object.assign(document.createElement('canvas'), { width: 640, height: 480 });
      const context = source.getContext('2d');
      context.fillStyle = '#718293';
      context.fillRect(0, 0, source.width, source.height);
      const stream = source.captureStream(12);
      window.shirtTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.goto('/products/1?tryOn=true');
  const dialog = page.getByRole('dialog', { name: product.name, exact: true });
  await expect(dialog.getByText('Torso fitted', { exact: true })).toBeVisible({ timeout: 30000 });
  const canvas = dialog.getByLabel('T-shirt try-on canvas');
  await expect(canvas).toHaveAttribute('width', '640');
  await expect(canvas).toHaveAttribute('height', '480');
  await dialog.getByRole('button', { name: 'Close virtual try-on' }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() => window.shirtTracks.every((track) => track.readyState === 'ended')),
  ).toBe(true);
});
