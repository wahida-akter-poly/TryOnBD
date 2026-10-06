import { matrixOrientation } from './headPose.js';

export const pdConfig = Object.freeze({ min: 45, max: 80, irisDiameterMm: 11.7, smoothingMs: 350 });
export const validPD = (value) => Number.isFinite(value) && value >= pdConfig.min && value <= pdConfig.max;

// Approximate metric reference, never a prescription measurement:
// https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/iris.md
export function measurePD(landmarks, width, height, matrix) {
  const orientation = matrixOrientation(matrix);
  if (!orientation || Math.abs(orientation.yawDegrees) > 20 || Math.abs(orientation.pitchDegrees) > 20 || landmarks?.length < 478 || !(width > 0 && height > 0)) return null;
  const point = (i) => {
    const p = landmarks[i];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 ? { x: p.x * width, y: p.y * height } : null;
  };
  const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN;
  const iris = [distance(point(469), point(471)), distance(point(474), point(476))];
  const pupilPixels = distance(point(468), point(473));
  const open = [[159, 145, 33, 133], [386, 374, 263, 362]].every(([top, bottom, outer, inner]) => distance(point(top), point(bottom)) / distance(point(outer), point(inner)) > 0.12);
  if (!open || iris.some((d) => !Number.isFinite(d) || d < 3) || Math.max(...iris) / Math.min(...iris) > 1.3 || !Number.isFinite(pupilPixels)) return null;
  const mm = pupilPixels / ((iris[0] + iris[1]) / 2) * pdConfig.irisDiameterMm;
  return validPD(mm) ? { rawMm: mm, pupilPixels } : null;
}

export function smoothPD(previous, measurement, now) {
  if (!measurement) return null;
  const elapsed = previous ? Math.max(0, Math.min(1000, now - previous.at)) : 0;
  const step = previous ? (measurement.rawMm - previous.mm) * (1 - Math.exp(-elapsed / pdConfig.smoothingMs)) : 0;
  const limit = elapsed * 0.006;
  return { ...measurement, mm: previous ? previous.mm + Math.max(-limit, Math.min(limit, step)) : measurement.rawMm, at: now };
}

// With no measured frame dimensions, keep fitProfile as the main scale signal.
// A bounded correction to pixels/mm assists the entire attached assembly.
export function pdScale(measurement, manualPD) {
  if (!measurement || !validPD(measurement.mm)) return 1;
  const target = validPD(manualPD) ? manualPD : measurement.mm;
  return Math.max(0.95, Math.min(1.05, 1 + 0.2 * (measurement.rawMm / target - 1)));
}
