// Weak-perspective MediaPipe mesh converted back into the rigid head axes.
// Aggregate six lateral oval vertices: no single ear/endpoint landmark or detector.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function unrotateFacePoint(p, yawDegrees = 0, pitchDegrees = 0) {
  const yaw = (yawDegrees * Math.PI) / 180,
    pitch = (pitchDegrees * Math.PI) / 180;
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const x = cy * p.x + sy * p.z,
    z = -sy * p.x + cy * p.z;
  return { x, y: cp * p.y + sp * z, z: -sp * p.y + cp * z };
}
export function estimateHeadShape(surface, yaw = 0, pitch = 0) {
  if (!surface || surface.length < 468) return null;
  const scale = Math.max(0.55, Math.cos((yaw * Math.PI) / 180));
  const points = [127, 234, 93, 356, 454, 323].map((id) => surface[id]);
  if (points.some((p) => !p || ![p.x, p.y, p.z].every(Number.isFinite))) return null;
  const local = points.map((p) =>
    unrotateFacePoint({ x: p.x * scale, y: p.y * scale, z: p.z * scale }, yaw, pitch),
  );
  const radii = local.map((p) => Math.abs(p.x)).sort((a, b) => a - b);
  const depths = local.map((p) => p.z).sort((a, b) => a - b);
  return {
    radius: clamp((radii[3] + radii[4]) / 2, 0.42, 0.58),
    sideDepth: clamp((depths[2] + depths[3]) / 2, 0.12, 0.42),
  };
}

// The measured mesh and glasses must use the SAME filtered orientation. Filtering
// only the root while retaining a raw camera-space mesh lets the mask overtake
// the hinges on a turn. Remove measured rigid motion before filtering face shape.
export function alignFaceSurface(previous, measured, filtered, elapsedMs) {
  if (!measured.bridgeLocked || !measured.faceSurface?.length) return filtered;
  const yaw = measured.rawYawDegrees ?? 0,
    pitch = measured.pitchDegrees ?? 0;
  const scale = Math.max(0.55, Math.cos((yaw * Math.PI) / 180));
  const local = measured.faceSurface.map((p) =>
    unrotateFacePoint(
      {
        x: p.x * scale,
        y: p.y * scale,
        z: p.z * scale,
      },
      yaw,
      pitch,
    ),
  );
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 80);
  const shape = local.map((p, i) => {
    const old = previous?.headLocalSurface?.[i];
    return old
      ? Object.fromEntries(['x', 'y', 'z'].map((k) => [k, old[k] + alpha * (p[k] - old[k])]))
      : p;
  });
  const y = ((filtered.rawYawDegrees ?? 0) * Math.PI) / 180;
  const t = ((filtered.pitchDegrees ?? 0) * Math.PI) / 180;
  const cos = Math.max(0.55, Math.cos(y));
  const surface = shape.map((p) => {
    const py = Math.cos(t) * p.y - Math.sin(t) * p.z;
    const pz = Math.sin(t) * p.y + Math.cos(t) * p.z;
    return {
      x: (Math.cos(y) * p.x - Math.sin(y) * pz) / cos,
      y: py / cos,
      z: (Math.sin(y) * p.x + Math.cos(y) * pz) / cos,
    };
  });
  return { ...filtered, headLocalSurface: shape, faceSurface: surface };
}
