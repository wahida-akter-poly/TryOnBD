import { loadImage, alphaBounds } from './accessoryAssets.js';
export const REAL_SHIRT_ASSET_REQUIRED = 'REAL_SHIRT_ASSET_REQUIRED';

// Ignore near-invisible alpha dust in otherwise transparent canvas padding.
// This measures the working PNG; the source pixels/file are never changed.
export function measureShirtAlpha(data, width, height) {
  const visible = new Uint8ClampedArray(data);
  for (let i = 3; i < visible.length; i += 4) if (visible[i] < 16) visible[i] = 0;
  return alphaBounds(visible, width, height);
}

export async function loadShirtAsset(src) {
  try {
    if (!src || !/\.png(?:\?|$)/i.test(src)) throw new Error('A transparent PNG is required');
    const image = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const bounds = measureShirtAlpha(data, canvas.width, canvas.height);
    let transparent = false;
    for (let i = 3; i < data.length; i += 4)
      if (data[i] === 0) {
        transparent = true;
        break;
      }
    if (!bounds || !transparent) throw new Error('A transparent product cutout is required');
    return {
      image,
      bounds,
      src,
      visibleLeft: bounds.x,
      visibleTop: bounds.y,
      visibleRight: bounds.x + bounds.width,
      visibleBottom: bounds.y + bounds.height,
    };
  } catch (cause) {
    const error = new Error(
      'Real T-shirt image unavailable. Add the transparent product PNG to enable try-on.',
      { cause },
    );
    error.code = REAL_SHIRT_ASSET_REQUIRED;
    throw error;
  }
}
