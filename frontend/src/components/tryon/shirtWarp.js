import { clamp } from './shirtGeometry.js';
import {
  structuredGarmentGeometry,
  torsoPanelPoint,
  sleevePatchPoint,
} from './structuredShirtGeometry.js';
import { armOcclusionMasks, paintArmMasks } from './shirtOcclusion.js';
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const mean = (a, b) => mix(a, b, 0.5);

// Source points are normalized inside measured visible alpha bounds, not the
// padded PNG canvas. Shoulder seams and hems determine body correspondence.
export function shirtBodyPoint(u, v, geometry, fit) {
  const s = fit.sourceLandmarks;
  const shoulderY = (s.leftShoulder.y + s.rightShoulder.y) / 2;
  const hemY = (s.bottomLeftHem.y + s.bottomRightHem.y) / 2;
  const t = (v - shoulderY) / (hemY - shoulderY);
  const leftU = s.leftShoulder.x + (s.bottomLeftHem.x - s.leftShoulder.x) * t;
  const rightU = s.rightShoulder.x + (s.bottomRightHem.x - s.rightShoulder.x) * t;
  const x = (u - leftU) / (rightU - leftU);
  const [tl, tr, br, bl] = geometry.quad;
  let p = mix(mix(tl, tr, x), mix(bl, br, x), t);
  const collarSource = mean(s.leftCollar, s.rightCollar);
  const collarT = (collarSource.y - shoulderY) / (hemY - shoulderY);
  const collarLeft = s.leftShoulder.x + (s.bottomLeftHem.x - s.leftShoulder.x) * collarT;
  const collarRight = s.rightShoulder.x + (s.bottomRightHem.x - s.rightShoulder.x) * collarT;
  const collarX = (collarSource.x - collarLeft) / (collarRight - collarLeft);
  const originalCollar = mix(mix(tl, tr, collarX), mix(bl, br, collarX), collarT);
  // A local collar correction vanishes at shoulder seams/hem, preserving body
  // anchors. Calibrated collar x is included rather than assuming image centre.
  const weight =
    clamp(
      1 - Math.abs(u - collarSource.x) / Math.max(0.01, (s.rightShoulder.x - s.leftShoulder.x) / 2),
      0,
      1,
    ) *
    clamp(
      1 - Math.abs(v - collarSource.y) / Math.max(0.01, shoulderY - collarSource.y + 0.1),
      0,
      1,
    );
  p = {
    x: p.x + (geometry.collar.x - originalCollar.x) * weight,
    y: p.y + (geometry.collar.y - originalCollar.y) * weight,
  };
  return p;
}

export function shirtMeshPoint(u, v, geometry, fit) {
  const point = shirtBodyPoint(u, v, geometry, fit),
    s = fit.sourceLandmarks;
  const side = u < s.leftShoulder.x ? 'left' : u > s.rightShoulder.x ? 'right' : null;
  if (!side || !geometry[side].elbow) return point;
  const seam = s[`${side}Shoulder`],
    end = s[`${side}SleeveEnd`];
  const pivot = shirtBodyPoint(seam.x, seam.y, geometry, fit);
  const staticEnd = shirtBodyPoint(end.x, end.y, geometry, fit);
  const arm = geometry[side],
    dx = arm.elbow.x - arm.shoulder.x,
    dy = arm.elbow.y - arm.shoulder.y;
  const armLength = Math.hypot(dx, dy);
  if (armLength < 10) return point;
  const naturalAngle = Math.atan2(staticEnd.y - pivot.y, staticEnd.x - pivot.x);
  const difference = Math.atan2(
    Math.sin(Math.atan2(dy, dx) - naturalAngle),
    Math.cos(Math.atan2(dy, dx) - naturalAngle),
  );
  const rotation = clamp(
    difference * fit.sleeveMultiplier,
    (-fit.maxSleeveRotation * Math.PI) / 180,
    (fit.maxSleeveRotation * Math.PI) / 180,
  );
  const naturalLength = Math.hypot(staticEnd.x - pivot.x, staticEnd.y - pivot.y);
  const desiredLength = clamp(
    armLength * fit.sleeveMultiplier,
    naturalLength * 0.85,
    naturalLength * 1.15,
  );
  const scale = desiredLength / Math.max(1, naturalLength);
  const outward = clamp((u - seam.x) / (end.x - seam.x), 0, 1);
  const region = clamp((end.y + 0.12 - v) / 0.12, 0, 1);
  const weight = outward * region;
  const x = point.x - pivot.x,
    y = point.y - pivot.y;
  const moved = {
    x: pivot.x + scale * (x * Math.cos(rotation) - y * Math.sin(rotation)),
    y: pivot.y + scale * (x * Math.sin(rotation) + y * Math.cos(rotation)),
  };
  return mix(point, moved, weight);
}

