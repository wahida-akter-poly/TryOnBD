import { renderEyewearWebGL } from './eyewearWebGL.js';
// One fitted object in head-local 3D coordinates. Camera coordinates are
// x-right, y-down, z-away; MediaPipe's right-handed y-up/z-toward axes are
// converted by headPose.js. All parts use the same rotation and projection.
import { fallbackYawDegrees } from './headPose.js';
import { drawTempleQuad, contourInFrame, clipOutsideHead } from './templeGeometry.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const radians = (v) => (v * Math.PI) / 180;
export const eyewearRigConfig = Object.freeze({
  templeDepth: 0.62,
  templeSplay: 0.04,
  templeCurve: 0.065,
  templeRootLength: 0.18,
  templeDrop: 0.012,
  frontalVisibleFraction: 0.055,
  earSeatOffset: -0.015,
  earSeatWeight: 0.85,
  maxYawDegrees: 65,
  maxPitchDegrees: 40,
  textureStrips: 16,
});

export function createEyewearRig(anchor, transform, fit = {}) {
  const degrees =
    anchor.rawYawDegrees ??
    fallbackYawDegrees(anchor.rawYaw) ??
    Math.sign(anchor.yaw || 0) * (3 + Math.abs(anchor.yaw || 0) * 72);
  const yaw = radians(
    clamp(degrees, -eyewearRigConfig.maxYawDegrees, eyewearRigConfig.maxYawDegrees),
  );
  const pitch = radians(
    clamp(
      anchor.pitchDegrees ?? 0,
      -eyewearRigConfig.maxPitchDegrees,
      eyewearRigConfig.maxPitchDegrees,
    ),
  );
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  // Face-side span is already foreshortened. Recover object width once, before
  // projecting it: applying cos(yaw) to that span again makes frames shrink twice.
  const physicalWidth = transform.width / Math.max(0.55, cy);
  const aspect = transform.width / transform.height;
  const distance = clamp(fit.cameraDistance ?? anchor.cameraDistance ?? 5, 4, 12);
  const pivotX = fit.bridgePivot?.x ?? 0.5;
  const pivotY = fit.bridgePivot?.y ?? (anchor.bridgeLocked ? 0.42 : (anchor.pivot ?? 0.42));
  const rotate = (p) => {
    const y = cp * p.y - sp * p.z,
      z = sp * p.y + cp * p.z;
    return { x: cy * p.x - sy * z, y, z: sy * p.x + cy * z };
  };
  const project = (p) => {
    const q = rotate(p),
      perspective = distance / (distance + q.z);
    return {
      x: q.x * physicalWidth * perspective,
      y: q.y * physicalWidth * perspective,
      depth: q.z,
      perspective,
    };
  };
  const screen = (p) => ({
    x: transform.x + p.x * Math.cos(transform.angle) - p.y * Math.sin(transform.angle),
    y: transform.y + p.x * Math.sin(transform.angle) + p.y * Math.cos(transform.angle),
  });
  const frontPoint = (u, v) => ({ x: u - pivotX, y: (v - pivotY) / aspect, z: 0 });
  const localHinges = [-1, 1].map((side) => {
    const h = side < 0 ? fit.hinges?.left : fit.hinges?.right;
    return frontPoint(h?.x ?? (side < 0 ? 0.025 : 0.975), h?.y ?? 0.22);
  });
  const hinges = localHinges.map(project);
  const depth = clamp(fit.templeDepth ?? eyewearRigConfig.templeDepth, 0.4, 0.85);
  const splay = clamp(fit.templeSplay ?? eyewearRigConfig.templeSplay, 0.02, 0.08);
  // Shared, filtered head dimensions in object-width units. The facial oval
  // estimates the skull side, not a literal ear. Posterior targets are geometric.
  const faceToFrame = 1 / (fit.widthMultiplier ?? 0.92);
  const radius = clamp((anchor.headShape?.radius ?? 0.49) * faceToFrame, 0.46, 0.64);
  const sideDepth = clamp((anchor.headShape?.sideDepth ?? 0.25) * faceToFrame, 0.15, 0.45);
  const curve = clamp(fit.templeCurve ?? eyewearRigConfig.templeCurve, 0.02, 0.12);
  const rootLength = clamp(fit.templeRootLength ?? eyewearRigConfig.templeRootLength, 0.08, 0.3);
  const drop = clamp(fit.templeVerticalOffset ?? eyewearRigConfig.templeDrop, -0.08, 0.08);
  const frontalVisibleFraction = clamp(
    fit.frontalVisibleFraction ?? eyewearRigConfig.frontalVisibleFraction,
    0.02,
    0.075,
  );
  const earSeatOffset = clamp(fit.earSeatOffset ?? eyewearRigConfig.earSeatOffset, -0.08, 0.08);
  const earSeatWeight = clamp(fit.earSeatWeight ?? eyewearRigConfig.earSeatWeight, 0, 1);
  const sideProgress = clamp(sideDepth / depth, 0.4, 0.75);
  // Three cubic segments: hinge wrap, side shaft, posterior/ear-direction end.
  // Length and curvature live in HEAD coordinates and never change with yaw.
  const paths = localHinges.map((h, i) => {
    const side = i ? 1 : -1,
      // Compensate perspective once in head coordinates. This creates a small
      // real wrap, not yaw-dependent scaling or a depth/opacity exception.
      rootX = Math.max(
        Math.abs(h.x) + curve * 0.7,
        ((Math.abs(h.x) + frontalVisibleFraction) * (distance + depth * rootLength)) / distance,
      );
    const measuredSeat =
      (anchor.headShape?.sideHeight ?? (h.y - 0.025) / faceToFrame) * faceToFrame;
    // Bound the final offset as well: older profiles with a positive drop must
    // not pull the shaft below the hinge/upper-ear band.
    const seatY = clamp(measuredSeat + earSeatOffset + drop, h.y - 0.08, h.y - 0.01);
    const earY = h.y + (seatY - h.y) * earSeatWeight;
    return [
      h,
      { x: side * rootX, y: h.y, z: depth * rootLength },
      {
        x: side * Math.max(rootX, radius + splay),
        y: h.y + (earY - h.y) * 0.8,
        z: depth * sideProgress,
      },
      // Follow the skull side to the ear seat; the earlier deep inward fold
      // shortened frontal projection and pulled the photographed hook down.
      { x: side * Math.max(Math.abs(h.x), radius - curve * 0.4), y: earY, z: depth },
    ];
  });
  const templePoint = (side, u, v = 0) => {
    const path = paths[side < 0 ? 0 : 1],
      t = clamp(u, 0, 1);
    const knots = [0, rootLength, sideProgress, 1];
    let k = t < knots[1] ? 0 : t < knots[2] ? 1 : 2;
    const a = path[k],
      b = path[k + 1],
      f = (t - knots[k]) / (knots[k + 1] - knots[k]);
    // Smoothstep for the outward wrap; straight posterior depth avoids a hinge
    // flare and gives the textured ribbon a finite, curved frontal projection.
    const blend = f * f * (3 - 2 * f);
    return { x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend + depth * v, z: depth * u };
  };
  // A low-poly posterior skull closes the open facial mesh. Its anterior extent
  // stays BEHIND the bridge. It hides far stems through the side/back of the head.
  const headShell = [];
  const rings = 8,
    sectors = 24,
    rz = Math.max(0.25, sideDepth - 0.03),
    centerZ = rz + 0.03;
  const shellPoint = (i, j) => {
    const latitude = -Math.PI / 2 + (Math.PI * i) / rings,
      longitude = (2 * Math.PI * j) / sectors;
    return project({
      x: radius * Math.cos(latitude) * Math.cos(longitude),
      y: 0.28 + 0.72 * Math.sin(latitude),
      z: centerZ + rz * Math.cos(latitude) * Math.sin(longitude),
    });
  };
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sectors; j++) {
      const a = shellPoint(i, j),
        b = shellPoint(i, j + 1),
        c = shellPoint(i + 1, j + 1),
        d = shellPoint(i + 1, j);
      headShell.push(a, b, c, a, c, d);
    }
  const frontMesh = textureMesh((u, v) => project(frontPoint(u, v)));
  const corners = [
    project(frontPoint(0, 0)),
    project(frontPoint(1, 0)),
    project(frontPoint(1, 1)),
    project(frontPoint(0, 1)),
  ];
  const front = {
    pivotX,
    pivotY,
    frontScale: (corners[1].x - corners[0].x) / transform.width,
    leftScale: 1,
    rightScale: 1,
    leftWidth: -corners[0].x,
    rightWidth: corners[1].x,
    bridge: { x: transform.x, y: transform.y },
    leftHinge: hinges[0],
    rightHinge: hinges[1],
    screenHinges: hinges.map(screen),
    corners,
    mesh: frontMesh,
  };
  const nearSide = yaw > 0 ? -1 : 1;
  const temples = [-nearSide, nearSide].map((side) => {
    const hinge = hinges[side < 0 ? 0 : 1],
      target = project(templePoint(side, 1));
    const vector = { x: target.x - hinge.x, y: target.y - hinge.y };
    const near = side === nearSide;
    // Visibility comes from geometry and the depth buffer, never yaw fading.
    const opacity = 1;
    const length = Math.hypot(vector.x, vector.y);
    return {
      side,
      near,
      renderer: 'RIGID_3D',
      hingeX: hinge.x,
      hingeY: hinge.y,
      hingeDepth: hinge.depth,
      target,
      rawTarget: target,
      vector,
      length,
      physicalLength: depth * physicalWidth,
      projectedLengthRatio: length / transform.width,
      opacity,
      angle: Math.atan2(vector.y, vector.x),
      assetAngle: 0,
      absYaw: Math.abs(degrees),
      turnT: Math.abs(degrees) / 65,
      state: Math.abs(degrees) <= 3 ? 'frontal' : near ? 'near' : 'far',
    };
  });
  return {
    yawDegrees: degrees,
    pitchDegrees: anchor.pitchDegrees ?? 0,
    physicalWidth,
    distance,
    front,
    temples,
    project,
    screen,
    templePoint,
    depth,
    headShell: anchor.faceSurface ? headShell : [],
    headFit: {
      radius,
      sideDepth,
      curve,
      rootLength,
      drop,
      sideProgress,
      frontalVisibleFraction,
      earSeatOffset,
      earSeatWeight,
    },
    paths,
  };
}

