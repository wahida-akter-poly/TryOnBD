// Verified against the official PoseLandmark enum and installed 0.10.32
// PoseLandmarker.POSE_CONNECTIONS: 11→13, 12→14, 11→23, 12→24.
// https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/pose.py
export const shirtPoseLandmarks = Object.freeze({
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
});
export const shirtTrackingConfig = Object.freeze({
  confidence: 0.55,
  pointMs: 70,
  sizeMs: 95,
  rollMs: 90,
  yawMs: 140,
  quadMs: 65,
  holdMs: 250,
  fadeMs: 450,
  jumpFraction: 0.45,
  jumpAcceptMs: 350,
});
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const confidence = (p) => Math.min(p?.visibility ?? 1, p?.presence ?? 1);
export function containImageRect(imageWidth, imageHeight, canvasWidth, canvasHeight) {
  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const width = imageWidth * scale,
    height = imageHeight * scale;
  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
  };
}
export function mapPoseResultToContainedImage(result, rect, dimensions) {
  if (!result) return result;
  const landmarks = result.landmarks?.map((point) =>
    point
      ? {
          ...point,
          x: (rect.x + point.x * rect.width) / dimensions.width,
          y: (rect.y + point.y * rect.height) / dimensions.height,
        }
      : point,
  );
  const segmentation = result.segmentation
    ? {
        ...result.segmentation,
        roi: {
          x:
            rect.x / dimensions.width +
            (result.segmentation.roi?.x || 0) * (rect.width / dimensions.width),
          y:
            rect.y / dimensions.height +
            (result.segmentation.roi?.y || 0) * (rect.height / dimensions.height),
          width: (result.segmentation.roi?.width ?? 1) * (rect.width / dimensions.width),
          height: (result.segmentation.roi?.height ?? 1) * (rect.height / dimensions.height),
        },
      }
    : result.segmentation;
  return {
    ...result,
    ...(landmarks ? { landmarks } : {}),
    ...(segmentation ? { segmentation } : {}),
  };
}
const valid = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= -0.08 &&
  p.x <= 1.08 &&
  p.y >= -0.08 &&
  p.y <= 1.08 &&
  Number.isFinite(confidence(p)) &&
  confidence(p) >= shirtTrackingConfig.confidence;

// All fitting uses canvas backing pixels. CSS size/DPR never enter geometry;
// source aspect is preserved by the preview's intrinsic dimensions.
export function poseToCanvas(p, width, height, mirrored = false) {
  return {
    x: (mirrored ? 1 - p.x : p.x) * width,
    y: p.y * height,
    z: Number.isFinite(p.z) ? p.z : null,
    confidence: confidence(p),
  };
}

