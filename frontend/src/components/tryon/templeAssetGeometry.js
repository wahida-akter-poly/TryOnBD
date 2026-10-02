// Alpha-weighted geometry, measured once per asset. The shaft and its curved
// hook remain photograph pixels; PCA only identifies the overall rotation.
export function measureTempleAlpha(pixels, width, height, left) {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  let weight = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const a = pixels[(y * width + x) * 4 + 3] / 255;
      if (!a) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const px = x + 0.5,
        py = y + 0.5;
      weight += a;
      sx += a * px;
      sy += a * py;
      sxx += a * px * px;
      syy += a * py * py;
      sxy += a * px * py;
    }
  if (!weight) throw new Error('Temple has no visible alpha pixels.');
  const cx = sx / weight,
    cy = sy / weight;
  const axisDegrees =
    (0.5 *
      Math.atan2(2 * (sxy / weight - cx * cy), sxx / weight - cx * cx - (syy / weight - cy * cy)) *
      180) /
    Math.PI;
  const strip = Math.max(1, Math.ceil((maxX - minX + 1) * 0.02));
  const edgeCenter = (right) => {
    let w = 0,
      ex = 0,
      ey = 0;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        if (right ? x <= maxX - strip : x >= minX + strip) continue;
        const a = pixels[(y * width + x) * 4 + 3] / 255;
        w += a;
        ex += a * (x + 0.5);
        ey += a * (y + 0.5);
      }
    return { x: ex / w, y: ey / w };
  };
  const hinge = edgeCenter(left),
    tip = edgeCenter(!left);
  return {
    naturalWidth: width,
    naturalHeight: height,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    centroid: { x: cx, y: cy },
    axisDegrees,
    hinge,
    tip,
    hingeTipDegrees: (Math.atan2(tip.y - hinge.y, Math.abs(tip.x - hinge.x)) * 180) / Math.PI,
    visibleLength: Math.hypot(tip.x - hinge.x, tip.y - hinge.y),
  };
}

// Convert measured alpha landmarks into the cropped destination rectangle.
// One uniform factor maps the actual hinge-to-tip length, not PNG width.
export function templeImagePlacement(length, bounds, hinge, tip) {
  const visibleLength = Math.hypot(tip.x - hinge.x, tip.y - hinge.y);
  const scale = length / visibleLength;
  return {
    x: -(hinge.x - bounds.x) * scale,
    y: -(hinge.y - bounds.y) * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
    scale,
    visibleLength,
  };
}
