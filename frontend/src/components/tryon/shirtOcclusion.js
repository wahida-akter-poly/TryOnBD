import { mixPoint } from './structuredShirtGeometry.js';

// Pose-guided foreground only: upper-arm restoration starts beyond the short
// cuff. Deeply rearward arms are excluded; unreliable depth uses screen pose.
export function armOcclusionMasks(body, garment, fit) {
  const masks = [];
  for (const side of ['left', 'right']) {
    const arm = body[side],
      sleeve = garment[`${side}Sleeve`];
    if (!arm.elbow || sleeve.armLength < 10) continue;
    const depth = [arm.elbow.z, arm.wrist?.z].filter(Number.isFinite);
    const shoulderDepth = arm.shoulder.z;
    // Hands crossing the projected front of the waist are foreground even if
    // noisy depth puts them behind a forward shoulder (common in turned poses).
    const wristOnTorso =
      arm.wrist &&
      arm.wrist.x > body.left.shoulder.x - body.shoulderWidth * 0.08 &&
      arm.wrist.x < body.right.shoulder.x + body.shoulderWidth * 0.08 &&
      arm.wrist.y > body.shoulderMidpoint.y &&
      arm.wrist.y < body.hipMidpoint.y + body.torsoHeight * 0.08;
    if (
      !wristOnTorso &&
      Number.isFinite(shoulderDepth) &&
      depth.length &&
      depth.every((z) => z > shoulderDepth + fit.occlusionDepthTolerance)
    )
      continue;
    // Bound masks by both body scale and the measured limb: a bent/short
    // projected segment must not restore a broad chunk of chest or waist.
    const radius = Math.min(
      body.shoulderWidth * fit.armRadiusRatio,
      sleeve.armLength * fit.armSegmentRadiusRatio,
    );
    const from = Math.min(0.8, sleeve.lengthRatio + fit.cuffOcclusionMargin);
    const start = mixPoint(arm.shoulder, arm.elbow, from);
    const middle = mixPoint(start, arm.elbow, 0.5);
    masks.push({
      side,
      part: 'upperArm',
      a: start,
      b: middle,
      ra: radius * fit.upperArmStartRadiusMultiplier,
      rb: radius,
    });
    masks.push({
      side,
      part: 'upperArm',
      a: middle,
      b: arm.elbow,
      ra: radius,
      rb: radius * fit.elbowRadiusMultiplier,
    });
    const forearmLength =
      arm.wrist && Math.hypot(arm.wrist.x - arm.elbow.x, arm.wrist.y - arm.elbow.y);
    if (forearmLength > 5)
      masks.push({
        side,
        part: 'forearm',
        a: arm.elbow,
        b: arm.wrist,
        ra: Math.min(radius * fit.elbowRadiusMultiplier, forearmLength * fit.armSegmentRadiusRatio),
        rb: Math.min(radius * fit.wristRadiusMultiplier, forearmLength * fit.armSegmentRadiusRatio),
      });
  }
  return masks;
}
export function capsulePolygon({ a, b, ra, rb }) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(length) || length < 1 || ![ra, rb].every((v) => Number.isFinite(v) && v > 0))
    return [];
  const angle = Math.atan2(b.y - a.y, b.x - a.x),
    points = [];
  for (let i = 0; i <= 8; i++) {
    const t = angle + Math.PI / 2 + (i * Math.PI) / 8;
    points.push({ x: a.x + Math.cos(t) * ra, y: a.y + Math.sin(t) * ra });
  }
  for (let i = 0; i <= 8; i++) {
    const t = angle - Math.PI / 2 + (i * Math.PI) / 8;
    points.push({ x: b.x + Math.cos(t) * rb, y: b.y + Math.sin(t) * rb });
  }
  return points;
}
export function paintArmMasks(ctx, masks) {
  ctx.fillStyle = 'white';
  for (const mask of masks) {
    const polygon = capsulePolygon(mask);
    if (!polygon.length) continue;
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    polygon.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
  }
}
