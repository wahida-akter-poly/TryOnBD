import { fallbackYawDegrees, normalizeYawDegrees } from './headPose.js';
import { faceToCanvas } from './earTracking.js';
import { templeImagePlacement } from './templeAssetGeometry.js';
import { extractHeadSides, stableTemplePaths, templeQuad } from './templeGeometry.js';

export const defaultControls = () => ({
  auto: true,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 100,
  mirror: true,
});

export const trackingConfig = Object.freeze({
  detectionIntervalMs: 1000 / 30,
  lostGraceMs: 150,
  lostFadeMs: 120,
  steadySmoothingMs: 65,
  movingSmoothingMs: 25,
  // Independent size response: alpha ~0.34 at 60 Hz, 95% convergence in 120 ms.
  scaleSmoothingMs: 40,
  bridgeSmoothingMs: 18,
  movingBridgeSmoothingMs: 8,
  rollSmoothingMs: 40,
  yawSmoothingMs: 90,
});

export const yawConfig = Object.freeze({
  maxFrontCompression: 0.03,
  maxTempleLength: 0.6,
});

// Landmark-only fallback. Matrix orientation is applied by the tracking loop.
export function normalizeYaw(rawYaw) {
  return normalizeYawDegrees(fallbackYawDegrees(rawYaw));
}

// Frame-rate independent EMA: damp tiny jitter; respond faster to deliberate motion.
// Angles interpolate along the shortest arc, including across +/- PI.
export function smoothAnchors(previous, next, elapsedMs) {
  if (!next) return null;
  if (!previous || previous.length !== next.length) return next.map((a) => ({ ...a }));
  return next.map((anchor, index) => {
    const old = previous[index];
    const delta = Math.atan2(
      Math.sin(anchor.angle - old.angle),
      Math.cos(anchor.angle - old.angle),
    );
    const motion = Math.max(
      Math.hypot(anchor.x - old.x, anchor.y - old.y) / anchor.width,
      Math.abs(anchor.width - old.width) / anchor.width,
      Math.abs(delta) / 2,
    );
    const responsiveness = Math.min(1, motion / 0.12);
    const tau =
      trackingConfig.steadySmoothingMs +
      responsiveness * (trackingConfig.movingSmoothingMs - trackingConfig.steadySmoothingMs);
    const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / tau);
    const scaleAlpha = 1 - Math.exp(-Math.max(0, elapsedMs) / trackingConfig.scaleSmoothingMs);
    const positionMotion = Math.min(
      1,
      Math.hypot(anchor.x - old.x, anchor.y - old.y) / old.width / 0.04,
    );
    const bridgeTau =
      trackingConfig.bridgeSmoothingMs +
      positionMotion * (trackingConfig.movingBridgeSmoothingMs - trackingConfig.bridgeSmoothingMs);
    const positionAlpha = anchor.bridgeLocked
      ? 1 - Math.exp(-Math.max(0, elapsedMs) / bridgeTau)
      : alpha;
    const rollAlpha = anchor.bridgeLocked
      ? 1 - Math.exp(-Math.max(0, elapsedMs) / trackingConfig.rollSmoothingMs)
      : alpha;
    const yawAlpha = 1 - Math.exp(-Math.max(0, elapsedMs) / trackingConfig.yawSmoothingMs);
    return {
      ...anchor,
      x: old.x + positionAlpha * (anchor.x - old.x),
      y: old.y + positionAlpha * (anchor.y - old.y),
      width: old.width + scaleAlpha * (anchor.width - old.width),
      angle: old.angle + rollAlpha * delta,
      ...(anchor.yaw !== undefined
        ? {
            yaw: (old.yaw ?? anchor.yaw) + yawAlpha * (anchor.yaw - (old.yaw ?? anchor.yaw)),
            templeSides: anchor.templeSides?.map((p, i) => ({
              x:
                (old.templeSides?.[i].x ?? p.x) +
                yawAlpha * (p.x - (old.templeSides?.[i].x ?? p.x)),
              y:
                (old.templeSides?.[i].y ?? p.y) +
                yawAlpha * (p.y - (old.templeSides?.[i].y ?? p.y)),
            })),
          }
        : {}),
    };
  });
}

export function faceVisibility(now, lastSeen) {
  return Math.max(
    0,
    Math.min(1, 1 - (now - lastSeen - trackingConfig.lostGraceMs) / trackingConfig.lostFadeMs),
  );
}

