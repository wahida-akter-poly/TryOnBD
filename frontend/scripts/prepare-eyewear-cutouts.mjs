// Deterministic photographic cutouts: never generates or substitutes product pixels.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
const file = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Pass a source-mask JSON file.');
const config = JSON.parse(await readFile(file, 'utf8')),
  folder = dirname(file);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const part of config.parts) {
    if (
      basename(part.source) !== part.source ||
      !['front.png', 'left-temple.png', 'right-temple.png'].includes(part.output)
    )
      throw new Error('Use local sources and conventional output names.');
    const original = await readFile(resolve(folder, part.source));
    const result = await page.evaluate(
      async ({ src, part }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < data.data.length; i += 4) {
          const distance = 255 - Math.min(data.data[i], data.data[i + 1], data.data[i + 2]);
          const alpha = Math.max(0, Math.min(1, (distance - 4) / 12));
          // Remove the known white matte at boundary pixels; interior RGB is unchanged.
          if (alpha > 0 && alpha < 1)
            for (let c = 0; c < 3; c++)
              data.data[i + c] = Math.max(
                0,
                Math.min(255, (data.data[i + c] - 255 * (1 - alpha)) / alpha),
              );
          data.data[i + 3] = Math.round(data.data[i + 3] * alpha);
        }
        ctx.putImageData(data, 0, 0);
        if (part.polygon) {
          ctx.globalCompositeOperation = 'destination-in';
          ctx.beginPath();
          part.polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let x0 = canvas.width,
          y0 = canvas.height,
          x1 = -1,
          y1 = -1,
          visible = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++)
            if (px[(y * canvas.width + x) * 4 + 3]) {
              x0 = Math.min(x0, x);
              x1 = Math.max(x1, x);
              y0 = Math.min(y0, y);
              y1 = Math.max(y1, y);
              visible++;
            }
        if (!visible) throw new Error('Source mask has no visible product pixels.');
        const output = document.createElement('canvas');
        output.width = part.crop ? x1 - x0 + 5 : canvas.width;
        output.height = part.crop ? y1 - y0 + 5 : canvas.height;
        const target = output.getContext('2d');
        if (part.flipX) {
          target.translate(output.width, 0);
          target.scale(-1, 1);
        }
        if (part.crop)
          target.drawImage(
            canvas,
            x0,
            y0,
            x1 - x0 + 1,
            y1 - y0 + 1,
            2,
            2,
            x1 - x0 + 1,
            y1 - y0 + 1,
          );
        else target.drawImage(canvas, 0, 0);
        return {
          png: output.toDataURL('image/png').split(',')[1],
          width: output.width,
          height: output.height,
          visible,
          sourceBounds: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
        };
      },
      { src: 'data:image/png;base64,' + original.toString('base64'), part },
    );
    await writeFile(resolve(folder, part.output), Buffer.from(result.png, 'base64'));
    const after = await readFile(resolve(folder, part.source));
    if (!original.equals(after)) throw new Error('Original source changed.');
    console.log(
      JSON.stringify({
        source: part.source,
        sha256: createHash('sha256').update(original).digest('hex'),
        output: part.output,
        ...result,
        png: undefined,
      }),
    );
  }
} finally {
  await browser.close();
}
