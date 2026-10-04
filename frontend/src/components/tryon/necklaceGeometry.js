import { clamp, poseToCanvas } from './shirtGeometry.js';

export const necklacePoseLandmarks = Object.freeze({
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
});

export const necklaceFit = Object.freeze({
  widthRatio: 0.72,
  neckDropRatio: 0.36,
  pendantDropRatio: 0.23,
  maxRoll: Math.PI / 5,
  minShoulderWidth: 48,
  confidence: 0.55,
  xCompressionPerYaw: 0.002,
});

const landmarkConfidence = (p) => Math.min(p?.visibility ?? 1, p?.presence ?? 1);
const validShoulder = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= -0.08 &&
  p.x <= 1.08 &&
  p.y >= -0.08 &&
  p.y <= 1.08 &&
  landmarkConfidence(p) >= necklaceFit.confidence;
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const finiteGeometry = (geometry) =>
  geometry &&
  [
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

export function measureNecklace(result, width, height, mirrored = false) {
  const landmarks = result?.landmarks;
  if (!landmarks) return null;
  const leftRaw = landmarks[necklacePoseLandmarks.LEFT_SHOULDER];
  const rightRaw = landmarks[necklacePoseLandmarks.RIGHT_SHOULDER];
  if (!validShoulder(leftRaw) || !validShoulder(rightRaw)) return null;

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
  const center = {
    x: shoulderMidpoint.x + down.x * shoulderWidth * necklaceFit.neckDropRatio,
    y: shoulderMidpoint.y + down.y * shoulderWidth * necklaceFit.neckDropRatio,
  };
  const pendant = {
    x: center.x + down.x * shoulderWidth * necklaceFit.pendantDropRatio,
    y: center.y + down.y * shoulderWidth * necklaceFit.pendantDropRatio,
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
    center,
    pendant,
    rotation,
    yaw,
    xCompression,
    width: shoulderWidth * necklaceFit.widthRatio,
    height: shoulderWidth * 0.54,
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
  const sizeT = alpha(dt, 110);
  const rollT = alpha(dt, 120);
  return {
    ...next,
    leftShoulder: lerpPoint(previous.leftShoulder, next.leftShoulder, pointT),
    rightShoulder: lerpPoint(previous.rightShoulder, next.rightShoulder, pointT),
    shoulderMidpoint: lerpPoint(previous.shoulderMidpoint, next.shoulderMidpoint, pointT),
    center: lerpPoint(previous.center, next.center, pointT),
    pendant: lerpPoint(previous.pendant, next.pendant, pointT),
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
    live && !stale ? smoothNecklace(previous.geometry, measured, now - previous.sampledAt) : measured;
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
