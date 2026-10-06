import { clamp, poseToCanvas } from './shirtGeometry.js';
import { necklaceStyles } from './necklaceCalibration.js';

export const necklacePoseLandmarks = Object.freeze({
  NOSE: 0,
  LEFT_MOUTH: 9,
  RIGHT_MOUTH: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
});

export const necklaceFit = Object.freeze({
  fallbackNeckRatio: -0.1,
  headFusionMax: 0.75,
  neckSmoothingMs: 130,
  maxRoll: Math.PI / 5,
  minShoulderWidth: 48,
  confidence: 0.55,
  xCompressionPerYaw: 0.002,
});

const landmarkConfidence = (p) => Math.min(p?.visibility ?? 1, p?.presence ?? 1);
const validLandmark = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= -0.08 &&
  p.x <= 1.08 &&
  p.y >= -0.08 &&
  p.y <= 1.08 &&
  Number.isFinite(landmarkConfidence(p)) &&
  landmarkConfidence(p) >= necklaceFit.confidence;
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const finiteGeometry = (geometry) =>
  geometry &&
  [
    geometry.neckAnchor.x,
    geometry.neckAnchor.y,
    geometry.center.x,
    geometry.center.y,
    geometry.pendant.x,
    geometry.pendant.y,
    geometry.width,
    geometry.height,
    geometry.rotation,
    geometry.opacity,
    geometry.scale,
    geometry.xCompression,
  ].every(Number.isFinite);

// Pose has no neck/chin landmark. Infer a clavicle-height anchor from the head-to-
// shoulder interval in the torso's rotated coordinate frame, using the SAME pose result.
function estimateNeckAnchor(
  landmarks,
  width,
  height,
  mirrored,
  shoulderMidpoint,
  shoulderWidth,
  across,
  down,
) {
  const local = (point) => {
    const dx = point.x - shoulderMidpoint.x,
      dy = point.y - shoulderMidpoint.y;
    return { x: dx * across.x + dy * across.y, y: dx * down.x + dy * down.y };
  };
  const headPoint = (id, minHeight, maxHeight) => {
    const raw = landmarks[id];
    if (!validLandmark(raw)) return null;
    const point = local(poseToCanvas(raw, width, height, mirrored));
    const depth = -point.y / shoulderWidth;
    if (depth < minHeight || depth > maxHeight || Math.abs(point.x) > shoulderWidth * 0.6)
      return null;
    return { ...point, confidence: clamp(landmarkConfidence(raw), 0, 1) };
  };
  const nose = headPoint(necklacePoseLandmarks.NOSE, 0.16, 1.5);
  const leftMouth = headPoint(necklacePoseLandmarks.LEFT_MOUTH, 0.06, 1.3);
  const rightMouth = headPoint(necklacePoseLandmarks.RIGHT_MOUTH, 0.06, 1.3);
  const observations = [];
  if (nose) observations.push({ ...nose, y: nose.y * 0.22, weight: 0.35, source: 'nose' });
  if (leftMouth && rightMouth) {
    const span = distance(leftMouth, rightMouth);
    const mouth = midpoint(leftMouth, rightMouth);
    const noseGap = nose ? mouth.y - nose.y : 0;
    if (
      span >= shoulderWidth * 0.01 &&
      span <= shoulderWidth * 0.5 &&
      (!nose ||
        (noseGap >= 0 &&
          noseGap <= shoulderWidth * 0.4 &&
          Math.abs(mouth.x - nose.x) < shoulderWidth * 0.35))
    ) {
      observations.push({
        ...mouth,
        y: mouth.y * 0.35,
        confidence: Math.min(leftMouth.confidence, rightMouth.confidence),
        weight: 0.65,
        source: 'mouth',
      });
    }
  }
  const fallbackY = shoulderWidth * necklaceFit.fallbackNeckRatio;
  let neckX = 0,
    neckY = fallbackY,
    headWeight = 0;
  if (observations.length) {
    const total = observations.reduce((sum, p) => sum + p.weight * p.confidence, 0);
    const confidence = total / observations.reduce((sum, p) => sum + p.weight, 0);
    headWeight =
      necklaceFit.headFusionMax * clamp((confidence - necklaceFit.confidence) / 0.35, 0, 1);
    const headX = observations.reduce((sum, p) => sum + p.x * p.weight * p.confidence, 0) / total;
    const headY = observations.reduce((sum, p) => sum + p.y * p.weight * p.confidence, 0) / total;
    // Head motion lightly influences lateral placement; shoulders still control the torso.
    neckX = clamp(headX * 0.18, -shoulderWidth * 0.06, shoulderWidth * 0.06) * headWeight;
    neckY += (clamp(headY, -shoulderWidth * 0.3, -shoulderWidth * 0.04) - fallbackY) * headWeight;
  }
  return {
    neckAnchor: {
      x: shoulderMidpoint.x + across.x * neckX + down.x * neckY,
      y: shoulderMidpoint.y + across.y * neckX + down.y * neckY,
    },
    anchorMode: headWeight > 0 ? 'pose-head' : 'shoulders',
    headWeight,
    headSources: headWeight > 0 ? observations.map((p) => p.source) : [],
  };
}

