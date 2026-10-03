// Read-only measurement of the current product PNG; never writes image assets.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  structuredSourceRegions,
  shirtSourceMeasurement,
} from '../src/data/structuredShirtCalibration.js';
const src = `data:image/png;base64,${(await readFile(new URL('../public/assets/body-ar/shirts/tshirt-black-front.png', import.meta.url))).toString('base64')}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  console.log(
    JSON.stringify(
      await page.evaluate(
        async ({ src, regions, bounds }) => {
          const im = new Image();
          im.src = src;
          await im.decode();
          const c = Object.assign(document.createElement('canvas'), {
            width: im.width,
            height: im.height,
          });
          const ctx = c.getContext('2d');
          ctx.drawImage(im, 0, 0);
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          let left = c.width,
            top = c.height,
            right = 0,
            bottom = 0;
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++)
              if (data[(y * c.width + x) * 4 + 3] >= 16) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
          const regionAlphaBounds = {};
          const union = new Uint8Array(c.width * c.height);
          for (const [name, polygon] of Object.entries(regions)) {
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.save();
            ctx.beginPath();
            polygon.forEach((p, i) =>
              ctx[i ? 'lineTo' : 'moveTo'](
                bounds.x + p.x * bounds.width,
                bounds.y + p.y * bounds.height,
              ),
            );
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(im, 0, 0);
            ctx.restore();
            const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
            for (let i = 0; i < union.length; i++) union[i] = Math.max(union[i], pixels[i * 4 + 3]);
            let x0 = c.width,
              y0 = c.height,
              x1 = 0,
              y1 = 0;
            for (let y = 0; y < c.height; y++)
              for (let x = 0; x < c.width; x++)
                if (pixels[(y * c.width + x) * 4 + 3] >= 16) {
                  x0 = Math.min(x0, x);
                  y0 = Math.min(y0, y);
                  x1 = Math.max(x1, x);
                  y1 = Math.max(y1, y);
                }
            regionAlphaBounds[name] = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
          }
          const cuffColumns = [
            100, 140, 180, 204, 240, 280, 317, 959, 999, 1030, 1070, 1120, 1170,
          ].map((x) => {
            let originalBottom = 0,
              regionBottom = 0;
            for (let y = 180; y < 560; y++) {
              const i = y * c.width + x;
              if (data[i * 4 + 3] >= 16) originalBottom = y;
              if (union[i] >= 16) regionBottom = y;
            }
            return { x, originalBottom, regionBottom };
          });
          let upperPixels = 0,
            missingUpperPixels = 0;
          for (let y = 56; y < 560; y++)
            for (let x = 91; x < 1182; x++) {
              const i = y * c.width + x;
              if (data[i * 4 + 3] >= 16) {
                upperPixels++;
                if (union[i] < 16) missingUpperPixels++;
              }
            }
          return {
            width: c.width,
            height: c.height,
            visibleAlphaBounds: {
              x: left,
              y: top,
              width: right - left + 1,
              height: bottom - top + 1,
            },
            regionAlphaBounds,
            cuffColumns,
            upperCoverage: { upperPixels, missingUpperPixels },
          };
        },
        {
          src,
          regions: structuredSourceRegions,
          bounds: shirtSourceMeasurement.visibleAlphaBounds,
        },
      ),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
