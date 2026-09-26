import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('img').evaluateAll((images) =>
  images.forEach((img) => {
    img.loading = 'eager';
  }),
);
await page.waitForFunction(() =>
  [...document.images].every((img) => img.complete && img.naturalWidth > 0),
);
await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
await page.goto('http://127.0.0.1:5173/dashboard/super-admin');
await page.locator('.chart-wrap').first().waitFor();
await page.waitForTimeout(1200);
await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
await page.goto('http://127.0.0.1:5173/try-on');
await page.getByRole('button', { name: /use the illustrated demo portrait/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'artifacts/studio-desktop.png', fullPage: true });
await page.setViewportSize({ width: 375, height: 812 });
await page.goto('http://127.0.0.1:5173/');
await page.locator('img').evaluateAll((images) =>
  images.forEach((img) => {
    img.loading = 'eager';
  }),
);
await page.waitForFunction(() =>
  [...document.images].every((img) => img.complete && img.naturalWidth > 0),
);
await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
console.log(
  JSON.stringify({
    errors,
    images: await page.locator('img').evaluateAll((images) =>
      images.map((img) => ({
        src: img.currentSrc,
        loaded: img.complete && img.naturalWidth > 0,
      })),
    ),
  }),
);
await browser.close();
