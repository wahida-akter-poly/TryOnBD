// Person-mask fitting policy, separate from the measured garment calibration.
// No body-type labels/presets: every accepted width comes from mask edges.
export const shirtSilhouetteCalibration = Object.freeze({
  threshold: 0.55,
  minQuality: 0.68,
  minWidthRatio: 0.45,
  maxWidthRatio: 2,
  corridorHalfRatio: 1.05,
  shoulderCorridorHalfRatio: 0.85,
  gapRatio: 0.018,
  scanBandRatio: 0.018,
  upperArmRadiusRatio: 0.085,
  forearmRadiusRatio: 0.065,
  protectedCoreRatio: 0.32,
  smoothMs: 180,
  jumpRatio: 0.22,
  jumpAcceptMs: 350,
  holdMs: 400,
  fadeMs: 450,
  chestEase: 0.045,
  waistEase: 0.05,
  hipEase: 0.045,
  shoulderEase: 0.015,
  meshColumns: 10,
  // Logo rectangle measured on the unchanged 1278x1230 source PNG.
  logo: {
    left: (722 - 91) / 1091,
    right: (892 - 91) / 1091,
    top: (245 - 56) / 1127,
    bottom: (405 - 56) / 1127,
    maxStretch: 1.12,
  },
});
