// Consecutive lateral FACE_OVAL vertices, verified against MediaPipe's
// face_landmarks_connections.ts: 127 -> 234 -> 93 and 356 -> 454 -> 323.
// These are temple/cheek-outline proxies, not anatomical ear landmarks.
export const headTargetLandmarks = [
  [127, 234, 93],
  [356, 454, 323],
];
export const faceOvalLandmarks = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function extractHeadSides(landmarks, width, height, bridge, roll, faceWidth) {
  const local = (p) => ({
    x:
      ((p.x * width - bridge.x) * Math.cos(roll) + (p.y * height - bridge.y) * Math.sin(roll)) /
      faceWidth,
    y:
      (-(p.x * width - bridge.x) * Math.sin(roll) + (p.y * height - bridge.y) * Math.cos(roll)) /
      faceWidth,
  });
  const targets = headTargetLandmarks
    .map((ids) => {
      if (!ids.every((id) => finitePoint(landmarks[id]))) return null;
      const pts = ids.map((id) => local(landmarks[id]));
      const span = Math.hypot(pts[2].x - pts[0].x, pts[2].y - pts[0].y);
      const head = {
        x: pts[0].x * 0.6 + pts[1].x * 0.3 + pts[2].x * 0.1,
        y: pts[0].y * 0.6 + pts[1].y * 0.3 + pts[2].y * 0.1,
      };
      if (Math.abs(head.x) < 0.25 || Math.abs(head.x) > 1.2 || span < 0.015 || span > 0.8)
        return null;
      const tangent = { x: (pts[2].x - pts[0].x) / span, y: (pts[2].y - pts[0].y) / span };
      let normal = { x: tangent.y, y: -tangent.x };
      if (normal.x * head.x < 0) normal = { x: -normal.x, y: -normal.y };
      const z = ids.reduce((sum, id, i) => sum + (landmarks[id].z ?? NaN) * [0.6, 0.3, 0.1][i], 0);
      const measuredDepth = (Math.abs(z - (landmarks[6]?.z ?? NaN)) * width) / faceWidth;
      return {
        ...head,
        normal,
        span,
        depth: clamp(Number.isFinite(measuredDepth) ? measuredDepth : span * 1.5, 0.05, 0.5),
        landmarkIds: ids,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);
  const contour = faceOvalLandmarks
    .map((id) => landmarks[id])
    .filter(finitePoint)
    .map(local);
  return {
    headSideTargets: targets.length === 2 ? targets : null,
    headContour: contour.length === faceOvalLandmarks.length ? contour : null,
  };
}

// Normalized head proxies are filtered separately from the front pose. A bad
// vertex/jump keeps the previous target, without moving the front or its hinges.
export function smoothHeadSides(previous, next, elapsedMs) {
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 80);
  return [-1, 1].map((side, i) => {
    const old = previous?.[i],
      target = next?.[i];
    if (
      !target ||
      !finitePoint(target) ||
      !Number.isFinite(target.span) ||
      !Number.isFinite(target.depth) ||
      !finitePoint(target.normal) ||
      Math.sign(target.x) !== side ||
      (old && Math.hypot(target.x - old.x, target.y - old.y) > 0.22)
    )
      return old || null;
    if (!old) return { ...target };
    const result = { ...target };
    for (const key of ['x', 'y', 'span', 'depth'])
      result[key] = old[key] + alpha * (target[key] - old[key]);
    return result;
  });
}

export function hingeToHeadPaths(anchor, transform, front) {
  const yaw = clamp(anchor.yaw ?? 0, -1, 1),
    turn = Math.abs(yaw);
  const nearSide = yaw > 0 ? -1 : 1;
  const angle =
    ((Number.isFinite(anchor.rawYawDegrees) ? anchor.rawYawDegrees : yaw * 75) * Math.PI) / 180;
  return [-nearSide, nearSide].map((side, i) => {
    const near = i === 1;
    const hinge = side < 0 ? front.leftHinge : front.rightHinge;
    const fallback = anchor.templeSides?.[side < 0 ? 0 : 1] || { x: side * 0.5, y: 0.1 };
    const candidate = anchor.headSideTargets?.[side < 0 ? 0 : 1];
    const head =
      finitePoint(candidate) &&
      finitePoint(candidate.normal) &&
      Number.isFinite(candidate.depth) &&
      Number.isFinite(candidate.span)
        ? candidate
        : { ...fallback, normal: { x: side, y: 0 }, span: 0.12, depth: 0.18 };
    const normal = head.normal || { x: side, y: 0 };
    // Extend the measured lateral contour toward the untracked ear. The outward
    // clearance comes from its arc span, and the additional posterior depth is
    // projected with the EXISTING head yaw (not a new yaw estimator).
    const clearance = head.span * 0.35 + head.depth * 0.15;
    let rawTarget = {
      x: (head.x + normal.x * clearance - Math.sin(angle) * head.depth * 0.5) * anchor.width,
      y: (head.y + normal.y * clearance + head.span * 0.1) * anchor.width,
    };
    const ear = anchor.earAnchors?.find((p) => p.side === side);
    if (finitePoint(ear)) {
      const delta = anchor.angle - transform.angle;
      rawTarget = {
        x:
          (anchor.x - transform.x) * Math.cos(transform.angle) +
          (anchor.y - transform.y) * Math.sin(transform.angle) +
          anchor.width * (ear.x * Math.cos(delta) - ear.y * Math.sin(delta)),
        y:
          -(anchor.x - transform.x) * Math.sin(transform.angle) +
          (anchor.y - transform.y) * Math.cos(transform.angle) +
          anchor.width * (ear.x * Math.sin(delta) + ear.y * Math.cos(delta)),
      };
    }
    let vx =
      side * clamp(side * (rawTarget.x - hinge.x), transform.width * 0.035, transform.width * 0.45);
    let vy = clamp(rawTarget.y - hinge.y, -transform.width * 0.06, transform.width * 0.2);
    let length = Math.hypot(vx, vy);
    const limited = clamp(length, transform.width * 0.055, transform.width * 0.48);
    if (length > 1e-6) {
      vx *= limited / length;
      vy *= limited / length;
    } else {
      vx = side * limited;
      vy = 0;
    }
    length = limited;
    const strong = clamp((turn - 0.42) / 0.58, 0, 1);
    const moderate = Math.min(1, turn / 0.42);
    let opacity = near ? 0.9 + 0.08 * turn : 0.9 * (1 - 0.55 * moderate) * (1 - strong);
    const visual = anchor.templeVisual?.find((p) => p.side === side);
    if (visual?.vectorX !== undefined) {
      vx = visual.vectorX * transform.width;
      vy = visual.vectorY * transform.width;
      length = Math.hypot(vx, vy);
      opacity = visual.opacity;
    }
    if (anchor.templeDiagnostics?.forceVisible) {
      vx = side * transform.width * 0.4;
      vy = 0;
      length = Math.abs(vx);
      opacity = 1;
    }
    const physicalLength = Math.hypot(length, head.depth * anchor.width * 0.5);
    return {
      side,
      near,
      forced: !!anchor.templeDiagnostics?.forceVisible,
      hingeX: hinge.x,
      hingeY: hinge.y,
      vector: { x: vx, y: vy },
      target: { x: hinge.x + vx, y: hinge.y + vy },
      rawTarget,
      headProxy: { x: head.x * anchor.width, y: head.y * anchor.width },
      ear,
      length,
      physicalLength,
      angle: Math.atan2(vy, vx),
      opacity,
      thicknessScale: visual?.thicknessScale ?? (near ? 1 + turn * 0.08 : 1 - turn * 0.12),
      targetTaper: near ? 0.85 - turn * 0.08 : 0.78 - turn * 0.2,
      curvature: visual?.curvature ?? 0.018 + turn * (near ? 0.007 : 0.003),
    };
  });
}

// Map the actual hinge-edge alpha centre to the fixed frame hinge. The full
// image height includes the hooked ear end; thickness derives from REAL aspect
// and physical path depth, with safety limits rather than a free fat ribbon.
export function templeQuad(temple, part, transform) {
  const pivot = part.hingePivot || { x: temple.side < 0 ? 1 : 0, y: 0.14 };
  const height = temple.forced
    ? (temple.length * part.bounds.height) / part.bounds.width
    : clamp(
        (temple.physicalLength * part.bounds.height) / part.bounds.width,
        transform.width * 0.025,
        transform.width * 0.085,
      ) * temple.thicknessScale;
  const n = {
    x: (-temple.vector.y / temple.length) * temple.side,
    y: (temple.vector.x / temple.length) * temple.side,
  };
  const hinge = { x: temple.hingeX, y: temple.hingeY };
  // The frame hinge is a vertical edge in frame space. Keeping both hinge
  // corners on that edge prevents a slanted quad from entering a clear lens.
  const ht = { x: hinge.x, y: hinge.y - pivot.y * height },
    hb = { x: hinge.x, y: hinge.y + (1 - pivot.y) * height };
  const earY = temple.forced ? pivot.y : (part.earPivot?.y ?? 0.9);
  const taper = temple.forced ? 1 : temple.targetTaper;
  const outward = temple.side * (temple.target.x - hinge.x);
  const endHeight = height * taper;
  const nx =
    temple.side *
    clamp(
      temple.side * n.x,
      -outward / Math.max(1e-6, (1 - earY) * endHeight),
      outward / Math.max(1e-6, earY * endHeight),
    );
  const targetEdge = (amount) => ({
    x: temple.target.x + nx * amount,
    y: temple.target.y + n.y * amount,
  });
  const tt = targetEdge(-earY * endHeight),
    tb = targetEdge((1 - earY) * endHeight);
  const control = {
    x: (hinge.x + temple.target.x) / 2,
    y: (hinge.y + temple.target.y) / 2 - height * (temple.curvature ?? 0.018),
  };
  const strips = [];
  const edge = (start, end, u) => ({
    x: start.x + (end.x - start.x) * u,
    y: start.y + (end.y - start.y) * u - 2 * u * (1 - u) * height * (temple.curvature ?? 0.018),
  });
  // Eight gently curved strips; both image-edge alpha pivots stay fixed.
  const corners = pivot.x === 1 ? [tt, ht, hb, tb] : [ht, tt, tb, hb];
  for (let i = 0; i < 8; i++) {
    const u = i / 8,
      v = (i + 1) / 8;
    strips.push([
      edge(corners[0], corners[1], u),
      edge(corners[0], corners[1], v),
      edge(corners[3], corners[2], v),
      edge(corners[3], corners[2], u),
    ]);
  }
  return {
    corners,
    strips,
    control,
    height,
    hingeTop: ht,
    hingeBottom: hb,
    targetTop: tt,
    targetBottom: tb,
    hingePivot: pivot,
  };
}

const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function drawTriangle(ctx, part, source, dest) {
  const [p0, p1, p2] = source,
    [q0, q1, q2] = dest;
  const det = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return;
  const ax = ((q1.x - q0.x) * (p2.y - p0.y) - (q2.x - q0.x) * (p1.y - p0.y)) / det;
  const bx = ((q2.x - q0.x) * (p1.x - p0.x) - (q1.x - q0.x) * (p2.x - p0.x)) / det;
  const ay = ((q1.y - q0.y) * (p2.y - p0.y) - (q2.y - q0.y) * (p1.y - p0.y)) / det;
  const by = ((q2.y - q0.y) * (p1.x - p0.x) - (q1.y - q0.y) * (p2.x - p0.x)) / det;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(q0.x, q0.y);
  ctx.lineTo(q1.x, q1.y);
  ctx.lineTo(q2.x, q2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(ax, ay, bx, by, q0.x - ax * p0.x - bx * p0.y, q0.y - ay * p0.x - by * p0.y);
  const b = part.bounds;
  ctx.drawImage(part.image, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
  ctx.restore();
}

export function drawTempleQuad(ctx, part, quad) {
  const [tl, tr, br, bl] = quad.corners;
  const count = quad.strips?.length ?? 8;
  // Eight strips / sixteen triangles preserve texture along the subtle curve.
  for (let i = 0; i < count; i++) {
    const u = i / count,
      v = (i + 1) / count,
      w = part.bounds.width,
      h = part.bounds.height;
    const [a, b, c, d] = quad.strips?.[i] ?? [
      mix(tl, tr, u),
      mix(tl, tr, v),
      mix(bl, br, v),
      mix(bl, br, u),
    ];
    drawTriangle(
      ctx,
      part,
      [
        { x: u * w, y: 0 },
        { x: v * w, y: 0 },
        { x: v * w, y: h },
      ],
      [a, b, c],
    );
    drawTriangle(
      ctx,
      part,
      [
        { x: u * w, y: 0 },
        { x: v * w, y: h },
        { x: u * w, y: h },
      ],
      [a, c, d],
    );
  }
}

export function contourInFrame(anchor, transform) {
  if (!anchor.headContour?.length) return null;
  const delta = anchor.angle - transform.angle;
  return anchor.headContour.map((p) => ({
    x:
      (anchor.x - transform.x) * Math.cos(transform.angle) +
      (anchor.y - transform.y) * Math.sin(transform.angle) +
      anchor.width * (p.x * Math.cos(delta) - p.y * Math.sin(delta)),
    y:
      -(anchor.x - transform.x) * Math.sin(transform.angle) +
      (anchor.y - transform.y) * Math.cos(transform.angle) +
      anchor.width * (p.x * Math.sin(delta) + p.y * Math.cos(delta)),
  }));
}

export function clipOutsideHead(ctx, contour, width, height) {
  if (!contour || contour.length < 3) return;
  ctx.beginPath();
  ctx.rect(-width * 3, -height * 4, width * 6, height * 8);
  ctx.moveTo(contour[0].x, contour[0].y);
  for (const p of contour.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.clip('evenodd');
}
