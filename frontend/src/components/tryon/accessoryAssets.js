import { measureTempleAlpha } from './templeAssetGeometry.js';
import { modernClearTempleCalibration } from '../../data/modernClearTempleCalibration.js';

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('This image could not be opened. Try a PNG, JPEG, or WebP photo.'));
    image.src = url;
  });
}

// Include every nontransparent pixel, including translucent lenses/antialiasing.
// Run once per loaded asset, never in the video/inference loop.
export function alphaBounds(pixels, width, height) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export async function loadAccessoryAsset(src, fallbackSrc, crop = false) {
  async function open(path) {
    const image = await loadImage(path);
    let bounds = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    if (crop) {
      const buffer = document.createElement('canvas');
      buffer.width = image.naturalWidth;
      buffer.height = image.naturalHeight;
      const ctx = buffer.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      bounds = alphaBounds(
        ctx.getImageData(0, 0, buffer.width, buffer.height).data,
        buffer.width,
        buffer.height,
      );
      if (!bounds) throw new Error('The accessory image is entirely transparent.');
    }
    return { image, bounds, src: path, isFallback: path === fallbackSrc };
  }
  const primary = src || fallbackSrc;
  if (!primary) throw new Error('Realistic try-on asset unavailable.');
  try {
    return await open(primary);
  } catch (error) {
    if (!fallbackSrc || primary === fallbackSrc) throw error;
    return open(fallbackSrc);
  }
}

// Atomic load: a missing product part is an error, never a partial/fake substitute.
// The hinge is at the right edge of the mirrored left arm, and the left edge
// of the right arm. Measure its opaque centre instead of assuming image centre.
function inspectTemple(part, left) {
  const canvas = document.createElement('canvas');
  const image = part.image;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const measured = measureTempleAlpha(pixels, canvas.width, canvas.height, left);
  const calibration = modernClearTempleCalibration[part.src.split('/').pop()];
  if (
    calibration &&
    (calibration.normalized.naturalWidth !== canvas.width ||
      calibration.normalized.naturalHeight !== canvas.height)
  )
    throw new Error('Normalized temple dimensions do not match hinge calibration.');
  const geometry = calibration?.normalized ?? measured;
  let visible = 0,
    opaque = 0,
    alphaSum = 0,
    earWeight = 0,
    earY = 0;
  const b = part.bounds,
    strip = Math.max(1, Math.ceil(b.width * 0.02));
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (!alpha) continue;
      visible++;
      alphaSum += alpha;
      if (alpha >= 240) opaque++;
      if (left ? x < b.x + strip : x >= b.x + b.width - strip) {
        earWeight += alpha;
        earY += (y - b.y + 0.5) * alpha;
      }
    }
  return {
    ...part,
    hingePivot: { x: (geometry.hinge.x - b.x) / b.width, y: (geometry.hinge.y - b.y) / b.height },
    visibleHinge: geometry.hinge,
    visibleTip: geometry.tip,
    visibleLength: geometry.visibleLength,
    normalizedAxisDegrees: measured.axisDegrees,
    earPivot: { x: left ? 0 : 1, y: earWeight ? earY / earWeight / b.height : 0.9 },
    inspection: {
      decoded: image.complete && image.naturalWidth > 0,
      naturalWidth: canvas.width,
      naturalHeight: canvas.height,
      visiblePixels: visible,
      opaquePixels: opaque,
      meanVisibleAlpha: alphaSum / visible / 255,
      bounds: b,
      alphaGeometry: geometry,
      originalAxisDegrees: calibration?.original.axisDegrees ?? measured.axisDegrees,
    },
  };
}

// Enclosed lens apertures measured from the actual front photograph. Exterior
// transparency is flood-filled away, so this mask cannot clip hinge/temple roots.
// Extract once on asset load; no per-frame pixel scan or product-specific stencil.
export function measureLensApertures(pixels, width, height, bounds) {
  const seen = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  const open = (i) => pixels[i * 4 + 3] < 160;
  const fill = (start, collect = false) => {
    let head = 0,
      tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      for (const n of [
        x > 0 ? i - 1 : -1,
        x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y + 1 < height ? i + width : -1,
      ])
        if (n >= 0 && !seen[n] && open(n)) {
          seen[n] = 1;
          queue[tail++] = n;
        }
    }
    return collect ? Array.from(queue.subarray(0, tail)) : null;
  };
  for (let x = 0; x < width; x++)
    for (const i of [x, (height - 1) * width + x]) if (!seen[i] && open(i)) fill(i);
  for (let y = 0; y < height; y++)
    for (const i of [y * width, y * width + width - 1]) if (!seen[i] && open(i)) fill(i);
  const regions = [];
  for (let i = 0; i < seen.length; i++)
    if (!seen[i] && open(i)) {
      const region = fill(i, true);
      if (region.length > bounds.width * bounds.height * 0.015) regions.push(region);
    }
  return regions
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
    .map((region) => {
      const rows = new Map();
      for (const i of region) {
        const y = Math.floor(i / width),
          x = i % width,
          r = rows.get(y) ?? [x, x];
        rows.set(y, [Math.min(r[0], x), Math.max(r[1], x)]);
      }
      const entries = [...rows].sort((a, b) => a[0] - b[0]);
      const point = (x, y) => ({
        x: (x - bounds.x) / bounds.width,
        y: (y - bounds.y) / bounds.height,
      });
      return {
        pixels: region,
        outline: [
          ...entries.map(([y, r]) => point(r[0], y)),
          ...entries.reverse().map(([y, r]) => point(r[1] + 1, y + 1)),
        ],
      };
    });
}
function lensOccluder(front) {
  const canvas = document.createElement('canvas');
  canvas.width = front.image.naturalWidth;
  canvas.height = front.image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(front.image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height),
    regions = measureLensApertures(data.data, canvas.width, canvas.height, front.bounds);
  if (!regions.length) return { lensOccluder: null, lensOutlines: [] };
  data.data.fill(0);
  for (const region of regions)
    for (const i of region.pixels) data.data.set([255, 255, 255, 255], i * 4);
  ctx.putImageData(data, 0, 0);
  return {
    lensOccluder: { image: canvas, bounds: front.bounds },
    lensOutlines: regions.map((r) => r.outline),
  };
}

export async function loadGlassesAssembly(frontFrameSrc, leftTempleSrc, rightTempleSrc) {
  const [front, leftTemple, rightTemple] = await Promise.all([
    loadAccessoryAsset(frontFrameSrc, null, true),
    loadAccessoryAsset(leftTempleSrc, null, true),
    loadAccessoryAsset(rightTempleSrc, null, true),
  ]);
  return {
    ...front,
    ...lensOccluder(front),
    leftTemple: inspectTemple(leftTemple, true),
    rightTemple: inspectTemple(rightTemple, false),
  };
}
