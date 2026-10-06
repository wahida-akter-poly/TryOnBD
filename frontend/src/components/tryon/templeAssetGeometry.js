// Alpha-weighted geometry, measured once per asset. The shaft and its curved
// hook remain photograph pixels; PCA only identifies the overall rotation.
export function measureTempleCenterline(pixels, width, height, hinge, tip, count = 16) {
  const dx = tip.x - hinge.x,
    band = Math.max(1, Math.abs(dx) / count / 2);
  return Array.from({ length: count + 1 }, (_, i) => {
    const u = i / count;
    if (i === 0 || i === count) return { u, y: i === 0 ? hinge.y : tip.y };
    const x = hinge.x + dx * u;
    let weight = 0,
      sum = 0;
    for (
      let px = Math.max(0, Math.floor(x - band));
      px < Math.min(width, Math.ceil(x + band));
      px++
    )
      for (let py = 0; py < height; py++) {
        const alpha = pixels[(py * width + px) * 4 + 3];
        weight += alpha;
        sum += alpha * (py + 0.5);
      }
    return { u, y: weight ? sum / weight : hinge.y + (tip.y - hinge.y) * u };
  });
}

export function measureTempleThickness(pixels, width, height, hinge, tip) {
  const dx = tip.x - hinge.x,
    samples = [];
  // Ignore hinge hardware and the hook; estimate the genuine shaft cross-section.
  for (let i = 2; i <= 10; i++) {
    const x = Math.max(0, Math.min(width - 1, Math.round(hinge.x + (dx * i) / 16)));
    let thickness = 0;
    for (let y = 0; y < height; y++) thickness += pixels[(y * width + x) * 4 + 3] / 255;
    if (thickness > 0) samples.push(thickness / Math.abs(dx));
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0.03;
}

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

// Shaft basis in source pixels. Explicit normalized anchors also support
// vertically photographed or reversed cutouts without changing handedness.
export function templeSourceBasis(pixels, width, height, left, anchors) {
  const measured = measureTempleAlpha(pixels, width, height, left);
  let hinge, tip, ax, ay;
  if (anchors) {
    const point = (p) => {
      if (!p || ![p.x, p.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
        throw new Error('Temple source anchors must be normalized PNG coordinates.');
      return { x: p.x * width, y: p.y * height };
    };
    hinge = point(anchors.hinge);
    tip = point(anchors.tip);
    const shaft = anchors.shaft ? point(anchors.shaft) : tip;
    const length = Math.hypot(shaft.x - hinge.x, shaft.y - hinge.y);
    if (length < 1) throw new Error('Temple source hinge and tip must be distinct.');
    ax = (shaft.x - hinge.x) / length;
    ay = (shaft.y - hinge.y) / length;
  } else {
    const angle = (measured.axisDegrees * Math.PI) / 180;
    ax = Math.cos(angle);
    ay = Math.sin(angle);
    let lo = Infinity,
      hi = -Infinity;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] < 8) continue;
        const t = (x + 0.5) * ax + (y + 0.5) * ay;
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    const band = Math.max(1, (hi - lo) * 0.02);
    const end = (high) => {
      let w = 0,
        sx = 0,
        sy = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const a = pixels[(y * width + x) * 4 + 3];
          if (a < 8) continue;
          const t = (x + 0.5) * ax + (y + 0.5) * ay;
          if (high ? t < hi - band : t > lo + band) continue;
          w += a;
          sx += a * (x + 0.5);
          sy += a * (y + 0.5);
        }
      return { x: sx / w, y: sy / w };
    };
    hinge = end(left);
    tip = end(!left);
    if (left) {
      ax = -ax;
      ay = -ay;
    }
  }
  const length = (tip.x - hinge.x) * ax + (tip.y - hinge.y) * ay;
  if (!Number.isFinite(length) || length < 1) throw new Error('Temple shaft has no usable length.');
  return { hinge, tip, ax, ay, length, measured };
}
