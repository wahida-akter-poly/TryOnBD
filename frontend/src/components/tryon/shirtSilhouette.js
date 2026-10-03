import { clamp } from './shirtGeometry.js';
import { structuredGarmentGeometry, mixPoint } from './structuredShirtGeometry.js';
import { shirtSilhouetteCalibration as defaults } from '../../data/shirtSilhouetteCalibration.js';

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const add = (p, axis, distance) => ({ x: p.x + axis.x * distance, y: p.y + axis.y * distance });

// Inverse of the existing poseToCanvas conversion. Masks and Pose share the
// same unmirrored input ROI; intrinsic backing pixels are the only units here.
export function maskConfidence(mask, point, dimensions, mirrored = false) {
  if (!mask?.pixels || mask.pixels.length !== mask.width * mask.height) return 0;
  const roi = mask.roi || { x: 0, y: 0, width: 1, height: 1 };
  const x =
    ((mirrored ? 1 - point.x / dimensions.width : point.x / dimensions.width) - roi.x) / roi.width;
  const y = (point.y / dimensions.height - roi.y) / roi.height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return 0;
  return mask.pixels[Math.floor(y * mask.height) * mask.width + Math.floor(x * mask.width)] / 255;
}

export function silhouetteArmCorridors(body, config = defaults) {
  const corridors = [];
  for (const side of ['left', 'right']) {
    const arm = body[side];
    if (!arm.elbow) continue;
    const upperLength = Math.hypot(arm.elbow.x - arm.shoulder.x, arm.elbow.y - arm.shoulder.y);
    corridors.push({
      side,
      part: 'upperArm',
      a: mixPoint(arm.shoulder, arm.elbow, 0.18),
      b: arm.elbow,
      ra: Math.min(body.shoulderWidth * config.upperArmRadiusRatio, upperLength * 0.24),
      rb: Math.min(body.shoulderWidth * config.forearmRadiusRatio, upperLength * 0.2),
    });
    if (arm.wrist) {
      const length = Math.hypot(arm.wrist.x - arm.elbow.x, arm.wrist.y - arm.elbow.y);
      corridors.push({
        side,
        part: 'forearm',
        a: arm.elbow,
        b: arm.wrist,
        ra: Math.min(body.shoulderWidth * config.forearmRadiusRatio, length * 0.2),
        rb: Math.min(body.shoulderWidth * config.forearmRadiusRatio * 0.7, length * 0.15),
      });
    }
  }
  return corridors;
}
export function inArmCorridor(point, corridors) {
  return corridors.some(({ a, b, ra, rb }) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = clamp(
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / Math.max(1, dx * dx + dy * dy),
      0,
      1,
    );
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) < ra + (rb - ra) * t;
  });
}

