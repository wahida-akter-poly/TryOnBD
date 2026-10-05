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
  hingeBend: 0.018,
  templeDrop: 0.012,
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
  // Fixed hinge bend followed by a posterior shaft. This shape never opens,
  // flaps or changes length with pose. The photographed hook supplies its detail.
  const templePoint = (side, u, v = 0) => {
    const h = localHinges[side < 0 ? 0 : 1];
    return {
      x: h.x + side * (eyewearRigConfig.hingeBend * Math.min(Math.max(u, 0) / 0.07, 1) + splay * u),
      y: h.y + eyewearRigConfig.templeDrop * u + depth * v,
      z: depth * u,
    };
  };
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
    // Far geometry is already directed behind the face; alpha only softens the
    // occlusion edge. There is no independent length/angle filter per temple.
    const opacity = near ? 1 : clamp(1 - Math.abs(degrees) / 38, 0, 1);
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
  };
}

export function textureMesh(point, count = eyewearRigConfig.textureStrips) {
  const strips = Array.from({ length: count }, (_, i) => [
    point(i / count, 0),
    point((i + 1) / count, 0),
    point((i + 1) / count, 1),
    point(i / count, 1),
  ]);
  return { corners: [strips[0][0], strips.at(-1)[1], strips.at(-1)[2], strips[0][3]], strips };
}

export function rigidTempleMesh(rig, temple, part) {
  const b = part.bounds,
    hinge = part.visibleHinge ?? {
      x: b.x + b.width * (part.hingePivot?.x ?? (temple.side < 0 ? 1 : 0)),
      y: b.y + b.height * (part.hingePivot?.y ?? 0.45),
    };
  const tip = part.visibleTip ?? { x: b.x + (temple.side < 0 ? 0 : b.width), y: hinge.y };
  const dx = tip.x - hinge.x;
  const mesh = textureMesh((u, v) =>
    rig.project(
      rig.templePoint(
        temple.side,
        (b.x + u * b.width - hinge.x) / dx,
        (b.y + v * b.height - hinge.y) / Math.abs(dx),
      ),
    ),
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
    // Lens guard in assembly coordinates, including transparent clear lenses.
    // Both rear planes are painted before the front. No lens alpha can reveal
    // a ghost temple, and a far arm pointing inward is naturally hidden.
    ctx.beginPath();
    ctx.rect(
      temple.side < 0 ? temple.hingeX - transform.width * 3 : temple.hingeX,
      -transform.height * 4,
      transform.width * 3,
      transform.height * 8,
    );
    ctx.clip();
    // Conservative fallback: a far plane is behind the head, while the near
    // plane can lie on its visible side. A binary mask cannot depth-test that.
    if (!temple.near) clipOutsideHead(ctx, contour, transform.width * 8, transform.height * 10);
    ctx.globalAlpha = transform.opacity * temple.opacity;
    drawTempleQuad(ctx, part, meshes.get(temple.side));
    ctx.restore();
  }
  ctx.globalAlpha = transform.opacity;
  drawTempleQuad(ctx, asset, rig.front.mesh);
  ctx.restore();
  return rig;
}