export function measureTorso(result, width, height, mirrored = false, options = {}) {
  let points = result?.landmarks;
  if (!points)
    return { error: 'No person detected. Stand back so your shoulders and hips are visible.' };
  if (![11, 12].every((i) => valid(points[i]))) return { error: 'Keep both shoulders in view.' };
  const fallback = ![23, 24].every((i) => valid(points[i]));
  if (fallback) {
    if (!options.allowShoulderFallback) return { error: 'Stand back so both hips are in view.' };
    const a = poseToCanvas(points[11], width, height, mirrored),
      b = poseToCanvas(points[12], width, height, mirrored);
    const span = distance(a, b),
      roll = Math.atan2(b.y - a.y, b.x - a.x);
    const down = { x: -Math.sin(roll) * Math.sign(b.x - a.x), y: Math.abs(Math.cos(roll)) };
    const ratio = clamp(
      options.previous?.torsoHeight / (options.previous?.shoulderWidth || 1) ||
        options.fit?.fallbackTorsoRatio ||
        1.3,
      1.05,
      1.55,
    );
    const hipRatio = clamp(
      options.previous?.hipWidth / (options.previous?.shoulderWidth || 1) || 0.78,
      0.65,
      1.0,
    );
    points = points.map((p) => (p ? { ...p } : p));
    for (const [sh, hip] of [
      [11, 23],
      [12, 24],
    ]) {
      const shoulder = points[sh],
        midX = (points[11].x + points[12].x) / 2;
      points[hip] = {
        x:
          midX +
          (shoulder.x - midX) * hipRatio +
          ((mirrored ? -1 : 1) * down.x * span * ratio) / width,
        y: shoulder.y + (down.y * span * ratio) / height,
        z: null,
        visibility: Math.min(confidence(points[11]), confidence(points[12])) * 0.8,
        presence: 1,
      };
    }
  }
  const sides = [
    [11, 23, 13, 15],
    [12, 24, 14, 16],
  ]
    .map(([shoulder, hip, elbow, wrist]) => ({
      shoulder: poseToCanvas(points[shoulder], width, height, mirrored),
      hip: poseToCanvas(points[hip], width, height, mirrored),
      elbow: valid(points[elbow]) ? poseToCanvas(points[elbow], width, height, mirrored) : null,
      wrist: valid(points[wrist]) ? poseToCanvas(points[wrist], width, height, mirrored) : null,
      ids: { shoulder, hip, elbow, wrist },
    }))
    .sort((a, b) => a.shoulder.x - b.shoulder.x);
  const [left, right] = sides;
  const shoulderMidpoint = midpoint(left.shoulder, right.shoulder);
  const hipMidpoint = midpoint(left.hip, right.hip);
  const shoulderWidth = distance(left.shoulder, right.shoulder);
  const hipWidth = distance(left.hip, right.hip);
  const torsoHeight = distance(shoulderMidpoint, hipMidpoint);
  if (
    shoulderWidth < 25 ||
    hipWidth < 15 ||
    hipWidth / shoulderWidth < 0.4 ||
    hipWidth / shoulderWidth > 1.8 ||
    torsoHeight < 35 ||
    torsoHeight / shoulderWidth < 0.55 ||
    torsoHeight / shoulderWidth > 3.5 ||
    left.hip.x >= right.hip.x ||
    hipMidpoint.y <= shoulderMidpoint.y
  )
    return { error: 'Face the camera with your shoulders and hips visible.' };
  // World depth is in metres. Fall back to image-normalized z, scaled by image
  // width as specified by MediaPipe; never mix world metres and canvas pixels.
  const world = result.worldLandmarks;
  const depthAngle = (part) => {
    const l = world?.[left.ids[part]],
      r = world?.[right.ids[part]];
    if (l && r && [l.x, l.y, l.z, r.x, r.y, r.z].every(Number.isFinite)) {
      const span = distance(l, r);
      if (span > 0.05 && span < 1.5) return Math.atan2(r.z - l.z, span);
    }
    const lp = left[part],
      rp = right[part];
    return lp.z !== null && rp.z !== null ? Math.atan2((rp.z - lp.z) * width, distance(lp, rp)) : 0;
  };
  const yaw = clamp(
    ((depthAngle('shoulder') * (fallback ? 1 : 0.75) + (fallback ? 0 : depthAngle('hip') * 0.25)) *
      180) /
      Math.PI,
    -35,
    35,
  );
  return {
    left,
    right,
    shoulderMidpoint,
    hipMidpoint,
    shoulderWidth,
    hipWidth,
    torsoHeight,
    roll: Math.atan2(right.shoulder.y - left.shoulder.y, right.shoulder.x - left.shoulder.x),
    yaw,
    trackingMode: fallback ? 'SHOULDERS_ONLY' : 'FULL_BODY',
    confidence: Math.min(
      left.shoulder.confidence,
      right.shoulder.confidence,
      left.hip.confidence,
      right.hip.confidence,
    ),
  };
}

export function torsoQuad(body, fit) {
  const mid = body.shoulderMidpoint,
    hip = body.hipMidpoint;
  const across = { x: Math.cos(body.roll), y: Math.sin(body.roll) };
  const down = { x: -across.y, y: across.x };
  const collar = {
    x:
      mid.x +
      across.x * body.shoulderWidth * fit.collarOffsetX +
      down.x * body.torsoHeight * fit.collarOffsetY,
    y:
      mid.y +
      across.y * body.shoulderWidth * fit.collarOffsetX +
      down.y * body.torsoHeight * fit.collarOffsetY,
  };
  const topCenter = {
    x: mid.x - down.x * body.shoulderWidth * 0.02,
    y: mid.y - down.y * body.shoulderWidth * 0.02,
  };
  const hemCenter = {
    x: hip.x + down.x * body.torsoHeight * (fit.heightMultiplier - 1 + fit.hemOffset),
    y: hip.y + down.y * body.torsoHeight * (fit.heightMultiplier - 1 + fit.hemOffset),
  };
  const turnT = clamp((Math.abs(body.yaw) - 3) / 9, 0, 1);
  const turn =
    Math.sin((clamp(body.yaw, -fit.maxYaw, fit.maxYaw) * Math.PI) / 180) *
    fit.perspectiveStrength *
    turnT *
    turnT *
    (3 - 2 * turnT);
  const topWidth = body.shoulderWidth * fit.widthMultiplier * (1 + 2 * fit.shoulderPadding);
  const bottomWidth = body.hipWidth * fit.widthMultiplier * (1 + 2 * fit.hipPadding);
  const edge = (center, width, side) => ({
    x: center.x + across.x * side * width * 0.5 * (1 - side * turn),
    y: center.y + across.y * side * width * 0.5 * (1 - side * turn),
  });
  return {
    ...body,
    collar,
    topCenter,
    hemCenter,
    quad: [
      edge(topCenter, topWidth, -1),
      edge(topCenter, topWidth, 1),
      edge(hemCenter, bottomWidth, 1),
      edge(hemCenter, bottomWidth, -1),
    ],
    state: Math.abs(body.yaw) <= 3 ? 'FRONTAL' : body.yaw > 0 ? 'TURNING_RIGHT' : 'TURNING_LEFT',
  };
}