export function measureTorsoSilhouette(mask, body, fit, dimensions, mirrored = false) {
  if (!mask?.pixels || !body?.shoulderWidth) return null;
  const config = fit.silhouette || defaults,
    w = body.shoulderWidth;
  const pose = structuredGarmentGeometry({ ...body, silhouette: null }, fit);
  const rows = pose.torso.rows.map((r) => ({ ...r }));
  // One extra upper-chest sample, plus the existing chest/mid/waist/hem rows.
  rows.splice(1, 0, {
    t: 0.12,
    v: (rows[0].v + rows[1].v) / 2,
    center: mixPoint(rows[0].center, rows[1].center, 0.5),
    left: mixPoint(rows[0].left, rows[1].left, 0.5),
    right: mixPoint(rows[0].right, rows[1].right, 0.5),
  });
  const corridors = silhouetteArmCorridors(body, config),
    measured = [];
  for (const row of rows) {
    const center = row.t === 0 ? mixPoint(row.left, row.right, 0.5) : row.center;
    const angle = Math.atan2(row.right.y - row.left.y, row.right.x - row.left.x);
    const across = { x: Math.cos(angle), y: Math.sin(angle) },
      down = { x: -across.y, y: across.x };
    const limit = w * (row.t === 0 ? config.shoulderCorridorHalfRatio : config.corridorHalfRatio);
    const step = Math.max(
      1,
      Math.min(dimensions.width / mask.width, dimensions.height / mask.height),
    );
    const gap = Math.max(2, Math.ceil((w * config.gapRatio) / step));
    const scans = [];
    for (const band of [-1, -0.5, 0, 0.5, 1]) {
      const origin = add(center, down, band * w * config.scanBandRatio);
      const centerQuality = mean(
        [-0.08, 0, 0.08].map((n) =>
          maskConfidence(mask, add(origin, across, n * w), dimensions, mirrored),
        ),
      );
      if (centerQuality < config.minQuality) continue;
      const find = (sign) => {
        let end = 0,
          empty = 0,
          total = 0,
          sum = 0,
          armBoundary = false;
        let rawEmpty = 0,
          rawEdge = false;
        for (let d = 0; d <= limit; d += step) {
          if (
            maskConfidence(mask, add(origin, across, sign * d), dimensions, mirrored) <
            config.threshold
          )
            rawEmpty++;
          else rawEmpty = 0;
          if (rawEmpty >= gap) {
            rawEdge = true;
            break;
          }
        }
        if (!rawEdge) return null;
        for (let distance = 0; distance <= limit; distance += step) {
          const p = add(origin, across, sign * distance);
          const confidence = maskConfidence(mask, p, dimensions, mirrored);
          const arm = inArmCorridor(p, corridors);
          // A crossed arm inside the torso is an occluder, not a torso edge.
          // Outside the protected central skeleton corridor it stops expansion.
          const excluded = arm && distance > w * config.protectedCoreRatio;
          if (confidence >= config.threshold && !excluded) {
            end = distance;
            empty = 0;
            sum += confidence;
            total++;
          } else if (++empty >= gap) {
            armBoundary = excluded;
            return { distance: end, confidence: total ? sum / total : 0, armBoundary };
          }
        }
        // No observed edge inside the corridor: don't call the search limit a
        // measured body boundary (raised arms / cropped image / huge noise).
        return null;
      };
      const left = find(-1),
        right = find(1);
      if (!left || !right) continue;
      const width = left.distance + right.distance;
      if (
        left.distance < w * 0.17 ||
        right.distance < w * 0.17 ||
        width < w * config.minWidthRatio ||
        width > w * config.maxWidthRatio
      )
        continue;
      scans.push({
        left: left.distance / w,
        right: right.distance / w,
        quality: Math.min(centerQuality, left.confidence, right.confidence),
        leftCensored: left.armBoundary,
        rightCensored: right.armBoundary,
      });
    }
    let sample = null;
    if (scans.length >= 3) {
      const l = median(scans.map((p) => p.left)),
        r = median(scans.map((p) => p.right));
      const spread = Math.max(
        ...scans.map((p) => Math.max(Math.abs(p.left - l), Math.abs(p.right - r))),
      );
      const quality = mean(scans.map((p) => p.quality)) * clamp(1 - spread * 2, 0, 1);
      if (quality >= config.minQuality)
        sample = {
          leftRatio: l,
          rightRatio: r,
          quality,
          leftCensored: scans.filter((r) => r.leftCensored).length >= 3,
          rightCensored: scans.filter((r) => r.rightCensored).length >= 3,
        };
    }
    measured.push({
      t: row.t,
      v: row.v,
      sample,
      center,
      across,
      corridorLeft: add(center, across, -limit),
      corridorRight: add(center, across, limit),
      left: sample && add(center, across, -sample.leftRatio * w),
      right: sample && add(center, across, sample.rightRatio * w),
    });
  }
  // An arm-censored edge is a lower bound, not a raw person-mask extreme.
  // Fill it (and weak rows) from neighbouring uncensored silhouette samples,
  // never from a body-type preset. Do not extrapolate outside reliable rows.
  for (const side of ['left', 'right']) {
    const anchors = measured.filter((r) => r.sample && !r.sample[`${side}Censored`]);
    for (const row of measured) {
      if (row.sample && !row.sample[`${side}Censored`]) continue;
      const a = [...anchors].reverse().find((r) => r.t <= row.t),
        b = anchors.find((r) => r.t >= row.t);
      if (!a || !b || a === b) continue;
      const ratio =
        a.sample[`${side}Ratio`] +
        (b.sample[`${side}Ratio`] - a.sample[`${side}Ratio`]) * ((row.t - a.t) / (b.t - a.t));
      row.sample ||= { quality: Math.min(a.sample.quality, b.sample.quality) * 0.9 };
      row.sample[`${side}Ratio`] = Math.max(row.sample[`${side}Ratio`] || 0, ratio);
      row.sample.inferred = true;
    }
  }
  for (const row of measured) {
    if (
      !row.sample ||
      row.sample.quality < config.minQuality ||
      !Number.isFinite(row.sample.leftRatio) ||
      !Number.isFinite(row.sample.rightRatio)
    ) {
      row.sample = null;
      row.left = row.right = null;
      continue;
    }
    row.left = add(row.center, row.across, -row.sample.leftRatio * w);
    row.right = add(row.center, row.across, row.sample.rightRatio * w);
  }
  const valid = measured.filter((r) => r.sample);
  return {
    rows: measured,
    quality: valid.length ? mean(valid.map((r) => r.sample.quality)) : 0,
    validRows: valid.length,
    corridors,
  };
}

