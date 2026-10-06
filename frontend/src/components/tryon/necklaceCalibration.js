// Calibration is derived from persisted product metadata, never IDs or categories.
export const necklaceStyles = Object.freeze({
  CHOKER: Object.freeze({
    style: 'CHOKER',
    widthRatio: 0.76,
    dropRatio: -0.03,
    pendantDropRatio: 0.08,
    heightRatio: 0.3,
  }),
  SHORT: Object.freeze({
    style: 'SHORT',
    widthRatio: 0.72,
    dropRatio: 0.04,
    pendantDropRatio: 0.23,
    heightRatio: 0.54,
  }),
  PENDANT: Object.freeze({
    style: 'PENDANT',
    widthRatio: 0.66,
    dropRatio: 0.14,
    pendantDropRatio: 0.42,
    heightRatio: 0.7,
  }),
});

const styleIn = (text) => {
  const value = String(text || '').replace(/[_-]+/g, ' ');
  for (const style of ['CHOKER', 'PENDANT', 'SHORT']) {
    if (new RegExp(`\\b${style}\\b`, 'i').test(value)) return style;
  }
  return null;
};

export function necklaceCalibration(product) {
  // Product name takes precedence; only the filename, never URL query parameters,
  // supplies the fallback token. Unclassified necklaces (including Silver Diamond) are SHORT.
  let filename = String(product?.imageUrl || '')
    .split(/[?#]/)[0]
    .split('/')
    .pop();
  try {
    filename = decodeURIComponent(filename);
  } catch {
    /* Retain malformed filename text. */
  }
  const supplied = String(product?.arMetadata?.style || '').toUpperCase();
  const style =
    (necklaceStyles[supplied] && supplied) ||
    styleIn(product?.name) ||
    styleIn(filename) ||
    'SHORT';
  const fit = product?.arMetadata?.fitProfile || {};
  const limits = {
    widthRatio: [0.3, 1.2],
    dropRatio: [-0.2, 0.4],
    pendantDropRatio: [0, 0.8],
    heightRatio: [0.1, 1.2],
  };
  const calibrated = { ...necklaceStyles[style] };
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (Number.isFinite(fit[key]) && fit[key] >= min && fit[key] <= max) calibrated[key] = fit[key];
  }
  return Object.freeze(calibrated);
}