export function buildShirtMesh(geometry, fit) {
  const garment = structuredGarmentGeometry(geometry, fit),
    s = fit.sourceLandmarks;
  const unique = (values) => [...new Set(values)].sort((a, b) => a - b);
  const us = unique([
    ...Array.from(
      { length: (garment.silhouette ? fit.silhouette.meshColumns : fit.torsoColumns) + 1 },
      (_, i) => i / (garment.silhouette ? fit.silhouette.meshColumns : fit.torsoColumns),
    ),
    ...(garment.silhouette ? [fit.silhouette.logo.left, fit.silhouette.logo.right] : []),
    s.collarLeft.x,
    s.collarCenter.x,
    s.collarRight.x,
  ]);
  const vs = unique([
    ...(garment.silhouette
      ? [
          fit.silhouette.logo.top - 0.05,
          fit.silhouette.logo.top,
          fit.silhouette.logo.bottom,
          fit.silhouette.logo.bottom + 0.05,
        ]
      : []),
    ...Array.from({ length: fit.torsoRows + 1 }, (_, i) => i / fit.torsoRows),
    ...garment.torso.rows.map((r) => r.v),
    s.collarLeft.y,
    s.collarCenter.y,
    s.collarCenterTop.y,
    s.collarCenterBottom.y,
  ]);
  const torso = {
    us,
    vs,
    source: vs.map((v) => us.map((u) => ({ x: u, y: v }))),
    vertices: vs.map((v) => us.map((u) => torsoPanelPoint(u, v, garment, fit))),
  };
  const sleeve = (side) => {
    const us = [-0.08, 0, 0.33, 0.66, 1, 1.08],
      vs = [-0.04, 0, 0.25, 0.5, 0.75, 1, 1.04];
    return {
      us,
      vs,
      source: vs.map((v) => us.map((u) => sleevePatchPoint(u, v, garment, side, fit, true))),
      vertices: vs.map((v) => us.map((u) => sleevePatchPoint(u, v, garment, side, fit))),
    };
  };
  const leftSleeve = sleeve('left'),
    rightSleeve = sleeve('right');
  return {
    torso,
    leftSleeve,
    rightSleeve,
    garment,
    vertices: [...torso.vertices, ...leftSleeve.vertices, ...rightSleeve.vertices],
  };
}