const alpha = (dt, ms) => 1 - Math.exp(-Math.max(0, dt) / ms);
const lerpPoint = (a, b, t) => ({ ...b, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function smoothTorso(previous, next, dt) {
  if (!previous) return next;
  const result = { ...next };
  for (const side of ['left', 'right']) {
    result[side] = { ...next[side] };
    for (const part of ['shoulder', 'hip', 'elbow', 'wrist'])
      if (next[side][part] && previous[side][part])
        result[side][part] = lerpPoint(
          previous[side][part],
          next[side][part],
          alpha(dt, shirtTrackingConfig.pointMs),
        );
  }
  result.shoulderMidpoint = midpoint(result.left.shoulder, result.right.shoulder);
  result.hipMidpoint = midpoint(result.left.hip, result.right.hip);
  for (const key of ['shoulderWidth', 'hipWidth', 'torsoHeight'])
    result[key] =
      previous[key] + (next[key] - previous[key]) * alpha(dt, shirtTrackingConfig.sizeMs);
  const delta = Math.atan2(
    Math.sin(next.roll - previous.roll),
    Math.cos(next.roll - previous.roll),
  );
  result.roll = previous.roll + delta * alpha(dt, shirtTrackingConfig.rollMs);
  result.yaw = previous.yaw + (next.yaw - previous.yaw) * alpha(dt, shirtTrackingConfig.yawMs);
  return result;
}

// One small state machine, updated at inference completion, not React frames.
export function updateShirtTracking(previous, measured, fit, now, live = true) {
  const dt = previous ? now - previous.sampledAt : 0;
  let accepted = measured && !measured.error;
  if (
    live &&
    accepted &&
    measured.trackingMode === 'SHOULDERS_ONLY' &&
    previous?.geometry &&
    now - (previous.fullBodyAt ?? previous.goodAt) < shirtTrackingConfig.holdMs
  )
    return { ...previous, sampledAt: now, goodAt: now, error: '' };
  let jumpAt = null;
  if (accepted && previous?.body && live) {
    const movement = Math.max(
      ...['left', 'right'].flatMap((side) =>
        ['shoulder', 'hip'].map((part) =>
          distance(measured[side][part], previous.body[side][part]),
        ),
      ),
    );
    const limit =
      previous.body.shoulderWidth * (shirtTrackingConfig.jumpFraction + Math.min(dt, 300) / 500);
    if (movement > limit) {
      jumpAt = previous.jumpAt ?? now;
      if (now - jumpAt < shirtTrackingConfig.jumpAcceptMs) accepted = false;
    }
  }
  if (!accepted)
    return {
      ...previous,
      sampledAt: now,
      jumpAt,
      error: measured?.error || 'Hold still while your fit settles.',
    };
  // After a loss/sustained relocation reacquire directly rather than leaving
  // the garment stranded between unrelated poses.
  const stale =
    !previous ||
    now - previous.goodAt > shirtTrackingConfig.holdMs + shirtTrackingConfig.fadeMs ||
    jumpAt !== null;
  const body = live && !stale ? smoothTorso(previous.body, measured, dt) : measured;
  const next = torsoQuad(body, fit);
  if (live && !stale && previous.geometry) {
    next.quad = next.quad.map((p, i) =>
      lerpPoint(previous.geometry.quad[i], p, alpha(dt, shirtTrackingConfig.quadMs)),
    );
    next.collar = lerpPoint(
      previous.geometry.collar,
      next.collar,
      alpha(dt, shirtTrackingConfig.quadMs),
    );
  }
  return {
    body,
    geometry: next,
    goodAt: now,
    fullBodyAt: body.trackingMode === 'SHOULDERS_ONLY' ? previous?.fullBodyAt : now,
    sampledAt: now,
    jumpAt: null,
    error: '',
  };
}

export function shirtVisibility(track, now) {
  return track?.geometry
    ? clamp(
        1 - (now - track.goodAt - shirtTrackingConfig.holdMs) / shirtTrackingConfig.fadeMs,
        0,
        1,
      )
    : 0;
}
