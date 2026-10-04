import {
  structuredShirtFit,
  structuredSourceLandmarks,
  structuredSourceRegions,
} from './structuredShirtCalibration.js';
import { shirtSilhouetteCalibration } from './shirtSilhouetteCalibration.js';
// Frontend-only calibration. It is never sent to the product/backend DTOs.
export const defaultShirtCalibration = Object.freeze({
  ...structuredShirtFit,
  silhouette: shirtSilhouetteCalibration,
  sourceRegions: structuredSourceRegions,
  arType: 'tshirt',
  asset: '/assets/body-ar/shirts/tshirt-black-front.png',
  widthMultiplier: 1,
  heightMultiplier: 1,
  shoulderPadding: 0.06,
  hipPadding: 0.1,
  hemOffset: 0.1,
  collarOffsetX: 0,
  collarOffsetY: -0.03,
  sleeveMultiplier: 0.35,
  maxSleeveRotation: 25,
  maxYaw: 35,
  perspectiveStrength: 0.18,
  sourceLandmarks: structuredSourceLandmarks,
});

export function shirtCalibration(product = {}) {
  const custom = product.shirtAR || {};
  const fit = { ...defaultShirtCalibration, ...custom };
  fit.sourceLandmarks = { ...defaultShirtCalibration.sourceLandmarks, ...custom.sourceLandmarks };
  fit.sourceRegions = { ...defaultShirtCalibration.sourceRegions, ...custom.sourceRegions };
  fit.silhouette = { ...shirtSilhouetteCalibration, ...custom.silhouette };
  if (
    Object.entries(shirtSilhouetteCalibration).some(
      ([key, value]) => typeof value === 'number' && !Number.isFinite(fit.silhouette[key]),
    ) ||
    !['chestEase', 'waistEase', 'hipEase'].every(
      (key) => fit.silhouette[key] >= 0.03 && fit.silhouette[key] <= 0.06,
    ) ||
    fit.silhouette.threshold <= 0 ||
    fit.silhouette.threshold >= 1 ||
    fit.silhouette.smoothMs <= 0
  )
    throw new Error('Invalid shirt silhouette calibration');
  for (const [key, value] of Object.entries(defaultShirtCalibration)) {
    if (typeof value === 'number' && !Number.isFinite(fit[key]))
      throw new Error(`Invalid shirt calibration: ${key}`);
  }
  if (
    fit.widthMultiplier <= 0 ||
    fit.heightMultiplier <= 0 ||
    fit.maxYaw <= 0 ||
    fit.sleeveMultiplier <= 0
  )
    throw new Error('Invalid shirt dimensions');
  for (const p of Object.values(fit.sourceLandmarks))
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < 0 ||
      p.x > 1 ||
      p.y < 0 ||
      p.y > 1
    )
      throw new Error('Invalid shirt source landmarks');
  const s = fit.sourceLandmarks;
  if (
    s.leftShoulder.x >= s.rightShoulder.x ||
    s.bottomLeftHem.x >= s.bottomRightHem.x ||
    s.bottomLeftHem.y <= s.leftShoulder.y ||
    s.bottomRightHem.y <= s.rightShoulder.y
  )
    throw new Error('Crossed shirt source landmarks');
  if (
    fit.sleeveLengthRatio < 0.5 ||
    fit.sleeveLengthRatio > 0.6 ||
    fit.sleeveMinLengthRatio < 0.5 ||
    fit.sleeveMaxLengthRatio > 0.6 ||
    fit.sleeveMinLengthRatio > fit.sleeveLengthRatio ||
    fit.sleeveMaxLengthRatio < fit.sleeveLengthRatio ||
    fit.sleeveCuffTaper < 0.85 ||
    fit.sleeveCuffTaper > 0.92 ||
    fit.sleeveWidthCalibration <= 0 ||
    fit.hemMaxVerticalRatio <= 0 ||
    fit.hemMaxVerticalRatio > 0.1 ||
    fit.armRadiusRatio <= 0 ||
    fit.armRadiusRatio > 0.05 ||
    fit.armSegmentRadiusRatio <= 0 ||
    fit.armSegmentRadiusRatio > 0.2 ||
    fit.elbowRadiusMultiplier <= 0 ||
    fit.elbowRadiusMultiplier > 1 ||
    fit.wristRadiusMultiplier <= 0 ||
    fit.wristRadiusMultiplier > fit.elbowRadiusMultiplier ||
    fit.sleeveVisibleMinRatio < 0.5 ||
    fit.sleeveVisibleMaxRatio > 0.6 ||
    fit.sleeveVisibleMinRatio > fit.sleeveVisibleMaxRatio ||
    fit.neckWidthRatio < fit.collarMinWidthRatio ||
    fit.neckWidthRatio > fit.collarMaxWidthRatio ||
    fit.collarMinWidthRatio < 0.28 ||
    fit.collarMaxWidthRatio > 0.34 ||
    fit.collarVerticalOffset < 0.04 ||
    fit.collarVerticalOffset > 0.08 ||
    fit.seamOverlapRatio < 0.02 ||
    fit.seamOverlapRatio > 0.04 ||
    fit.hemLengthExtension < 0.05 ||
    fit.hemLengthExtension > 0.09 ||
    fit.upperArmStartRadiusMultiplier <= 0 ||
    fit.upperArmStartRadiusMultiplier > 0.5
  )
    throw new Error('Invalid structured shirt proportions');
  for (const side of ['left', 'right']) {
    const bounds = fit.sourceSleeveAlphaBounds?.[side];
    if (
      !bounds ||
      !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key])) ||
      bounds.x < 0 ||
      bounds.y < 0 ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      bounds.x + bounds.width > 1 ||
      bounds.y + bounds.height > 1
    )
      throw new Error('Invalid shirt sleeve alpha bounds');
  }
  for (const region of Object.values(fit.sourceRegions))
    if (
      !Array.isArray(region) ||
      region.length < 3 ||
      region.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 0 ||
          p.x > 1 ||
          p.y < 0 ||
          p.y > 1,
      )
    )
      throw new Error('Invalid shirt source region');
  return fit;
}