export function displayLandmarks(landmarks, mirrored) {
  return landmarks?.map((p) => ({ ...p, x: mirrored ? 1 - p.x : p.x })) || null;
}

export function faceAnchors(landmarks, width, height, kind, headPose) {
  if (!landmarks?.[454]) return null;
  const point = (id) => ({ x: landmarks[id].x * width, y: landmarks[id].y * height });
  const mean = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // Inner/outer eye corners verified against MediaPipe's LEFT_EYE / RIGHT_EYE
  // connections. Average corners instead of using a moving pupil as the anchor.
  const eyes = [mean(point(33), point(133)), mean(point(362), point(263))].sort(
    (a, b) => a.x - b.x,
  );
  const [left, right] = eyes;
  const center = mean(left, right);
  const distance = Math.hypot(right.x - left.x, right.y - left.y);
  const angle = Math.atan2(right.y - left.y, right.x - left.x);
  const sideA = point(234),
    sideB = point(454);
  const faceWidth = Math.hypot(sideB.x - sideA.x, sideB.y - sideA.y);
  const eyeDistance = Math.hypot(point(263).x - point(33).x, point(263).y - point(33).y);
  if (!Number.isFinite(distance) || distance < 1) return null;
  if (kind === 'sunglasses') {
    if (!Number.isFinite(faceWidth) || faceWidth <= 1) return null;
    // Two adjacent centerline nose-root landmarks, NOT a face/eye midpoint.
    // 6 is near the inner-eye line; 168 stabilizes the upper nose root. Eye
    // corners determine roll independently, so yaw cannot drag this position.
    const noseRoot = point(6),
      upperRoot = point(168);
    const bridge = {
      x: noseRoot.x * 0.85 + upperRoot.x * 0.15,
      y: noseRoot.y * 0.85 + upperRoot.y * 0.15,
    };
    if (!Number.isFinite(bridge.x) || !Number.isFinite(bridge.y)) return null;
    // Roll-aligned coordinates normalized by the CURRENT face span. Face oval
    // landmarks approximate the side of the head; MediaPipe does not track ears.
    const local = (p) => ({
      x: ((p.x - bridge.x) * Math.cos(angle) + (p.y - bridge.y) * Math.sin(angle)) / faceWidth,
      y: (-(p.x - bridge.x) * Math.sin(angle) + (p.y - bridge.y) * Math.cos(angle)) / faceWidth,
    });
    const templeSides = [local(sideA), local(sideB)].sort((a, b) => a.x - b.x);
    const nose = local(point(1));
    const sideCenter = (templeSides[0].x + templeSides[1].x) / 2;
    const rawYaw = nose.x - sideCenter;
    const yaw = normalizeYaw(rawYaw);
    return [
      {
        ...bridge,
        bridgeLocked: true,
        noseBridge: bridge,
        noseRoot,
        eyes,
        eyeMidpoint: center,
        // Screen-space face-side span, recomputed on EVERY detection. No z,
        // normalization to the first frame, asset dimensions, or size clamp.
        width: faceWidth,
        faceWidthPx: faceWidth,
        eyeDistancePx: eyeDistance,
        angle,
        pivot: 0.5,
        yaw,
        rawYaw,
        templeSides,
        ...extractHeadSides(landmarks, width, height, bridge, angle, faceWidth),
        ...(headPose || {}),
      },
    ];
  }
  if (kind === 'earrings') {
    // Face oval points approximate ear lobes; Face Landmarker does not detect ears.
    const sides = [point(132), point(361)].sort((a, b) => a.x - b.x);
    return sides.map((p, i) => ({
      x: p.x + (i ? 1 : -1) * faceWidth * 0.045 * Math.cos(angle),
      y: p.y + (i ? 1 : -1) * faceWidth * 0.045 * Math.sin(angle),
      width: faceWidth * 0.16,
      angle,
      pivot: 0.06,
      side: i ? 1 : -1,
    }));
  }
  const forehead = point(10);
  // Place the pendant between the upper forehead and eye midpoint.
  return [
    {
      x: forehead.x * 0.68 + center.x * 0.32,
      y: forehead.y * 0.68 + center.y * 0.32,
      width: faceWidth * 0.42,
      angle,
      pivot: 0.58,
    },
  ];
}

