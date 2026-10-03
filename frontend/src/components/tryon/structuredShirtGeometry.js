import { clamp } from './shirtGeometry.js';
export const mixPoint = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (p, axis, n) => ({ x: p.x + axis.x * n, y: p.y + axis.y * n });
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const mean = (a, b) => mixPoint(a, b, 0.5);
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

export function structuredGarmentGeometry(body, fit) {
  const s = fit.sourceLandmarks,
    w = body.shoulderWidth;
  const across = { x: Math.cos(body.roll), y: Math.sin(body.roll) },
    down = { x: -across.y, y: across.x };
  const turn =
    Math.sin((clamp(body.yaw, -fit.maxYaw, fit.maxYaw) * Math.PI) / 180) *
    smooth((Math.abs(body.yaw) - 3) / 9);
  const neckBaseCenter = add(
    add(body.shoulderMidpoint, across, w * fit.collarOffsetX),
    down,
    -w * fit.neckRiseRatio,
  );
  const neckWidth = w * fit.neckWidthRatio;
  const collarCenterTop = add(neckBaseCenter, down, -w * fit.collarTopRiseRatio);
  const collarCenterBottom = add(neckBaseCenter, down, w * fit.collarVerticalOffset);
  const leftNeckAnchor = add(
    add(neckBaseCenter, across, -neckWidth / 2),
    down,
    -w * fit.neckSideRiseRatio,
  );
  const rightNeckAnchor = add(
    add(neckBaseCenter, across, neckWidth / 2),
    down,
    -w * fit.neckSideRiseRatio,
  );
  const sourceWidth = (s.rightShoulderSeam.x - s.leftShoulderSeam.x) * fit.sourceVisibleAspect;
  const sourceHeight = s.hemLeft.y - s.leftShoulderSeam.y;
  const naturalHeight = (w * sourceHeight) / sourceWidth;
  const baseHeight = clamp(
    body.torsoHeight * fit.lengthRatio * fit.heightMultiplier,
    naturalHeight * fit.minLengthStretch,
    naturalHeight * fit.maxLengthStretch,
  );
  const height = baseHeight * (1 + fit.hemLengthExtension);
  const silhouette = body.silhouette;
  const poseReference = silhouette
    ? structuredGarmentGeometry({ ...body, silhouette: null }, fit)
    : null;
  const measured = (t) => silhouette?.rows.find((r) => Math.abs(r.t - t) < 0.001);
  const easeAt = (t) =>
    t < 0.6
      ? fit.silhouette.chestEase
      : t < 0.9
        ? fit.silhouette.waistEase
        : fit.silhouette.hipEase;
  const measuredWidth = (t, fallback) => {
    const row = measured(t);
    return row?.sample
      ? fallback +
          ((row.sample.leftRatio + row.sample.rightRatio) * w * (1 + easeAt(t)) - fallback) *
            row.weight
      : fallback;
  };
  // Hip landmarks mark joints inside the pelvis, not the outer garment edge.
  const hipWidth = clamp(body.hipWidth * fit.hipSurfaceMultiplier, w * 0.82, w * 1.15);
  const estimatedChestWidth = clamp(w * 0.95 + hipWidth * 0.12, w * 1.02, w * 1.1);
  const estimatedWaistWidth = clamp(w * 0.4 + hipWidth * 0.6, w * 0.74, w * 1.08);
  // Pose shoulders are joint centres, slightly below the garment surface.
  let seamLeft = add(add(body.left.shoulder, across, -w * fit.seamEase), down, -w * fit.seamRise);
  let seamRight = add(add(body.right.shoulder, across, w * fit.seamEase), down, -w * fit.seamRise);
  const poseShoulderSpan = length(seamLeft, seamRight);
  const shoulderMask = measured(0);
  if (shoulderMask?.sample && shoulderMask.weight > 0) {
    const center = mean(seamLeft, seamRight);
    seamLeft = mixPoint(
      seamLeft,
      add(center, across, -w * shoulderMask.sample.leftRatio * (1 + fit.silhouette.shoulderEase)),
      shoulderMask.weight,
    );
    seamRight = mixPoint(
      seamRight,
      add(center, across, w * shoulderMask.sample.rightRatio * (1 + fit.silhouette.shoulderEase)),
      shoulderMask.weight,
    );
  }
  const centerAt = (t) => {
    const center = mixPoint(
      body.shoulderMidpoint,
      body.hipMidpoint,
      (t * baseHeight + smooth((t - 0.5) / 0.5) * (height - baseHeight)) / body.torsoHeight,
    );
    return center;
  };
  // Keep the upper chest/collar on shoulder roll. Lower rows gradually align
  // perpendicular to the shoulder-to-hip centreline, with a bounded hem tilt.
  // Hands/elbows never participate in this torso calculation.
  const centerlineAngle = Math.atan2(
    -(body.hipMidpoint.x - body.shoulderMidpoint.x),
    body.hipMidpoint.y - body.shoulderMidpoint.y,
  );
  const hemWidth = measuredWidth(1, hipWidth * (1 + 2 * fit.hipEase));
  const hemTiltLimit = Math.asin(clamp((w * fit.hemMaxVerticalRatio) / hemWidth, 0, 1));
  const hemAngle = clamp(centerlineAngle, -hemTiltLimit, hemTiltLimit);
  const edge = (center, row, side) => {
    const angle = body.roll + (hemAngle - body.roll) * smooth((row.t - 0.24) / 0.76);
    const axis = { x: Math.cos(angle), y: Math.sin(angle) };
    return add(
      center,
      axis,
      ((side * row.width) / 2) * (1 - side * turn * fit.perspectiveStrength),
    );
  };
  const sourceShoulderY = mean(s.leftShoulderSeam, s.rightShoulderSeam).y;
  const sourceHemY = mean(s.hemLeft, s.hemRight).y;
  const armpitY = mean(s.leftArmpit, s.rightArmpit).y;
  const waistY = mean(s.leftWaist, s.rightWaist).y;
  const rows = [
    {
      v: sourceShoulderY,
      t: 0,
      width: length(seamLeft, seamRight),
      left: seamLeft,
      right: seamRight,
      sourceLeft: s.leftShoulderSeam.x,
      sourceRight: s.rightShoulderSeam.x,
    },
    {
      v: armpitY,
      t: 0.24,
      width: estimatedChestWidth * (1 + 2 * fit.chestEase),
      sourceLeft: s.leftArmpit.x,
      sourceRight: s.rightArmpit.x,
    },
    {
      v: (armpitY + waistY) / 2,
      t: 0.5,
      width:
        ((estimatedChestWidth + estimatedWaistWidth) / 2) * (1 + fit.chestEase + fit.waistEase),
      sourceLeft: (s.leftArmpit.x + s.leftWaist.x) / 2,
      sourceRight: (s.rightArmpit.x + s.rightWaist.x) / 2,
    },
    {
      v: waistY,
      t: 0.74,
      width: estimatedWaistWidth * (1 + 2 * fit.waistEase),
      sourceLeft: s.leftWaist.x,
      sourceRight: s.rightWaist.x,
    },
    {
      v: sourceHemY,
      t: 1,
      width: hemWidth,
      sourceLeft: s.hemLeft.x,
      sourceRight: s.hemRight.x,
    },
  ].map((row) => ({
    ...row,
    center: centerAt(row.t),
    left: row.left || edge(centerAt(row.t), row, -1),
    right: row.right || edge(centerAt(row.t), row, 1),
  }));
  if (silhouette) {
    const a = rows[0],
      b = rows[1];
    rows.splice(1, 0, {
      t: 0.12,
      v: (a.v + b.v) / 2,
      center: centerAt(0.12),
      left: mixPoint(a.left, b.left, 0.5),
      right: mixPoint(a.right, b.right, 0.5),
      width: (a.width + b.width) / 2,
      sourceLeft: (a.sourceLeft + b.sourceLeft) / 2,
      sourceRight: (a.sourceRight + b.sourceRight) / 2,
    });
    rows[0].poseWidth = poseShoulderSpan;
    for (const row of rows.slice(1)) {
      row.poseWidth = row.width;
      const m = measured(row.t);
      if (!m?.sample || m.weight <= 0) continue;
      const angle = body.roll + (hemAngle - body.roll) * smooth((row.t - 0.24) / 0.76);
      const axis = { x: Math.cos(angle), y: Math.sin(angle) };
      row.left = mixPoint(
        row.left,
        add(row.center, axis, -m.sample.leftRatio * w * (1 + easeAt(row.t))),
        m.weight,
      );
      row.right = mixPoint(
        row.right,
        add(row.center, axis, m.sample.rightRatio * w * (1 + easeAt(row.t))),
        m.weight,
      );
      row.width = length(row.left, row.right);
    }
  }
  const torso = {
    rows,
    height,
    across,
    down,
    neckBaseCenter,
    leftNeckAnchor,
    rightNeckAnchor,
    collarCenterTop,
    collarCenterBottom,
    ...(poseReference ? { poseReferenceRows: poseReference.torso.rows } : {}),
  };
  const makeSleeve = (side, sign) => {
    const arm = body[side],
      seamTop = sign < 0 ? seamLeft : seamRight;
    const chestRow = rows.find((r) => r.t === 0.24);
    const seamBottom = sign < 0 ? chestRow.left : chestRow.right;
    const naturalAngle = body.roll + Math.atan2(w * 0.55, sign * w * 0.18);
    const naturalLength = Math.hypot(w * 0.18, w * 0.55);
    const dx = arm.elbow ? arm.elbow.x - arm.shoulder.x : Math.cos(naturalAngle) * naturalLength;
    const dy = arm.elbow ? arm.elbow.y - arm.shoulder.y : Math.sin(naturalAngle) * naturalLength;
    const armLength = Math.hypot(dx, dy);
    const measuredAngle = Math.atan2(dy, dx);
    const delta = Math.atan2(
      Math.sin(measuredAngle - naturalAngle),
      Math.cos(measuredAngle - naturalAngle),
    );
    const angle =
      naturalAngle +
      clamp(
        delta * fit.sleeveArmBlend,
        (-fit.sleeveMaxTurn * Math.PI) / 180,
        (fit.sleeveMaxTurn * Math.PI) / 180,
      );
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const near = -sign * turn;
    const ratio = clamp(
      fit.sleeveLengthRatio * (1 + near * fit.sleeveLengthPerspective),
      fit.sleeveMinLengthRatio,
      fit.sleeveMaxLengthRatio,
    );
    const projectedLength = armLength * ratio;
    const cuffCenter = add(seamTop, direction, projectedLength);
    // Across-cuff direction keeps source outer/inner edges anatomically ordered.
    const normal = { x: direction.y * sign, y: -direction.x * sign };
    const alpha = fit.sourceSleeveAlphaBounds;
    const sourceSleeveWidth = (alpha.left.width + alpha.right.width) / 2;
    const sourceShoulderWidth = s.rightShoulderSeam.x - s.leftShoulderSeam.x;
    const bodyWidth =
      w *
      (sourceSleeveWidth / sourceShoulderWidth) *
      fit.sleeveWidthCalibration *
      (1 + near * fit.sleevePerspective);
    const cuffWidth = bodyWidth * fit.sleeveCuffTaper;
    return {
      side,
      sign,
      seamTop,
      seamBottom,
      cuffCenter,
      cuffOuter: add(cuffCenter, normal, cuffWidth / 2),
      cuffInner: add(cuffCenter, normal, -cuffWidth / 2),
      direction,
      normal,
      angle,
      armLength,
      projectedLength,
      lengthRatio: projectedLength / Math.max(1, armLength),
      cuffWidth,
      bodyWidth,
      opacity: 1 - Math.max(0, -near) * 0.07,
    };
  };
  return {
    torso,
    neckBaseCenter,
    leftNeckAnchor,
    rightNeckAnchor,
    collarCenterTop,
    collarCenterBottom,
    seamLeft,
    seamRight,
    estimatedChestWidth,
    estimatedWaistWidth,
    hipWidth,
    turn,
    trackingMode: silhouette?.rows.some((r) => r.weight > 0)
      ? 'SILHOUETTE_FUSED'
      : body.trackingMode === 'SHOULDERS_ONLY'
        ? 'SHOULDER_FALLBACK'
        : 'POSE_ONLY',
    silhouette,
    outerShoulders: [seamLeft, seamRight],
    widths: Object.fromEntries(rows.map((r) => [r.t, r.width])),
    leftSleeve: makeSleeve('left', -1),
    rightSleeve: makeSleeve('right', 1),
  };
}

