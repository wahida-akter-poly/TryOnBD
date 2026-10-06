// Deterministic cutouts: all retained RGB pixels come from the supplied photos.
// The 3q photograph is a visual hinge/shape reference, never a rendered overlay.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../public/assets/products/eyewear/modern-clear-frame/', import.meta.url);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const sources = await Promise.all(
    ['front', 'side'].map(
      async (name) =>
        `data:image/webp;base64,${(await readFile(new URL(`modern-clear-${name}.webp`, root))).toString('base64')}`,
    ),
  );
  const results = await page.evaluate(async ([front, side]) => {
    const load = async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return image;
    };
    const canvas = (w, h) =>
      Object.assign(document.createElement('canvas'), { width: w, height: h });
    const polygon = (ctx, vertices) => {
      ctx.beginPath();
      vertices.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    };
    const image = await load(front),
      c = canvas(image.width, image.height),
      ctx = c.getContext('2d');
    ctx.drawImage(image, 0, 0);
    // Remove white studio background, including soft white antialiasing.
    const removeWhite = (context, w, h) => {
      const pixels = context.getImageData(0, 0, w, h);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const white = Math.min(...pixels.data.subarray(i, i + 3));
        pixels.data[i + 3] = Math.round(
          pixels.data[i + 3] * Math.max(0, Math.min(1, (250 - white) / 20)),
        );
      }
      context.putImageData(pixels, 0, 0);
    };
    removeWhite(ctx, c.width, c.height);
    // Trace the INNER rim; erase the entire lens aperture, including back arms.
    ctx.globalCompositeOperation = 'destination-out';
    polygon(ctx, [
      [83, 425],
      [92, 412],
      [113, 399],
      [147, 389],
      [189, 389],
      [230, 397],
      [279, 413],
      [334, 435],
      [389, 458],
      [419, 475],
      [432, 491],
      [430, 525],
      [419, 561],
      [401, 593],
      [377, 617],
      [350, 630],
      [304, 638],
      [247, 643],
      [195, 646],
      [167, 641],
      [149, 620],
      [130, 591],
      [112, 556],
      [99, 525],
      [89, 489],
      [84, 459],
    ]);
    polygon(ctx, [
      [561, 488],
      [575, 469],
      [607, 455],
      [656, 434],
      [713, 411],
      [763, 395],
      [804, 386],
      [847, 383],
      [879, 387],
      [895, 399],
      [907, 421],
      [913, 452],
      [908, 489],
      [897, 528],
      [880, 564],
      [860, 594],
      [834, 620],
      [805, 636],
      [771, 642],
      [720, 640],
      [668, 637],
      [623, 629],
      [600, 615],
      [582, 590],
      [570, 557],
      [562, 524],
    ]);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillRect(32, 338, 946, 333);
    ctx.globalCompositeOperation = 'source-over';
    const armImage = await load(side),
      arm = canvas(armImage.width, armImage.height),
      a = arm.getContext('2d');
    a.drawImage(armImage, 0, 0);
    removeWhite(a, arm.width, arm.height);
    const mask = canvas(arm.width, arm.height),
      m = mask.getContext('2d');
    polygon(
      m,
      [
        [3, 213],
        [160, 217],
        [340, 229],
        [600, 246],
        [807, 261],
        [840, 276],
        [865, 302],
        [897, 338],
        [966, 405],
        [995, 420],
        [998, 435],
        [981, 445],
        [960, 449],
        [942, 440],
        [914, 407],
        [875, 366],
        [840, 326],
        [811, 296],
        [775, 286],
        [600, 292],
        [350, 294],
        [180, 289],
        [9, 278],
        [1, 258],
      ].map(([x, y]) => [x, y + 192]),
    );
    a.globalCompositeOperation = 'destination-in';
    a.drawImage(mask, 0, 0);
    const crop = (source) => {
      const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
      let l = source.width,
        t = source.height,
        r = 0,
        b = 0;
      for (let y = 0; y < source.height; y++)
        for (let x = 0; x < source.width; x++)
          if (pixels[(y * source.width + x) * 4 + 3]) {
            l = Math.min(l, x);
            t = Math.min(t, y);
            r = Math.max(r, x);
            b = Math.max(b, y);
          }
      if (l > r || t > b) throw new Error('Extraction mask contains no product pixels.');
      const out = canvas(r - l + 1, b - t + 1);
      out.getContext('2d').drawImage(source, -l, -t);
      return out;
    };
    const right = crop(arm),
      left = canvas(right.width, right.height),
      lc = left.getContext('2d');
    lc.translate(left.width, 0);
    lc.scale(-1, 1);
    lc.drawImage(right, 0, 0);
    return [crop(c), left, right].map((out) => out.toDataURL('image/png').split(',')[1]);
  }, sources);
  for (const [i, name] of ['front-clean', 'left-temple', 'right-temple'].entries()) {
    await writeFile(
      new URL(i === 0 ? 'front.png' : `modern-clear-${name}.png`, root),
      Buffer.from(results[i], 'base64'),
    );
    console.log(`Saved modern-clear-${name}.png`);
  }
} finally {
  await browser.close();
}