// Only used when the user explicitly disables Auto Align with no detected face.
export function manualAnchors(width, height, kind) {
  if (kind === 'clothing')
    return [{ x: width / 2, y: height * 0.73, width: width * 0.7, angle: 0, pivot: 0.5 }];
  if (kind === 'necklace')
    return [{ x: width / 2, y: height * 0.7, width: width * 0.42, angle: 0, pivot: 0.5 }];
  if (kind === 'earrings')
    return [-1, 1].map((side) => ({
      x: width * (0.5 + side * 0.2),
      y: height * 0.5,
      width: width * 0.075,
      angle: 0,
      pivot: 0.06,
      side,
    }));
  return [
    {
      x: width / 2,
      y: height * (kind === 'forehead' ? 0.3 : 0.4),
      width: width * (kind === 'forehead' ? 0.2 : 0.45),
      angle: 0,
      pivot: kind === 'forehead' ? 0.58 : 0.47,
    },
  ];
}

// Face size, asset fit and user fine tuning are deliberately independent.
export function accessoryTransform(
  anchor,
  controls,
  canvasWidth,
  canvasHeight,
  aspectRatio,
  fit = {},
) {
  const direction = controls.mirror && anchor.side ? anchor.side : 1;
  const dx = ((controls.x * canvasWidth) / 100) * direction;
  // A bridge-calibrated frame already has a physical pivot. Legacy centering
  // offsets must not move that pivot away from the tracked nose root.
  const dy =
    (controls.y * canvasHeight) / 100 +
    (anchor.bridgeLocked ? 0 : anchor.width * (fit.verticalOffset ?? 0));
  const width = anchor.width * (fit.widthMultiplier ?? 1) * controls.scale;
  return {
    x: anchor.x + dx * Math.cos(anchor.angle) - dy * Math.sin(anchor.angle),
    y: anchor.y + dx * Math.sin(anchor.angle) + dy * Math.cos(anchor.angle),
    width,
    height: width / aspectRatio,
    angle:
      anchor.angle + ((controls.rotation * direction + (fit.rotationOffset ?? 0)) * Math.PI) / 180,
    opacity: (controls.opacity / 100) * ((fit.opacity ?? 100) / 100),
  };
}