// Same affine-triangle mathematics as the existing temple helper, isolated to
// avoid changing the protected eyewear implementation.
export function drawShirtTriangle(ctx, image, source, dest, maxAnisotropy = Infinity) {
  const [p0, p1, p2] = source,
    [q0, q1, q2] = dest;
  const det = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
  const area = (q1.x - q0.x) * (q2.y - q0.y) - (q2.x - q0.x) * (q1.y - q0.y);
  if (
    ![...source, ...dest].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
    Math.abs(det) < 1e-8 ||
    Math.abs(area) <= 0.01 ||
    area * det <= 0
  )
    return;
  const a = ((q1.x - q0.x) * (p2.y - p0.y) - (q2.x - q0.x) * (p1.y - p0.y)) / det;
  const c = ((q2.x - q0.x) * (p1.x - p0.x) - (q1.x - q0.x) * (p2.x - p0.x)) / det;
  const b = ((q1.y - q0.y) * (p2.y - p0.y) - (q2.y - q0.y) * (p1.y - p0.y)) / det;
  const d = ((q2.y - q0.y) * (p1.x - p0.x) - (q1.y - q0.y) * (p2.x - p0.x)) / det;
  const sum = a * a + b * b + c * c + d * d,
    product = (a * d - b * c) ** 2;
  const largest = (sum + Math.sqrt(Math.max(0, sum * sum - 4 * product))) / 2;
  if (largest / Math.sqrt(Math.max(1e-16, product)) > maxAnisotropy) return;
  ctx.save();
  // Outset each edge by 0.7 backing pixels to cover Canvas antialias seams,
  // including thin triangles around closely spaced source landmark knots.
  // The texture transform still uses the original shared mesh vertices.
  const outward = (a, b) => {
    const length = Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y));
    const sign = Math.sign(area);
    return { x: (sign * (b.y - a.y)) / length, y: (sign * (a.x - b.x)) / length };
  };
  const clip = dest.map((p, i) => {
    const previous = outward(dest[(i + 2) % 3], p),
      next = outward(p, dest[(i + 1) % 3]);
    const expansion = 0.7 / Math.max(0.01, 1 + previous.x * next.x + previous.y * next.y);
    return {
      x: p.x + (previous.x + next.x) * expansion,
      y: p.y + (previous.y + next.y) * expansion,
    };
  });
  ctx.beginPath();
  ctx.moveTo(clip[0].x, clip[0].y);
  ctx.lineTo(clip[1].x, clip[1].y);
  ctx.lineTo(clip[2].x, clip[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, q0.x - a * p0.x - c * p0.y, q0.y - b * p0.x - d * p0.y);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

const regionCache = new WeakMap(),
  layerCache = new WeakMap();
const canvas = (width, height) =>
  Object.assign(document.createElement('canvas'), { width, height });
export function regionImages(asset, fit) {
  const previous = regionCache.get(asset);
  if (
    previous?.regions === fit.sourceRegions &&
    previous?.cutouts === fit.sourceCutouts &&
    previous?.overlap === fit.seamOverlapRatio
  )
    return previous.parts;
  const parts = {};
  for (const [key, polygon] of Object.entries(fit.sourceRegions)) {
    const part = canvas(
        asset.image.naturalWidth || asset.image.width,
        asset.image.naturalHeight || asset.image.height,
      ),
      ctx = part.getContext('2d');
    const points = polygon.map((p) => ({
      x: asset.bounds.x + p.x * asset.bounds.width,
      y: asset.bounds.y + p.y * asset.bounds.height,
    }));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle = 'white';
    // Real source pixels only. Both regions extend half the overlap across the
    // shared seam, and the existing mesh overscan maps this narrow band.
    ctx.lineWidth =
      (fit.sourceLandmarks.rightShoulderSeam.x - fit.sourceLandmarks.leftShoulderSeam.x) *
      asset.bounds.width *
      fit.seamOverlapRatio;
    ctx.fill();
    ctx.stroke();
    if (key === 'torso')
      for (const polygon of Object.values(fit.sourceCutouts || {})) {
        const points = polygon.map((p) => ({
          x: asset.bounds.x + p.x * asset.bounds.width,
          y: asset.bounds.y + p.y * asset.bounds.height,
        }));
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
      }
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(asset.image, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    parts[key] = part;
  }
  regionCache.set(asset, {
    regions: fit.sourceRegions,
    cutouts: fit.sourceCutouts,
    overlap: fit.seamOverlapRatio,
    parts,
  });
  return parts;
}
export function drawRegion(ctx, image, mesh, bounds, fit) {
  for (let y = 0; y < mesh.vs.length - 1; y++)
    for (let x = 0; x < mesh.us.length - 1; x++) {
      const indices = [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
      ];
      const source = indices.map(([i, j]) => ({
        x: bounds.x + mesh.source[j][i].x * bounds.width,
        y: bounds.y + mesh.source[j][i].y * bounds.height,
      }));
      const dest = indices.map(([i, j]) => mesh.vertices[j][i]);
      for (const ids of [
        [0, 1, 2],
        [0, 2, 3],
      ])
        drawShirtTriangle(
          ctx,
          image,
          ids.map((i) => source[i]),
          ids.map((i) => dest[i]),
          fit.maxTriangleAnisotropy,
        );
    }
}
export function drawShirt(ctx, asset, geometry, fit, opacity = 1, originalFrame = null) {
  if (!asset || !geometry || opacity <= 0) return;
  const mesh = buildShirtMesh(geometry, fit),
    parts = regionImages(asset, fit);
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  let layers = layerCache.get(ctx);
  if (!layers || layers.garment.width !== w || layers.garment.height !== h) {
    layers = Object.fromEntries(
      ['garment', 'sleeves', 'mask', 'foreground'].map((key) => [key, canvas(w, h)]),
    );
    layerCache.set(ctx, layers);
  }
  const gc = layers.garment.getContext('2d'),
    sc = layers.sleeves.getContext('2d');
  gc.clearRect(0, 0, w, h);
  sc.clearRect(0, 0, w, h);
  gc.imageSmoothingEnabled = sc.imageSmoothingEnabled = true;
  gc.imageSmoothingQuality = sc.imageSmoothingQuality = 'high';
  drawRegion(gc, parts.torso, mesh.torso, asset.bounds, fit);
  for (const side of ['leftSleeve', 'rightSleeve']) {
    gc.save();
    gc.globalAlpha = mesh.garment[side].opacity;
    drawRegion(gc, parts[side], mesh[side], asset.bounds, fit);
    gc.restore();
    drawRegion(sc, parts[side], mesh[side], asset.bounds, fit);
  }
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.drawImage(layers.garment, 0, 0);
  if (originalFrame) {
    const mc = layers.mask.getContext('2d'),
      fc = layers.foreground.getContext('2d');
    mc.clearRect(0, 0, w, h);
    const masks = armOcclusionMasks(geometry, mesh.garment, fit);
    paintArmMasks(
      mc,
      masks.filter((m) => m.part === 'upperArm'),
    );
    mc.globalCompositeOperation = 'destination-out';
    mc.drawImage(layers.sleeves, 0, 0);
    mc.globalCompositeOperation = 'source-over';
    // A bent forearm may cross in front of either sleeve; only distal upper-arm
    // masks are cut back to keep the virtual cuffs intact.
    paintArmMasks(
      mc,
      masks.filter((m) => m.part === 'forearm'),
    );
    fc.clearRect(0, 0, w, h);
    fc.drawImage(originalFrame, 0, 0);
    fc.globalCompositeOperation = 'destination-in';
    fc.drawImage(layers.mask, 0, 0);
    fc.globalCompositeOperation = 'source-over';
    // Tracking loss fades the garment, not the person's foreground arms.
    ctx.globalAlpha = baseAlpha;
    ctx.drawImage(layers.foreground, 0, 0);
  }
  ctx.restore();
  return mesh;
}
