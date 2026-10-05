// MediaPipe 0.10.32 returns the packed FaceGeometry MatrixData unchanged.
// MatrixData defaults to column-major; the canonical-to-runtime transform is
// right-handed, with uniform scale, rotation and translation. References:
// https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix_data.proto
// https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts
export const headPoseConfig = Object.freeze({
  deadZoneDegrees: 3,
  fullTurnDegrees: 75,
  invalidHoldMs: 180,
  maxJumpDegrees: 18,
  maxSpeedDegreesPerSecond: 240,
});

export function matrixOrientation(matrix) {
  if (matrix?.rows !== 4 || matrix?.columns !== 4 || matrix.data?.length !== 16) return null;
  const m = matrix.data;
  if (!Array.from(m).every(Number.isFinite)) return null;
  if (Math.abs(m[3]) + Math.abs(m[7]) + Math.abs(m[11]) > 0.001 || Math.abs(m[15] - 1) > 0.001)
    return null;
  const axes = [0, 4, 8].map((i) => [m[i], m[i + 1], m[i + 2]]);
  const lengths = axes.map((v) => Math.hypot(...v));
  if (lengths.some((v) => v < 1e-6 || Math.abs(v / lengths[0] - 1) > 0.05)) return null;
  const unit = axes.map((v, i) => v.map((n) => n / lengths[i]));
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  if (
    Math.abs(dot(unit[0], unit[1])) > 0.05 ||
    Math.abs(dot(unit[0], unit[2])) > 0.05 ||
    Math.abs(dot(unit[1], unit[2])) > 0.05
  )
    return null;
  const [x, y, z] = unit;
  const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  if (dot(cross, z) < 0.95) return null;
  // R = Rz(roll) Ry(yaw) Rx(pitch). Its first column is
  // [cos(roll)cos(yaw), sin(roll)cos(yaw), -sin(yaw)].
  // atan2 removes uniform scale and is independent of roll and pitch.
  return {
    yawDegrees: (Math.atan2(-x[2], Math.hypot(x[0], x[1])) * 180) / Math.PI,
    pitchDegrees: (Math.atan2(y[2], z[2]) * 180) / Math.PI,
    rollRadians: -Math.atan2(x[1], x[0]),
  };
}

export function matrixYawDegrees(matrix) {
  return matrixOrientation(matrix)?.yawDegrees ?? null;
}

export function normalizeYawDegrees(degrees) {
  if (!Number.isFinite(degrees)) return 0;
  const amount = Math.max(0, Math.abs(degrees) - headPoseConfig.deadZoneDegrees);
  return (
    Math.sign(degrees) *
    Math.min(1, amount / (headPoseConfig.fullTurnDegrees - headPoseConfig.deadZoneDegrees))
  );
}

// Conservative angular fallback from roll-aligned nose/face displacement.
// atan remains bounded and continuous even when the face span foreshortens;
// a large 2D fraction cannot immediately force full-scale orientation.
export function fallbackYawDegrees(raw) {
  return Number.isFinite(raw) ? (Math.atan(raw) * 180) / Math.PI : null;
}

export function resolveHeadPose(
  previous,
  matrix,
  fallbackRaw,
  mirrored,
  now,
  fallbackRollRadians = 0,
) {
  const orientation = matrixOrientation(matrix);
  const matrixDegrees = orientation?.yawDegrees ?? null;
  const candidate =
    matrixDegrees === null ? fallbackYawDegrees(fallbackRaw) : matrixDegrees * (mirrored ? -1 : 1);
  const source = matrixDegrees === null ? 'FALLBACK' : 'MATRIX';
  const valid = Number.isFinite(candidate);
  let degrees = valid ? candidate : 0;
  let held = false;
  let pitch = orientation?.pitchDegrees ?? 0;
  let roll = orientation ? orientation.rollRadians * (mirrored ? -1 : 1) : fallbackRollRadians;
  let pendingSince = null;
  const rollDelta = previous
    ? Math.atan2(
        Math.sin(roll - (previous.rollRadians ?? roll)),
        Math.cos(roll - (previous.rollRadians ?? roll)),
      )
    : 0;
  const jump = previous
    ? Math.max(
        Math.abs(candidate - previous.rawYawDegrees),
        Math.abs(pitch - (previous.pitchDegrees ?? pitch)),
        (Math.abs(rollDelta) * 180) / Math.PI,
      )
    : 0;
  let lastValidAt = valid ? now : (previous?.lastValidAt ?? -Infinity);
  const elapsed = previous ? Math.max(0, now - previous.sampledAt) : 0;
  if (
    previous &&
    (!valid ||
      jump >
        Math.max(
          headPoseConfig.maxJumpDegrees,
          (elapsed * headPoseConfig.maxSpeedDegreesPerSecond) / 1000,
        ))
  ) {
    pendingSince = previous.pendingSince ?? previous.lastValidAt;
    if (now - pendingSince <= headPoseConfig.invalidHoldMs) {
      degrees = previous.rawYawDegrees;
      lastValidAt = previous.lastValidAt;
      held = true;
      pitch = previous.pitchDegrees ?? pitch;
      roll = previous.rollRadians ?? roll;
    } else if (valid) {
      // A sustained new pose is accepted at a bounded angular velocity.
      const step = Math.max(1, (elapsed * headPoseConfig.maxSpeedDegreesPerSecond) / 1000);
      degrees =
        previous.rawYawDegrees +
        Math.sign(candidate - previous.rawYawDegrees) *
          Math.min(Math.abs(candidate - previous.rawYawDegrees), step);
      const pitchDelta = pitch - (previous.pitchDegrees ?? pitch);
      pitch =
        (previous.pitchDegrees ?? pitch) +
        Math.sign(pitchDelta) * Math.min(Math.abs(pitchDelta), step);
      roll =
        (previous.rollRadians ?? roll) +
        Math.sign(rollDelta) * Math.min(Math.abs(rollDelta), (step * Math.PI) / 180);
    }
  }
  return {
    rawYawDegrees: degrees,
    pitchDegrees: pitch,
    rollRadians: roll,
    pendingSince,
    yaw: normalizeYawDegrees(degrees),
    yawSource: held ? previous.yawSource : source,
    matrixYawDegrees: matrixDegrees,
    rawYaw: fallbackRaw,
    held,
    lastValidAt,
    sampledAt: now,
  };
}