// Boundaries are stored as shoulder-normalized offsets, so body translation
// and distance changes follow the accepted Pose immediately instead of lagging.
export function updateSilhouetteTracking(
  previous,
  measurement,
  now,
  live = true,
  config = defaults,
) {
  const old = previous?.rows || [],
    dt = Math.min(250, Math.max(0, now - (previous?.sampledAt ?? now)));
  const a = live ? 1 - Math.exp(-dt / config.smoothMs) : 1;
  const rows = (measurement?.rows || old).map((row, index) => {
    const before = old[index],
      incoming = measurement?.rows?.[index]?.sample;
    if (!incoming)
      return before ? { ...before, sampledAt: now } : { t: row.t, v: row.v, sampledAt: now };
    const change = before?.sample
      ? Math.max(
          Math.abs(incoming.leftRatio - before.sample.leftRatio),
          Math.abs(incoming.rightRatio - before.sample.rightRatio),
        )
      : 0;
    const pending = change > config.jumpRatio && live && before?.sample;
    const similar =
      before?.candidate &&
      Math.abs(before.candidate.leftRatio - incoming.leftRatio) < 0.08 &&
      Math.abs(before.candidate.rightRatio - incoming.rightRatio) < 0.08;
    const jumpAt = pending ? (similar ? before.jumpAt : now) : null;
    if (pending && now - jumpAt < config.jumpAcceptMs)
      return { ...before, sampledAt: now, jumpAt, candidate: incoming };
    const stale = !before?.sample || now - before.goodAt > config.holdMs + config.fadeMs;
    const blend = stale || !live ? 1 : a;
    const sample = {
      ...incoming,
      leftRatio: before?.sample
        ? before.sample.leftRatio + (incoming.leftRatio - before.sample.leftRatio) * blend
        : incoming.leftRatio,
      rightRatio: before?.sample
        ? before.sample.rightRatio + (incoming.rightRatio - before.sample.rightRatio) * blend
        : incoming.rightRatio,
    };
    return { t: row.t, v: row.v, sample, goodAt: now, sampledAt: now, jumpAt: null };
  });
  return { rows, sampledAt: now, diagnostics: measurement || previous?.diagnostics };
}
export function silhouetteSnapshot(state, now, config = defaults) {
  if (!state) return null;
  const rows = state.rows.map((r) => ({
    ...r,
    weight: r.sample ? clamp(1 - (now - r.goodAt - config.holdMs) / config.fadeMs, 0, 1) : 0,
  }));
  const valid = rows.filter((r) => r.weight > 0);
  if (!valid.length) return null;
  return {
    rows,
    quality: mean(valid.map((r) => r.sample.quality)),
    diagnostics: state.diagnostics,
  };
}
