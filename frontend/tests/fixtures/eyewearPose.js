// Controlled poses of a REAL detected portrait mesh, not head-turn photographs.
// Head mesh and eyewear share a camera, but this independent projector constructs
// the observed face surface. Rotating glasses over unchanged frontal landmarks
// is deliberately not an acceptance fixture.
export const eyewearPoses = [
  { name: 'frontal', yaw: 0, pitch: 0, roll: 0 },
  { name: 'left-15', yaw: -15, pitch: 0, roll: 0 },
  { name: 'left-30', yaw: -30, pitch: 0, roll: 0 },
  { name: 'left-25', yaw: -25, pitch: 0, roll: 0 },
  { name: 'right-15', yaw: 15, pitch: 0, roll: 0 },
  { name: 'right-30', yaw: 30, pitch: 0, roll: 0 },
  { name: 'right-25', yaw: 25, pitch: 0, roll: 0 },
  { name: 'roll', yaw: 0, pitch: 0, roll: 10 },
  { name: 'roll-left', yaw: 0, pitch: 0, roll: -10 },
  { name: 'up', yaw: 0, pitch: 10, roll: 0 },
  { name: 'down', yaw: 0, pitch: -10, roll: 0 },
  { name: 'farther', yaw: 0, pitch: 0, roll: 0, scale: 0.75 },
  { name: 'closer', yaw: 0, pitch: 0, roll: 0, scale: 1.3 },
];
export function poseFixture(base, pose, fit = {}) {
  const rad = Math.PI / 180,
    sy = Math.sin(pose.yaw * rad),
    cy = Math.cos(pose.yaw * rad),
    sp = Math.sin(pose.pitch * rad),
    cp = Math.cos(pose.pitch * rad),
    cr = Math.cos(pose.roll * rad),
    sr = Math.sin(pose.roll * rad);
  const by = base.rawYawDegrees * rad,
    bp = (base.pitchDegrees ?? 0) * rad;
  const sourceWidth = (base.width / Math.max(0.55, Math.cos(by))) * (pose.scale ?? 1);
  const frameWidth = sourceWidth * (fit.widthMultiplier ?? 0.92),
    distance = fit.cameraDistance ?? base.cameraDistance;
  const points = base.faceSurface.map((p) => {
    // Independent inverse Ry(-yaw) Rx(pitch) in unrolled screen axes.
    const scale = Math.cos(by),
      x0 = p.x * scale,
      y0 = p.y * scale,
      z0 = p.z * scale;
    const x = Math.cos(by) * x0 + Math.sin(by) * z0,
      z = -Math.sin(by) * x0 + Math.cos(by) * z0;
    return {
      x: (x * sourceWidth) / frameWidth,
      y: ((Math.cos(bp) * y0 + Math.sin(bp) * z) * sourceWidth) / frameWidth,
      z: ((-Math.sin(bp) * y0 + Math.cos(bp) * z) * sourceWidth) / frameWidth,
    };
  });
  const project = (p) => {
    const py = cp * p.y - sp * p.z,
      pz = sp * p.y + cp * p.z;
    const x = cy * p.x - sy * pz,
      z = sy * p.x + cy * pz,
      perspective = distance / (distance + z);
    const lx = x * frameWidth * perspective,
      ly = py * frameWidth * perspective;
    return { x: base.x + cr * lx - sr * ly, y: base.y + sr * lx + cr * ly, lx, ly, z, perspective };
  };
  const observed = points.map(project),
    width = sourceWidth * Math.max(0.55, cy);
  const anchor = {
    ...base,
    width,
    angle: pose.roll * rad,
    rawYawDegrees: pose.yaw,
    pitchDegrees: pose.pitch,
    faceSurface: observed.map((p) => ({
      x: p.lx / width,
      y: p.ly / width,
      z: (p.z * frameWidth) / width,
    })),
  };
  return { anchor, observed, points, project };
}
