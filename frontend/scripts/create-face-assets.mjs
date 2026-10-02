// Original, unbranded vector demo designs, rasterized to transparent PNGs.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const destination = fileURLToPath(new URL('../public/assets/face-ar/', import.meta.url));
await mkdir(destination, { recursive: true });
const wrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="metal" x2="1" y2="1"><stop stop-color="#fff1ac"/><stop offset=".45" stop-color="#b68531"/><stop offset=".7" stop-color="#ffe8a0"/><stop offset="1" stop-color="#8d6127"/></linearGradient><radialGradient id="pearl" cx=".35" cy=".3"><stop stop-color="#fff"/><stop offset=".7" stop-color="#eee8da"/><stop offset="1" stop-color="#b3aa93"/></radialGradient></defs>${body}</svg>`;
const bridge = (color, width = 8) => `<path d="M176 52Q200 32 224 52M8 33L35 39M365 39L392 33" fill="none" stroke="${color}" stroke-width="${width}"/>`;
const designs = {
  aviator: wrap(400, 150, `<g fill="#26352bc9" stroke="url(#metal)" stroke-width="7"><path d="M32 33Q85 13 174 34L170 79Q157 130 119 135Q55 138 34 79Z"/><path d="M368 33Q315 13 226 34L230 79Q243 130 281 135Q345 138 366 79Z"/></g>${bridge('#d7b36b', 6)}<path d="M176 28L224 28" stroke="#d7b36b" stroke-width="5"/>`),
  square: wrap(400, 150, `<g fill="#182020df" stroke="#171918" stroke-width="14"><rect x="28" y="26" width="148" height="105" rx="24"/><rect x="224" y="26" width="148" height="105" rx="24"/></g>${bridge('#171918', 14)}<path d="M48 45L149 45M245 45L350 45" stroke="#b5c5bd" opacity=".2" stroke-width="5"/>`),
  round: wrap(400, 150, `<g fill="#65553a85" stroke="url(#metal)" stroke-width="6"><ellipse cx="107" cy="77" rx="68" ry="66"/><ellipse cx="293" cy="77" rx="68" ry="66"/></g>${bridge('#b99b60', 6)}`),
  clear: wrap(400, 150, `<g fill="#bce8ec25" stroke="#e6f6f0cc" stroke-width="13"><rect x="29" y="25" width="146" height="105" rx="37"/><rect x="225" y="25" width="146" height="105" rx="37"/></g><g fill="none" stroke="#819892" stroke-width="2"><rect x="29" y="25" width="146" height="105" rx="37"/><rect x="225" y="25" width="146" height="105" rx="37"/></g>${bridge('#d4e4dfcc', 10)}`),
  pearl: wrap(100, 220, `<circle cx="50" cy="14" r="10" fill="url(#metal)"/><path d="M50 24V108" stroke="url(#metal)" stroke-width="6"/><ellipse cx="50" cy="159" rx="35" ry="46" fill="url(#pearl)" stroke="#c5af79" stroke-width="3"/>`),
  gold: wrap(100, 220, `<circle cx="50" cy="14" r="11" fill="url(#metal)"/><path d="M50 25V55" stroke="#c99c4b" stroke-width="5"/><path d="M50 48C42 74 9 110 12 151C15 222 85 222 88 151C91 110 58 74 50 48Z" fill="url(#metal)"/><path d="M49 81C32 115 25 137 27 158" fill="none" stroke="#fff1b7" stroke-width="4"/>`),
  crystal: wrap(100, 220, `<circle cx="50" cy="14" r="10" fill="#d9efed" stroke="#a8b7b9" stroke-width="3"/><path d="M50 24V61" stroke="#b4c5c5" stroke-width="5"/><path d="M50 55L86 135L50 207L14 135Z" fill="#e0f6fa" stroke="#a4b9bd" stroke-width="4"/><path d="M50 55V207M14 135L50 116L86 135L50 156Z" fill="#b0d8e4" stroke="#fff" stroke-width="2"/>`),
  jhumka: wrap(140, 220, `<circle cx="70" cy="14" r="11" fill="url(#metal)"/><path d="M70 26V71" stroke="#c6a254" stroke-width="6"/><path d="M16 157Q18 73 70 73Q122 73 124 157Z" fill="url(#metal)" stroke="#987533" stroke-width="3"/><path d="M40 149Q40 96 62 85M70 82V152M100 149Q100 96 78 85" fill="none" stroke="#fff0a5" stroke-width="4"/>${[23,46,70,94,117].map((x) => `<path d="M${x} 155V181" stroke="#c6a254" stroke-width="4"/><circle cx="${x}" cy="190" r="10" fill="url(#pearl)"/>`).join('')}`),
  tikka: wrap(180, 280, `<path d="M90 8V149" stroke="url(#metal)" stroke-width="9"/>${[20,45,70,95,120].map((y) => `<circle cx="90" cy="${y}" r="7" fill="#f4e7b8" stroke="#a88743" stroke-width="2"/>`).join('')}<path d="M90 140Q157 171 143 214Q130 251 90 260Q50 251 37 214Q23 171 90 140Z" fill="url(#metal)"/><path d="M90 161L120 206L90 238L60 206Z" fill="#126c56" stroke="#ffe7a3" stroke-width="5"/><circle cx="90" cy="270" r="8" fill="url(#pearl)"/>`),
  headpiece: wrap(300, 220, `<path d="M12 47Q150 163 288 47M150 6V128" fill="none" stroke="url(#metal)" stroke-width="7"/>${[36,72,108,150,192,228,264].map((x) => `<circle cx="${x}" cy="${100 - Math.abs(x-150)*.35}" r="9" fill="url(#pearl)" stroke="#c2a05b" stroke-width="3"/>`).join('')}<path d="M150 114L176 158L150 206L124 158Z" fill="#d5eced" stroke="url(#metal)" stroke-width="7"/>`),
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, svg] of Object.entries(designs)) {
    await writeFile(`${destination}${name}.svg`, svg);
    const png = await page.evaluate(async (svg) => {
      const image = new Image(); image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width * 2; canvas.height = image.height * 2;
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, svg);
    await writeFile(`${destination}${name}.png`, Buffer.from(png, 'base64'));
  }
} finally { await browser.close(); }
console.log(`Created ${Object.keys(designs).length} original transparent accessory PNGs.`);