export function measureNecklace(
  result,
  width,
  height,
  mirrored = false,
  calibration = necklaceStyles.SHORT,
) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return null;
  const landmarks = result?.landmarks;
  if (!landmarks) return null;
  const leftRaw = landmarks[necklacePoseLandmarks.LEFT_SHOULDER];
  const rightRaw = landmarks[necklacePoseLandmarks.RIGHT_SHOULDER];
  if (!validLandmark(leftRaw) || !validLandmark(rightRaw)) return null;

  const shoulders = [
    poseToCanvas(leftRaw, width, height, mirrored),
    poseToCanvas(rightRaw, width, height, mirrored),
  ].sort((a, b) => a.x - b.x);
  const [leftShoulder, rightShoulder] = shoulders;
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  if (!Number.isFinite(shoulderWidth) || shoulderWidth < necklaceFit.minShoulderWidth) return null;

  const shoulderMidpoint = midpoint(leftShoulder, rightShoulder);
  const rotation = clamp(
    Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x),
    -necklaceFit.maxRoll,
    necklaceFit.maxRoll,
  );
  const across = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const down = { x: -across.y, y: across.x };
  const neck = estimateNeckAnchor(
    landmarks,
    width,
    height,
    mirrored,
    shoulderMidpoint,
    shoulderWidth,
    across,
    down,
  );
  const center = {
    x: neck.neckAnchor.x + down.x * shoulderWidth * calibration.dropRatio,
    y: neck.neckAnchor.y + down.y * shoulderWidth * calibration.dropRatio,
  };
  const pendant = {
    x: center.x + down.x * shoulderWidth * calibration.pendantDropRatio,
    y: center.y + down.y * shoulderWidth * calibration.pendantDropRatio,
  };
  const yaw =
    leftShoulder.z !== null && rightShoulder.z !== null
      ? clamp((rightShoulder.z - leftShoulder.z) * 180, -35, 35)
      : 0;
  const xCompression = clamp(1 - Math.abs(yaw) * necklaceFit.xCompressionPerYaw, 0.93, 1);
  const geometry = {
    leftShoulder,
    rightShoulder,
    shoulderMidpoint,
    shoulderWidth,
    ...neck,
    calibrationStyle: calibration.style,
    center,
    pendant,
    rotation,
    yaw,
    xCompression,
    width: shoulderWidth * calibration.widthRatio,
    height: shoulderWidth * calibration.heightRatio,
    scale: shoulderWidth / 260,
    opacity: 1,
  };
  return finiteGeometry(geometry) ? geometry : null;
}

const alpha = (dt, ms) => 1 - Math.exp(-Math.max(0, dt) / ms);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpPoint = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const smoothAngle = (from, to, t) => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
};

export function smoothNecklace(previous, next, dt) {
  if (!previous) return next;
  const pointT = alpha(dt, 85);
  const neckT = alpha(dt, necklaceFit.neckSmoothingMs);
  const sizeT = alpha(dt, 110);
  const rollT = alpha(dt, 120);
  return {
    ...next,
    leftShoulder: lerpPoint(previous.leftShoulder, next.leftShoulder, pointT),
    rightShoulder: lerpPoint(previous.rightShoulder, next.rightShoulder, pointT),
    shoulderMidpoint: lerpPoint(previous.shoulderMidpoint, next.shoulderMidpoint, pointT),
    neckAnchor: lerpPoint(previous.neckAnchor, next.neckAnchor, neckT),
    center: lerpPoint(previous.center, next.center, neckT),
    pendant: lerpPoint(previous.pendant, next.pendant, neckT),
    shoulderWidth: lerp(previous.shoulderWidth, next.shoulderWidth, sizeT),
    width: lerp(previous.width, next.width, sizeT),
    height: lerp(previous.height, next.height, sizeT),
    scale: lerp(previous.scale, next.scale, sizeT),
    rotation: smoothAngle(previous.rotation, next.rotation, rollT),
    yaw: lerp(previous.yaw, next.yaw, rollT),
    xCompression: lerp(previous.xCompression, next.xCompression, rollT),
  };
}

export function updateNecklaceTracking(previous, measured, now, live = true) {
  if (!measured) {
    return previous?.geometry
      ? { ...previous, sampledAt: now, tracking: 'Lost' }
      : { geometry: null, sampledAt: now, goodAt: 0, tracking: 'Lost' };
  }
  const stale = !previous?.geometry || now - previous.goodAt > 700;
  const geometry =
    live && !stale
      ? smoothNecklace(previous.geometry, measured, now - previous.sampledAt)
      : measured;
  return {
    geometry,
    sampledAt: now,
    goodAt: now,
    tracking: 'Active',
  };
}

export function necklaceVisibility(track, now) {
  if (!track?.geometry || !Number.isFinite(track.goodAt)) return 0;
  return clamp(1 - (now - track.goodAt - 260) / 450, 0, 1);
}