export function drawAccessory(ctx, asset, anchors, controls, width, height, fit) {
  if (!asset || !anchors) return;
  const image = asset.image || asset;
  const bounds = asset.bounds || {
    x: 0,
    y: 0,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
  anchors.forEach((anchor) => {
    ctx.save();
    const transform = accessoryTransform(
      anchor,
      controls,
      width,
      height,
      bounds.width / bounds.height,
      fit,
    );
    const front = frontFrameGeometry(anchor, transform, fit);
    ctx.translate(transform.x, transform.y);
    ctx.rotate(transform.angle);
    ctx.globalAlpha = transform.opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const temples =
      asset.leftTemple && asset.rightTemple ? glassesTemples(anchor, transform, fit, asset) : null;
    const forced = anchor.templeDiagnostics?.forceVisible === true;
    const clipping = !forced && anchor.templeDiagnostics?.clipping !== false;
    const drawTemple = (temple) => {
      const part = temple.side === -1 ? asset.leftTemple : asset.rightTemple;
      ctx.save();
      // A strict outward half-plane prevents ANY temple pixel entering a lens,
      // including with roll, fit offsets, opacity, or extreme head turns.
      if (clipping) {
        ctx.beginPath();
        ctx.rect(
          temple.side < 0 ? temple.hingeX - transform.width * 2 : temple.hingeX,
          -transform.height * 2,
          transform.width * 2,
          transform.height * 5,
        );
        ctx.clip();
      }
      const destination = templeDrawGeometry(temple, part);
      if (
        ![
          destination.x,
          destination.y,
          destination.width,
          destination.height,
          temple.hingeX,
          temple.hingeY,
          temple.angle,
        ].every(Number.isFinite) ||
        destination.width <= 0 ||
        destination.height <= 0
      ) {
        ctx.restore();
        return;
      }
      ctx.globalAlpha = forced ? 1 : transform.opacity * temple.opacity;
      // The restored projection stays outside the lens by construction/guard.
      // A close-up face-contour mask erased the far hinge and sometimes the
      // entire dandi; stable yaw length/alpha provide the far-side reduction.
      ctx.translate(temple.hingeX, temple.hingeY);
      ctx.rotate(temple.assetAngle);
      const b = part.bounds;
      ctx.drawImage(
        part.image,
        b.x,
        b.y,
        b.width,
        b.height,
        destination.x,
        destination.y,
        destination.width,
        destination.height,
      );
      ctx.restore();
    };
    if (temples && !forced) drawTemple(temples[0]);
    // One rigid front: preserve left/right lens proportions at every turn.
    ctx.drawImage(
      image,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      -transform.width * front.frontScale * front.pivotX,
      -transform.height * front.pivotY,
      transform.width * front.frontScale,
      transform.height,
    );
    if (temples) {
      if (forced) drawTemple(temples[0]);
      drawTemple(temples[1]);
    }
    ctx.restore();
  });
}

// Returned in painter's order: far temple, then (after the front) near temple.
// Hinge origins follow the projected front; arms never alter its bridge position.
export function glassesTemples(anchor, transform, fit, asset) {
  const paths = stableTemplePaths(anchor, transform, frontFrameGeometry(anchor, transform, fit));
  if (!asset) return paths;
  return paths.map((p) => {
    const part = p.side < 0 ? asset.leftTemple : asset.rightTemple;
    if (!part?.visibleHinge || !part?.visibleTip) return p;
    const placement = templeImagePlacement(
      p.length,
      part.bounds,
      part.visibleHinge,
      part.visibleTip,
    );
    const dx = (part.visibleTip.x - part.visibleHinge.x) * placement.scale;
    const dy = (part.visibleTip.y - part.visibleHinge.y) * placement.scale;
    const vector = {
      x: dx * Math.cos(p.assetAngle) - dy * Math.sin(p.assetAngle),
      y: dx * Math.sin(p.assetAngle) + dy * Math.cos(p.assetAngle),
    };
    const target = { x: p.hingeX + vector.x, y: p.hingeY + vector.y };
    return { ...p, vector, target, rawTarget: target, angle: Math.atan2(vector.y, vector.x) };
  });
}

export function templeDrawGeometry(temple, part) {
  if (part.visibleHinge && part.visibleTip)
    return templeImagePlacement(temple.length, part.bounds, part.visibleHinge, part.visibleTip);
  const width = temple.length;
  const height = (width * part.bounds.height) / part.bounds.width;
  const pivot = part.hingePivot || { x: temple.side < 0 ? 1 : 0, y: 0.14 };
  return { x: -width * pivot.x, y: -height * pivot.y, width, height };
}

// Separate filters for actual arm lengths and alpha, in frame-width units.
export function smoothTempleVisual(previous, next, elapsedMs) {
  const lengthAlpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 100);
  const opacityAlpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 150);
  return next.map((part) => {
    const old = previous?.find((p) => p.side === part.side);
    return old
      ? {
          side: part.side,
          lengthRatio: old.lengthRatio + lengthAlpha * (part.lengthRatio - old.lengthRatio),
          opacity: old.opacity + opacityAlpha * (part.opacity - old.opacity),
          ...(part.vectorX !== undefined
            ? {
                vectorX:
                  (old.vectorX ?? part.vectorX) +
                  (1 - Math.exp(-Math.max(0, elapsedMs) / 90)) *
                    (part.vectorX - (old.vectorX ?? part.vectorX)),
                vectorY:
                  (old.vectorY ?? part.vectorY) +
                  (1 - Math.exp(-Math.max(0, elapsedMs) / 90)) *
                    (part.vectorY - (old.vectorY ?? part.vectorY)),
                thicknessScale:
                  (old.thicknessScale ?? part.thicknessScale) +
                  (1 - Math.exp(-Math.max(0, elapsedMs) / 120)) *
                    (part.thicknessScale - (old.thicknessScale ?? part.thicknessScale)),
                curvature:
                  (old.curvature ?? part.curvature) +
                  (1 - Math.exp(-Math.max(0, elapsedMs) / 100)) *
                    (part.curvature - (old.curvature ?? part.curvature)),
              }
            : {}),
        }
      : part;
  });
}

