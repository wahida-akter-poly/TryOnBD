// Optional source-photo aperture calibration. The AR lens is a material,
// rather than a photographed rear arm visible through the product's lens.
// The actual front asset remains the source; processing runs once per load.
export function sampleLensTint(pixels, width, height, samples) {
  const channels = [[], [], [], []];
  for (const [sx, sy] of samples) {
    for (
      let y = Math.max(0, Math.round(sy) - 3);
      y <= Math.min(height - 1, Math.round(sy) + 3);
      y++
    )
      for (
        let x = Math.max(0, Math.round(sx) - 3);
        x <= Math.min(width - 1, Math.round(sx) + 3);
        x++
      ) {
        const i = (y * width + x) * 4;
        if (pixels[i + 3] < 20) continue;
        for (let c = 0; c < 4; c++) channels[c].push(pixels[i + c]);
      }
  }
  if (!channels[0].length) throw new Error('Lens material sampling needs visible product pixels.');
  return channels.map((values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
}

export function applyLensSurface(asset, calibration) {
  if (!calibration) return asset;
  const image = asset.image,
    w = image.naturalWidth,
    h = image.naturalHeight;
  if (w !== calibration.width || h !== calibration.height)
    throw new Error('Product lens calibration does not match the real front image.');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const original = ctx.getImageData(0, 0, w, h).data;
  const tints = [];
  for (const lens of calibration.apertures) {
    const [r, g, b, a] = sampleLensTint(original, w, h, lens.samples);
    ctx.beginPath();
    ctx.moveTo(...lens.outline[0]);
    for (const p of lens.outline.slice(1)) ctx.lineTo(...p);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = `rgba(${r},${g},${b},${(a / 255) * (calibration.opacity ?? 1)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    tints.push({ r, g, b, opacity: (a / 255) * (calibration.opacity ?? 1) });
  }
  // Keep photographed nose-pad hardware inside the calibrated aperture.
  for (const outline of calibration.hardware ?? []) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...outline[0]);
    for (const p of outline.slice(1)) ctx.lineTo(...p);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }
  return {
    ...asset,
    image: canvas,
    lensMaterial: { tints, source: asset.src },
    originalImage: image,
  };
}
