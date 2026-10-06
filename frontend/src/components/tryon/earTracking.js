// Official PoseLandmark enum: LEFT_EAR=7, RIGHT_EAR=8. Anatomical left is
// screen-right in an unmirrored image; reflection swaps the display-side IDs.
export const poseEarIds = Object.freeze({ left: 7, right: 8 });
export const earConfig = Object.freeze({
  confidence: 0.65,
  holdMs: 350,
  maxAgeMs: 500,
  smoothingMs: 65,
  blendMs: 160,
});
const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function posePointToCanvas(point, width, height, mirrored) {
  return finite(point)
    ? { x: (mirrored ? 1 - point.x : point.x) * width, y: point.y * height }
    : null;
}
export function canvasToFace(point, face) {
  const dx = point.x - face.x,
    dy = point.y - face.y,
    c = Math.cos(face.angle),
    s = Math.sin(face.angle);
  return { x: (dx * c + dy * s) / face.width, y: (-dx * s + dy * c) / face.width };
}
export function faceToCanvas(point, face) {
  const c = Math.cos(face.angle),
    s = Math.sin(face.angle);
  return {
    x: face.x + face.width * (point.x * c - point.y * s),
    y: face.y + face.width * (point.x * s + point.y * c),
  };
}
export function updateEarTracking(previous, landmarks, face, width, height, mirrored, now) {
  return [-1, 1].map((side, i) => {
    const old = previous?.[i];
    const id = mirrored
      ? side < 0
        ? poseEarIds.left
        : poseEarIds.right
      : side < 0
        ? poseEarIds.right
        : poseEarIds.left;
    const p = landmarks?.[id],
      pixel = posePointToCanvas(p, width, height, mirrored);
    const raw = pixel ? canvasToFace(pixel, face) : null;
    const confidence = p ? Math.min(p.visibility ?? 0, p.presence ?? 1) : 0;
    const valid =
      Number.isFinite(confidence) &&
      finite(raw) &&
      p.x >= 0 &&
      p.x <= 1 &&
      p.y >= 0 &&
      p.y <= 1 &&
      side * raw.x >= 0.34 &&
      side * raw.x <= 1.2 &&
      raw.y >= -0.35 &&
      raw.y <= 0.55 &&
      (!old?.good || Math.hypot(raw.x - old.raw.x, raw.y - old.raw.y) <= 0.22);
    if (!valid || confidence < earConfig.confidence)
      return {
        ...old,
        side,
        landmarkId: id,
        confidence,
        observed: raw,
        status: old?.good && now - old.goodAt <= earConfig.holdMs ? 'EAR_WEAK' : 'EAR_LOST',
      };
    // Upper/front resting point, calibrated in roll-aligned face-width units.
    // Pose labels the ear attachment/concha, which can sit inside the front
    // frame's lateral projection. Calibrate toward the upper ear seat using
    // the adjacent measured temple contour, bounded to one small ear width.
    // Pose still supplies the moving ear position and its vertical endpoint;
    // matrix yaw never shifts a confidently tracked ear endpoint.
    const contour = face.headSideTargets?.[i];
    const correction = contour
      ? Math.min(0.18, Math.max(0, side * (contour.x - raw.x) + 0.015))
      : 0;
    const target = { x: raw.x - side * 0.012 + side * correction, y: raw.y - 0.035 };
    const alpha = old?.good
      ? 1 - Math.exp(-Math.max(0, now - old.sampledAt) / earConfig.smoothingMs)
      : 1;
    return {
      side,
      landmarkId: id,
      raw,
      observed: raw,
      confidence,
      good: old?.good ? mix(old.good, target, alpha) : target,
      goodAt: now,
      sampledAt: now,
      status: 'EAR_TRACKED',
    };
  });
}
export function fuseEarAnchors(previous, tracks, face, fallbackPaths, transform, now, elapsedMs) {
  return [-1, 1].map((side, i) => {
    const track = tracks?.[i],
      old = previous?.[i],
      path = fallbackPaths.find((p) => p.side === side);
    const fallback = canvasToFace(
      {
        x:
          transform.x +
          path.target.x * Math.cos(transform.angle) -
          path.target.y * Math.sin(transform.angle),
        y:
          transform.y +
          path.target.x * Math.sin(transform.angle) +
          path.target.y * Math.cos(transform.angle),
      },
      face,
    );
    const candidate = track?.good ? faceToCanvas(track.good, face) : null;
    const cx = candidate
      ? (candidate.x - transform.x) * Math.cos(transform.angle) +
        (candidate.y - transform.y) * Math.sin(transform.angle)
      : NaN;
    const usable = Number.isFinite(cx) && side * (cx - path.hingeX) >= transform.width * 0.015;
    const age = usable ? now - track.goodAt : Infinity;
    const held = age <= earConfig.holdMs;
    const source = held
      ? track.status === 'EAR_TRACKED' && age <= earConfig.maxAgeMs
        ? 'POSE'
        : 'HELD'
      : 'FALLBACK';
    const weight = held
      ? source === 'POSE'
        ? Math.max(0, Math.min(1, (track.confidence - earConfig.confidence) / 0.25))
        : 1
      : Math.max(0, 1 - (age - earConfig.holdMs) / earConfig.blendMs);
    const predicted =
      source === 'HELD' && old ? old : track?.good ? mix(fallback, track.good, weight) : fallback;
    const alpha =
      elapsedMs >= 500
        ? 1
        : 1 - Math.exp(-Math.max(0, elapsedMs) / (source === 'POSE' ? 45 : earConfig.blendMs));
    const target = old ? mix(old, predicted, alpha) : predicted;
    return {
      ...target,
      side,
      source,
      poseWeight: weight,
      status: held ? (source === 'POSE' ? 'EAR_TRACKED' : 'EAR_WEAK') : 'EAR_LOST',
      confidence: track?.confidence ?? 0,
      landmarkId: track?.landmarkId ?? null,
      raw: track?.observed ?? null,
    };
  });
}