export function textureMesh(point, count = eyewearRigConfig.textureStrips, seams = []) {
  const columns = [
    ...new Set([
      ...Array.from({ length: count + 1 }, (_, i) => i / count),
      ...seams.filter((u) => u > 0 && u < 1),
    ]),
  ].sort((a, b) => a - b);
  const strips = columns
    .slice(0, -1)
    .map((u, i) => [point(u, 0), point(columns[i + 1], 0), point(columns[i + 1], 1), point(u, 1)]);
  return {
    columns,
    corners: [strips[0][0], strips.at(-1)[1], strips.at(-1)[2], strips[0][3]],
    strips,
  };
}

export function rigidTempleMesh(rig, temple, part) {
  const b = part.bounds,
    hinge = part.visibleHinge ?? {
      x: b.x + b.width * (part.hingePivot?.x ?? (temple.side < 0 ? 1 : 0)),
      y: b.y + b.height * (part.hingePivot?.y ?? 0.45),
    };
  const tip = part.visibleTip ?? { x: b.x + (temple.side < 0 ? 0 : b.width), y: hinge.y };
  const dx = tip.x - hinge.x;
  if (!Number.isFinite(dx) || Math.abs(dx) < 1e-6)
    throw new Error('Temple shaft must have distinct hinge and rear anchors.');
  // Place a mesh column EXACTLY through the photographed hinge. Without this
  // seam the first texture triangle interpolates across the curved/clamped root,
  // separating visible hinge pixels from the mathematical hinge at head turns.
  const seams = [
    0,
    rig.headFit.rootLength,
    Math.min(0.75, Math.max(0.4, rig.headFit.sideDepth / rig.depth)),
    1,
  ].map((t) => (hinge.x + t * dx - b.x) / b.width);
  const mesh = textureMesh(
    (u, v) =>
      rig.project(
        rig.templePoint(
          temple.side,
          (b.x + u * b.width - hinge.x) / dx,
          (b.y + v * b.height - hinge.y) / Math.abs(dx),
        ),
      ),
    eyewearRigConfig.textureStrips,
    seams,
  );
  return {
    ...mesh,
    control: temple.target,
    hinge: rig.project(rig.templePoint(temple.side, 0)),
    tip: rig.project(rig.templePoint(temple.side, 1, (tip.y - hinge.y) / Math.abs(dx))),
  };
}