export function frontFrameGeometry(anchor, transform, fit = {}) {
  const pivotX = anchor.bridgeLocked ? (fit.bridgePivot?.x ?? 0.5) : 0.5;
  const pivotY = anchor.bridgeLocked ? (fit.bridgePivot?.y ?? 0.42) : anchor.pivot;
  const yaw = anchor.bridgeLocked ? Math.max(-1, Math.min(1, anchor.yaw ?? 0)) : 0;
  const frontScale = 1 - yawConfig.maxFrontCompression * yaw * yaw;
  const leftScale = frontScale;
  const rightScale = frontScale;
  const localHinge = (x, y, scale) => ({
    x: (x - pivotX) * transform.width * scale,
    y: (y - pivotY) * transform.height,
  });
  const leftHinge = localHinge(
    fit.hinges?.left?.x ?? 0.025,
    fit.hinges?.left?.y ?? 0.22,
    leftScale,
  );
  const rightHinge = localHinge(
    fit.hinges?.right?.x ?? 0.975,
    fit.hinges?.right?.y ?? 0.22,
    rightScale,
  );
  const screen = (p) => ({
    x: transform.x + p.x * Math.cos(transform.angle) - p.y * Math.sin(transform.angle),
    y: transform.y + p.x * Math.sin(transform.angle) + p.y * Math.cos(transform.angle),
  });
  return {
    pivotX,
    pivotY,
    frontScale,
    leftScale,
    rightScale,
    leftWidth: transform.width * pivotX * leftScale,
    rightWidth: transform.width * (1 - pivotX) * rightScale,
    bridge: { x: transform.x, y: transform.y },
    leftHinge,
    rightHinge,
    screenHinges: [screen(leftHinge), screen(rightHinge)],
  };
}

export function eyewearDebugGeometry(asset, anchor, controls, width, height, fit) {
  if (!asset || !anchor) return null;
  const front = frontFrameGeometry(
    anchor,
    accessoryTransform(
      anchor,
      controls,
      width,
      height,
      asset.bounds.width / asset.bounds.height,
      fit,
    ),
    fit,
  );
  return {
    detectedBridge: anchor.noseBridge,
    renderedBridge: front.bridge,
    hinges: front.screenHinges,
    eyes: anchor.eyes,
    eyeMidpoint: anchor.eyeMidpoint,
    rawYaw: anchor.rawYaw,
    yaw: anchor.yaw,
    yawSource: anchor.yawSource ?? 'FALLBACK',
    matrixYawDegrees: anchor.matrixYawDegrees ?? null,
    rawYawDegrees: anchor.rawYawDegrees ?? fallbackYawDegrees(anchor.rawYaw),
    held: anchor.held ?? false,
    frontScale: front.frontScale,
    temples:
      asset.leftTemple && asset.rightTemple
        ? glassesTemples(
            anchor,
            accessoryTransform(
              anchor,
              controls,
              width,
              height,
              asset.bounds.width / asset.bounds.height,
              fit,
            ),
            fit,
            asset,
          ).map((temple) => {
            const part = temple.side < 0 ? asset.leftTemple : asset.rightTemple;
            const destination = templeDrawGeometry(temple, part);
            const transform = accessoryTransform(
              anchor,
              controls,
              width,
              height,
              asset.bounds.width / asset.bounds.height,
              fit,
            );
            const quad = templeQuad(temple, part, transform);
            const screen = (p) => ({
              x: transform.x + p.x * Math.cos(transform.angle) - p.y * Math.sin(transform.angle),
              y: transform.y + p.x * Math.sin(transform.angle) + p.y * Math.cos(transform.angle),
            });
            return {
              ...temple,
              destination,
              quad,
              screenQuad: quad.corners.map(screen),
              screenTarget: screen(temple.target),
              screenHinge: screen({ x: temple.hingeX, y: temple.hingeY }),
              screenAssetHinge: screen({ x: temple.hingeX, y: temple.hingeY }),
              assetHingePivot: part.hingePivot,
              normalizedAssetAxisDegrees: part.normalizedAxisDegrees ?? 0,
              runtimeAngleDegrees: (temple.assetAngle * 180) / Math.PI,
              visibleProjectedLength: temple.length,
              screenAxisEnd: screen({
                x: temple.hingeX + temple.side * temple.length * Math.cos(temple.assetAngle),
                y: temple.hingeY + temple.side * temple.length * Math.sin(temple.assetAngle),
              }),
              screenControl: screen(quad.control),
              screenStrips: quad.strips.map((strip) => strip.map(screen)),
              screenRawEar: temple.ear?.raw ? faceToCanvas(temple.ear.raw, anchor) : null,
              asset: part.inspection,
              effectiveOpacity: anchor.templeDiagnostics?.forceVisible
                ? 1
                : temple.opacity *
                  accessoryTransform(
                    anchor,
                    controls,
                    width,
                    height,
                    asset.bounds.width / asset.bounds.height,
                    fit,
                  ).opacity,
              clipping:
                !anchor.templeDiagnostics?.forceVisible &&
                anchor.templeDiagnostics?.clipping !== false,
            };
          })
        : [],
    leftWidth: front.leftWidth,
    rightWidth: front.rightWidth,
  };
}
