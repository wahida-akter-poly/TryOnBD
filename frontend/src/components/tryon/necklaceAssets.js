import { necklaceFit } from './necklaceGeometry.js';

// Keep transparent product files unchanged; fit only their visible pixels in the canvas.
export function visibleAssetBounds({ data, width, height }) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < left
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function necklaceDrawRect(bounds, geometry) {
  const width = geometry.width;
  const height = (width * bounds.height) / bounds.width;
  // Geometry retains its existing smoothed chest center. Anchor the visible necklace
  // back at the neck, a little above the shoulder midpoint, in the rotated frame.
  const neckOffset = geometry.shoulderWidth * (necklaceFit.neckDropRatio + 0.1);
  return { x: -width / 2, y: -height * 0.24 - neckOffset, width, height };
}