export function drawEyewearRig(ctx, asset, anchor, transform, fit = {}) {
  const rig = createEyewearRig(anchor, transform, fit);
  const meshes = new Map(
    rig.temples
      .filter((t) => (t.side < 0 ? asset.leftTemple : asset.rightTemple))
      .map((t) => [
        t.side,
        rigidTempleMesh(rig, t, t.side < 0 ? asset.leftTemple : asset.rightTemple),
      ]),
  );
  if (renderEyewearWebGL(ctx, asset, anchor, transform, rig, meshes)) return rig;
  if (ctx.canvas?.dataset) ctx.canvas.dataset.eyewearRenderer = 'CANVAS';
  const contour = contourInFrame(anchor, transform);
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.rotate(transform.angle);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const temple of rig.temples) {
    const part = temple.side < 0 ? asset.leftTemple : asset.rightTemple;
    if (!part || temple.opacity <= 0) continue;
    ctx.save();
    // Canvas cannot depth-test. Keep the same fitted strip, use the actual head
    // contour for the far shaft, and protect only the measured lens apertures.
    if (asset.lensOutlines?.length) {
      ctx.beginPath();
      ctx.rect(
        -transform.width * 3,
        -transform.height * 4,
        transform.width * 6,
        transform.height * 8,
      );
      for (const outline of asset.lensOutlines) {
        outline.forEach((p, i) => {
          const q = rig.project({
            x: p.x - rig.front.pivotX,
            y: ((p.y - rig.front.pivotY) * transform.height) / transform.width,
            z: 0,
          });
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        ctx.closePath();
      }
      ctx.clip('evenodd');
    }
    ctx.globalAlpha = transform.opacity * temple.opacity;
    const mesh = meshes.get(temple.side);
    if (!temple.near && contour?.length && part.visibleHinge && part.visibleTip) {
      const hinge = part.visibleHinge.x,
        dx = part.visibleTip.x - hinge;
      mesh.strips.forEach((strip, i) => {
        const u = (mesh.columns[i] + mesh.columns[i + 1]) / 2;
        const longitudinal = (part.bounds.x + u * part.bounds.width - hinge) / dx;
        ctx.save();
        // A 2D silhouette has no depth. Apply it only to the posterior shaft,
        // otherwise it removes the attached root even in a frontal pose.
        if (longitudinal > rig.headFit.rootLength)
          clipOutsideHead(ctx, contour, transform.width * 8, transform.height * 10);
        drawTempleQuad(ctx, part, {
          ...mesh,
          strips: [strip],
          columns: mesh.columns.slice(i, i + 2),
        });
        ctx.restore();
      });
    } else drawTempleQuad(ctx, part, mesh);
    ctx.restore();
  }
  ctx.globalAlpha = transform.opacity;
  drawTempleQuad(ctx, asset, rig.front.mesh);
  ctx.restore();
  return rig;
}