function interpolateRows(rows, v) {
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1].v < v) i++;
  const a = rows[i],
    b = rows[i + 1],
    t = (v - a.v) / (b.v - a.v);
  return {
    left: mixPoint(a.left, b.left, t),
    right: mixPoint(a.right, b.right, t),
    sourceLeft: a.sourceLeft + (b.sourceLeft - a.sourceLeft) * t,
    sourceRight: a.sourceRight + (b.sourceRight - a.sourceRight) * t,
    poseWidth: (a.poseWidth ?? a.width) + ((b.poseWidth ?? b.width) - (a.poseWidth ?? a.width)) * t,
  };
}
export function torsoPanelPoint(u, v, g, fit) {
  const row = interpolateRows(g.torso.rows, v);
  let lateral = (u - row.sourceLeft) / (row.sourceRight - row.sourceLeft);
  // Leave the logo's local horizontal scale close to the accepted Pose fit;
  // absorb broad-body expansion into fabric on either side of its source band.
  // The same affine mesh renders this monotonic coordinate remapping.
  if (g.silhouette) {
    const logo = fit.silhouette.logo;
    const width = length(row.left, row.right);
    const reference = interpolateRows(g.torso.poseReferenceRows, v);
    const stretch = Math.min(
      1,
      (length(reference.left, reference.right) * logo.maxStretch) / Math.max(1, width),
    );
    const l = (logo.left - row.sourceLeft) / (row.sourceRight - row.sourceLeft);
    const r = (logo.right - row.sourceLeft) / (row.sourceRight - row.sourceLeft);
    const center = (l + r) / 2,
      dl = center + (l - center) * stretch,
      dr = center + (r - center) * stretch;
    const shaped =
      lateral < l
        ? (lateral * dl) / l
        : lateral > r
          ? dr + ((lateral - r) * (1 - dr)) / (1 - r)
          : center + (lateral - center) * stretch;
    const weight = smooth((v - logo.top + 0.05) / 0.05) * smooth((logo.bottom + 0.05 - v) / 0.05);
    lateral += (shaped - lateral) * weight;
  }
  let p = mixPoint(row.left, row.right, lateral);
  // Four locally constrained crew-neck anchors; their compact corrections do
  // not move either shoulder seam or the chest/logo region.
  const s = fit.sourceLandmarks;
  const anchors = [
    [s.collarLeft, g.leftNeckAnchor],
    [s.collarCenterTop, g.collarCenterTop],
    [s.collarCenterBottom, g.collarCenterBottom],
    [s.collarRight, g.rightNeckAnchor],
  ];
  const upper = Math.max(
    0,
    Math.min(
      1,
      (g.torso.rows.find((r) => r.t === 0.24).v - v) /
        (g.torso.rows.find((r) => r.t === 0.24).v - g.torso.rows[0].v),
    ),
  );
  const nodes = [
    s.leftShoulderSeam.x,
    s.collarLeft.x,
    s.collarCenter.x,
    s.collarRight.x,
    s.rightShoulderSeam.x,
  ];
  const weights = anchors.map(([a], i) => {
    const x = i === 0 ? 1 : i === 3 ? 3 : 2;
    const horizontal =
      u <= nodes[x]
        ? smooth((u - nodes[x - 1]) / (nodes[x] - nodes[x - 1]))
        : smooth((nodes[x + 1] - u) / (nodes[x + 1] - nodes[x]));
    if (i === 0 || i === 3) return horizontal * Math.exp(-(((v - a.y) / 0.07) ** 2)) * upper;
    const top = s.collarCenterTop.y,
      bottom = s.collarCenterBottom.y;
    const between = smooth((v - top) / (bottom - top));
    const outside = Math.max(0, top - v, v - bottom);
    return (
      horizontal * (i === 1 ? 1 - between : between) * Math.exp(-((outside / 0.07) ** 2)) * upper
    );
  });
  anchors.forEach(([a, target], i) => {
    const ar = interpolateRows(g.torso.rows, a.y),
      original = mixPoint(
        ar.left,
        ar.right,
        (a.x - ar.sourceLeft) / (ar.sourceRight - ar.sourceLeft),
      );
    const weight = weights[i];
    p = { x: p.x + (target.x - original.x) * weight, y: p.y + (target.y - original.y) * weight };
  });
  return p;
}
export function sleevePatchPoint(t, v, g, side, fit, source = false) {
  const s = fit.sourceLandmarks,
    sleeve = g[`${side}Sleeve`];
  const top = source ? s[`${side}ShoulderSeam`] : sleeve.seamTop;
  const bottom = source ? s[`${side}Armpit`] : sleeve.seamBottom;
  const outer = source ? s[`${side}CuffOuter`] : sleeve.cuffOuter;
  const inner = source ? s[`${side}CuffInner`] : sleeve.cuffInner;
  const seam = source
    ? mixPoint(top, bottom, v)
    : torsoPanelPoint(
        s[`${side}ShoulderSeam`].x + (s[`${side}Armpit`].x - s[`${side}ShoulderSeam`].x) * v,
        s[`${side}ShoulderSeam`].y + (s[`${side}Armpit`].y - s[`${side}ShoulderSeam`].y) * v,
        g,
        fit,
      );
  const point = mixPoint(seam, mixPoint(outer, inner, v), t);
  if (source) return point;
  // A subtly fuller sleeve body narrows toward the cuff. Both seam endpoints
  // and the complete seam curve remain exactly attached to the torso panel.
  const fullness = Math.sin(Math.PI * clamp(t, 0, 1)) * (1 - fit.sleeveCuffTaper);
  return add(point, sleeve.normal, (0.5 - v) * sleeve.bodyWidth * fullness);
}
