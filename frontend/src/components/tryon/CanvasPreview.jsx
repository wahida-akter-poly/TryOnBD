import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { acquireFaceLandmarker } from '../../services/faceLandmarker';
import { resolveHeadPose } from './headPose.js';
import { useState } from 'react';
import { acquirePoseLandmarker, poseIntervalMs } from '../../services/poseLandmarker.js';
import { updateEarTracking, fuseEarAnchors } from './earTracking.js';
import { loadAccessoryAsset, loadGlassesAssembly } from './accessoryAssets';
export { loadImage } from './accessoryAssets';
import {
  displayLandmarks,
  drawAccessory,
  faceAnchors,
  manualAnchors,
  smoothAnchors,
  faceVisibility,
  trackingConfig,
  eyewearDebugGeometry,
  accessoryTransform,
  glassesTemples,
  smoothTempleVisual,
} from './faceGeometry';

const copyCanvas = (canvas) => {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  return copy;
};

// Shared canvas supports automatic sunglasses and the existing manual prototypes.
// Frame-level transforms stay in refs; only status transitions reach React.
const CanvasPreview = forwardRef(function CanvasPreview(
  {
    source,
    overlay,
    leftTempleSrc,
    rightTempleSrc,
    fit,
    kind,
    controls,
    view,
    compare = 50,
    trackingEnabled = true,
    retry,
    onStatus,
    arDebug = false,
  },
  ref,
) {
  const canvas = useRef(null),
    frame = useRef(null),
    landmarks = useRef(null),
    asset = useRef(null);
  const frozen = useRef(null),
    wasAuto = useRef(true),
    smoothed = useRef(null),
    raw = useRef(null);
  const options = useRef({ controls, view, kind, compare, fit });
  options.current = { controls, view, kind, compare, fit };
  const render = useRef(() => {});
  const debugLayer = useRef(null);
  const debugPanel = useRef(null);
  const [forceTemples, setForceTemples] = useState(false);
  const [clipTemples, setClipTemples] = useState(true);
  const templeDiagnosticOptions = useRef({});
  templeDiagnosticOptions.current = arDebug
    ? { forceVisible: forceTemples, clipping: clipTemples }
    : {};
  useEffect(() => {
    render.current();
  }, [forceTemples, clipTemples]);
  const reported = useRef({});
  const report = useRef(null);
  report.current = (patch) => {
    if (Object.keys(patch).every((key) => reported.current[key] === patch[key])) return;
    reported.current = { ...reported.current, ...patch };
    onStatus(patch);
  };
  useImperativeHandle(
    ref,
    () => ({
      snapshot(exact = false) {
        if (!frame.current || !canvas.current) return null;
        // Capture copies the displayed frame. Save/download export After.
        if (!exact) render.current(true);
        const result = copyCanvas(canvas.current);
        if (!exact) render.current();
        return { original: copyCanvas(frame.current), result };
      },
    }),
    [],
  );
  useEffect(() => {
    let current = true;
    asset.current = null;
    report.current({ assetReady: false, assetError: '', assetNotice: '' });
    (leftTempleSrc && rightTempleSrc
      ? loadGlassesAssembly(overlay, leftTempleSrc, rightTempleSrc)
      : loadAccessoryAsset(overlay, null, kind === 'sunglasses')
    )
      .then((loaded) => {
        if (!current) return;
        asset.current = loaded;
        report.current({
          assetReady: true,
          assetNotice:
            kind === 'sunglasses' && loaded.isFallback ? 'Product image unavailable.' : '',
        });
        render.current();
      })
      .catch(
        () =>
          current &&
          report.current({
            assetReady: false,
            assetError:
              kind === 'sunglasses'
                ? 'Realistic try-on asset unavailable.'
                : 'Accessory image could not load. Select another style or retry.',
          }),
      );
    return () => {
      current = false;
    };
  }, [overlay, leftTempleSrc, rightTempleSrc, kind, retry]);
  useEffect(() => {
    frozen.current = null;
    wasAuto.current = true;
    render.current();
  }, [kind, source]);
  useEffect(() => {
    render.current();
  }, [
    controls,
    view,
    compare,
    fit?.widthMultiplier,
    fit?.verticalOffset,
    fit?.rotationOffset,
    fit?.opacity,
    fit?.bridgePivot,
    fit?.hinges,
  ]);
  useEffect(() => {
    let active = true,
      raf = 0,
      inFlight = false,
      lastDetection = -Infinity,
      lastVideoTime = -1;
    let lastSeen = -Infinity,
      lastRender = performance.now(),
      lastDebug = -Infinity,
      failed = false;
    let earTracks = null,
      earAnchors = null,
      poseBusy = false,
      posePhotoDetected = false,
      lastPoseAt = -Infinity,
      lastPoseVideo = -1;
    let earGeneration = 0;
    const earDetector =
      arDebug && source && trackingEnabled && !source.composite ? acquirePoseLandmarker() : null;
    let pose = null,
      templeVisual = null,
      lastTempleRender = performance.now();
    delete window.__tryOnScaleDebug;
    delete window.__tryOnBridgeDebug;
    // No model lease for idle previews, immutable captures, or manual prototypes.
    const detector =
      source && trackingEnabled && !source.composite ? acquireFaceLandmarker() : null;
    landmarks.current = null;
    raw.current = null;
    smoothed.current = null;
    frame.current = null;
    report.current({
      tracking: !source
        ? 'Waiting for input'
        : source.composite
          ? 'Captured'
          : trackingEnabled
            ? 'Loading face detector'
            : 'Manual',
      detectorError: '',
      ready: false,
    });
    const target = canvas.current,
      ctx = target.getContext('2d');
    if (!ctx) {
      report.current({ detectorError: 'Canvas is unavailable in this browser.', ready: false });
      return () => detector?.release();
    }
    if (!source) {
      ctx.clearRect(0, 0, target.width, target.height);
      if (debugLayer.current) debugLayer.current.style.visibility = 'hidden';
      if (debugPanel.current) debugPanel.current.style.visibility = 'hidden';
      render.current = () => {};
      return () => detector?.release();
    }
    const input = source.element;
    const w = input.videoWidth || input.naturalWidth || input.width;
    const h = input.videoHeight || input.naturalHeight || input.height;
    const ratio = Math.min(1, 1280 / Math.max(w, h));
    target.width = Math.max(1, Math.round(w * ratio));
    target.height = Math.max(1, Math.round(h * ratio));
    const original = document.createElement('canvas');
    original.width = target.width;
    original.height = target.height;
    const originalCtx = original.getContext('2d');
    const drawSource = () => {
      originalCtx.save();
      if (source.mirrored) {
        originalCtx.translate(original.width, 0);
        originalCtx.scale(-1, 1);
      }
      originalCtx.drawImage(input, 0, 0, original.width, original.height);
      originalCtx.restore();
      frame.current = original;
    };
    render.current = (forceAfter = false) => {
      if (!active || !frame.current) return;
      const { controls: c, kind: k, view: v, compare: split, fit: productFit } = options.current;
      if (debugLayer.current) debugLayer.current.style.visibility = 'hidden';
      if (debugPanel.current) debugPanel.current.style.visibility = 'hidden';
      if (source.composite) delete window.__tryOnBridgeDebug;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(original, 0, 0);
      if (!forceAfter && v === 'before') return;
      ctx.save();
      if (!forceAfter && v === 'compare') {
        ctx.beginPath();
        ctx.rect((target.width * split) / 100, 0, target.width, target.height);
        ctx.clip();
      }
      if (source.composite) {
        // This already contains glasses. Never detect or overlay it again.
        ctx.drawImage(source.composite, 0, 0, target.width, target.height);
        ctx.restore();
        return;
      }
      const detected = trackingEnabled
        ? source.live
          ? smoothed.current
          : faceAnchors(landmarks.current, target.width, target.height, k, pose)
        : null;
      if (
        k === 'sunglasses' &&
        detected?.[0] &&
        asset.current?.leftTemple &&
        asset.current?.rightTemple
      ) {
        const a = detected[0];
        if (arDebug && !source.live && !posePhotoDetected && !poseBusy && raw.current?.[0])
          void detectEars(performance.now());
        a.templeDiagnostics = templeDiagnosticOptions.current;
        const transform = accessoryTransform(
          a,
          c,
          target.width,
          target.height,
          asset.current.bounds.width / asset.current.bounds.height,
          productFit,
        );
        const parts = glassesTemples(
          { ...a, templeVisual: undefined, earAnchors: undefined },
          transform,
          productFit,
        );
        const now = performance.now();
        if (arDebug)
          earAnchors = fuseEarAnchors(
            earAnchors,
            earTracks,
            a,
            parts,
            transform,
            source.live ? now : (earTracks?.find((p) => p.good)?.goodAt ?? now),
            source.live ? now - lastTempleRender : 1000,
          );
        // Pose remains diagnostic only. The visible PNG projection never reads
        // these anchors, so a weak/cropped ear cannot shrink the dandi.
        a.earDiagnostics = arDebug ? earAnchors : undefined;
        const next = parts.map((p) => ({
          side: p.side,
          lengthRatio: p.length / transform.width,
          opacity: p.opacity,
        }));
        templeVisual =
          source.live && !a.templeDiagnostics.forceVisible
            ? smoothTempleVisual(templeVisual, next, now - lastTempleRender)
            : next;
        lastTempleRender = now;
        a.templeVisual = templeVisual;
      }
      if (c.auto) frozen.current = detected;
      else if (wasAuto.current || !frozen.current)
        frozen.current = detected || manualAnchors(target.width, target.height, k);
      wasAuto.current = c.auto;
      const visibility = c.auto && source.live ? faceVisibility(performance.now(), lastSeen) : 1;
      drawAccessory(
        ctx,
        asset.current,
        c.auto ? detected : frozen.current,
        { ...c, opacity: c.opacity * visibility },
        target.width,
        target.height,
        productFit,
      );
      ctx.restore();
      if (arDebug && debugLayer.current && k === 'sunglasses') {
        const drawn = (c.auto ? detected : frozen.current)?.[0];
        const measured = source.live ? raw.current?.[0] : detected?.[0];
        const geometry = eyewearDebugGeometry(
          asset.current,
          drawn,
          c,
          target.width,
          target.height,
          productFit,
        );
        if (geometry && measured && visibility > 0) {
          // A separate SVG diagnostic layer never enters captures/downloads.
          const layer = debugLayer.current;
          layer.setAttribute('viewBox', `0 0 ${target.width} ${target.height}`);
          layer.style.visibility = 'visible';
          debugPanel.current.style.visibility = 'visible';
          const points = [
            measured.noseBridge,
            geometry.renderedBridge,
            ...(measured.eyes || []),
            ...geometry.hinges,
            measured.eyeMidpoint,
          ];
          layer.querySelectorAll('[data-pose-marker]').forEach((circle, i) => {
            circle.setAttribute('cx', points[i].x);
            circle.setAttribute('cy', points[i].y);
          });
          layer.querySelectorAll('[data-temple-vector]').forEach((node) => {
            const side = Number(node.getAttribute('data-temple-vector'));
            const p = geometry.temples.find((t) => t.side === side);
            node.style.visibility = p ? 'visible' : 'hidden';
            if (!p) return;
            node.querySelector('line').setAttribute('x1', p.screenHinge.x);
            node.querySelector('line').setAttribute('y1', p.screenHinge.y);
            node.querySelector('line').setAttribute('x2', p.screenTarget.x);
            node.querySelector('line').setAttribute('y2', p.screenTarget.y);
            node.querySelector('circle').setAttribute('cx', p.screenTarget.x);
            node.querySelector('circle').setAttribute('cy', p.screenTarget.y);
            const pivot = node.querySelector('[data-asset-hinge]');
            pivot.setAttribute('cx', p.screenAssetHinge.x);
            pivot.setAttribute('cy', p.screenAssetHinge.y);
            const axis = node.querySelector('[data-asset-axis]');
            axis.setAttribute('x1', p.screenAssetHinge.x);
            axis.setAttribute('y1', p.screenAssetHinge.y);
            axis.setAttribute('x2', p.screenAxisEnd.x);
            axis.setAttribute('y2', p.screenAxisEnd.y);
          });
          const arm = (side) => geometry.temples.find((p) => p.side === side);
          const lines = [
            `Matrix yaw: ${geometry.matrixYawDegrees?.toFixed(1) ?? '-'}° (${geometry.yawSource})`,
            `Abs yaw: ${arm(-1)?.absYaw.toFixed(1) ?? '-'}°`,
            `turnT: ${arm(-1)?.turnT.toFixed(3) ?? '-'}`,
            ...[-1, 1].map(
              (side) =>
                `${side < 0 ? 'Left' : 'Right'} length: ${((arm(side)?.projectedLengthRatio ?? 0) * 100).toFixed(1)}%`,
            ),
            `State: ${arm(-1)?.state === 'frontal' ? 'frontal' : `left ${arm(-1)?.state} / right ${arm(1)?.state}`}`,
            `Angles: L ${arm(-1)?.runtimeAngleDegrees.toFixed(1) ?? '-'}° / R ${arm(1)?.runtimeAngleDegrees.toFixed(1) ?? '-'}°`,
          ];
          debugPanel.current.querySelectorAll('[data-pose-line]').forEach((node, i) => {
            node.textContent = lines[i];
          });
          window.__tryOnBridgeDebug = {
            ...geometry,
            detectedBridge: measured.noseBridge,
            rawYaw: measured.rawYaw,
            bridgeErrorPx: Math.hypot(
              measured.x - geometry.renderedBridge.x,
              measured.y - geometry.renderedBridge.y,
            ),
            faceWidthPx: measured.width,
            posePerformance: earDetector?.metrics,
          };
        } else delete window.__tryOnBridgeDebug;
      }
      if (arDebug && k === 'sunglasses' && performance.now() - lastDebug >= 200) {
        lastDebug = performance.now();
        const measured = source.live ? raw.current?.[0] : detected?.[0];
        const filtered = source.live ? smoothed.current?.[0] : detected?.[0];
        const drawn = (c.auto ? detected : frozen.current)?.[0];
        const productFitMultiplier = productFit?.widthMultiplier ?? 1;
        const renderedGlassesWidth = (drawn?.width ?? 0) * productFitMultiplier * c.scale;
        window.__tryOnScaleDebug = {
          sampledAt: lastDebug,
          autoAlign: c.auto,
          faceDetected: Boolean(landmarks.current),
          faceWidthPx: measured?.faceWidthPx ?? 0,
          eyeDistancePx: measured?.eyeDistancePx ?? 0,
          automaticFaceBasedWidth: measured?.width ?? 0,
          targetGlassesWidth: (measured?.width ?? 0) * productFitMultiplier,
          smoothedGlassesWidth: (filtered?.width ?? 0) * productFitMultiplier,
          productFitMultiplier,
          userScaleAdjustment: c.scale,
          renderedGlassesWidth,
          displayedGlassesWidth:
            renderedGlassesWidth *
            Math.min(target.clientWidth / target.width, target.clientHeight / target.height),
          canvasWidth: target.width,
          canvasHeight: target.height,
          assetSrc: asset.current?.src,
          assetBounds: asset.current?.bounds,
          fallbackAsset: asset.current?.isFallback,
        };
      }
    };
    drawSource();
    render.current();
    report.current({ ready: true });
    async function detectEars(now) {
      if (!earDetector || poseBusy || !asset.current?.leftTemple || !raw.current?.[0]) return;
      if (source.live && (now - lastPoseAt < poseIntervalMs || input.currentTime === lastPoseVideo))
        return;
      poseBusy = true;
      lastPoseAt = now;
      lastPoseVideo = input.currentTime;
      // Keep the face transform from this exact source sample for coordinate
      // fusion, even if the worker finishes after the head has moved.
      const sampledFace = { ...raw.current[0] };
      const sampledGeneration = earGeneration;
      try {
        const result = await earDetector.detect(input, Boolean(source.live), now, {
          x: source.mirrored ? 1 - sampledFace.x / target.width : sampledFace.x / target.width,
          y: sampledFace.y / target.height,
          width: sampledFace.width / target.width,
        });
        if (!active || sampledGeneration !== earGeneration) return;
        posePhotoDetected = !source.live;
        earTracks = updateEarTracking(
          earTracks,
          result?.landmarks,
          sampledFace,
          target.width,
          target.height,
          source.mirrored,
          source.live ? now : performance.now(),
        );
        render.current();
      } finally {
        poseBusy = false;
      }
    }
    async function detect() {
      inFlight = true;
      try {
        const found = await detector.detect(input, Boolean(source.live));
        if (!active) return;
        landmarks.current = displayLandmarks(found?.landmarks, source.mirrored);
        if (found) {
          const now = performance.now();
          if (!faceVisibility(now, lastSeen)) {
            smoothed.current = null;
            pose = null;
            templeVisual = null;
            earTracks = null;
            earAnchors = null;
            earGeneration++;
          }
          lastSeen = now;
          raw.current = faceAnchors(
            landmarks.current,
            target.width,
            target.height,
            options.current.kind,
          );
          if (raw.current?.[0] && options.current.kind === 'sunglasses') {
            pose = resolveHeadPose(pose, found.matrix, raw.current[0].rawYaw, source.mirrored, now);
            Object.assign(raw.current[0], pose);
          }
          if (!smoothed.current) smoothed.current = raw.current;
          if (!source.live) await detectEars(now);
        }
        report.current({ tracking: found ? 'Active' : 'Lost', detectorError: '' });
        render.current();
      } catch {
        failed = true;
        lastSeen = -Infinity;
        raw.current = null;
        smoothed.current = null;
        if (active) {
          report.current({
            tracking: 'Unavailable',
            detectorError:
              'AR unavailable. Face detection could not start. Retry detection, or upload a photo and turn off Auto Align for manual placement.',
          });
          render.current();
        }
        detector.release();
      } finally {
        inFlight = false;
      }
    }
    if (source.live) {
      const tick = (now) => {
        if (!active) return;
        if (input.readyState >= 2) {
          smoothed.current = smoothAnchors(
            smoothed.current,
            raw.current,
            Math.min(100, now - lastRender),
          );
          lastRender = now;
          drawSource();
          render.current();
          if (!document.hidden) void detectEars(now);
          // Up to 30 Hz, never twice on the same decoded video frame.
          if (
            detector &&
            !failed &&
            !document.hidden &&
            !inFlight &&
            now - lastDetection >= trackingConfig.detectionIntervalMs &&
            input.currentTime !== lastVideoTime
          ) {
            lastDetection = now;
            lastVideoTime = input.currentTime;
            void detect();
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else if (detector) {
      void detect();
    }
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      detector?.release();
      earDetector?.release();
      frame.current = null;
      render.current = () => {};
      delete window.__tryOnScaleDebug;
      delete window.__tryOnBridgeDebug;
    };
  }, [source, retry, trackingEnabled, arDebug]);
  return (
    <>
      <canvas
        ref={canvas}
        className="tryon-canvas"
        width="640"
        height="480"
        aria-label="Virtual try-on preview"
        data-tracking-source={source?.live ? 'camera' : 'photo'}
      />
      {arDebug && kind === 'sunglasses' && (
        <svg
          ref={debugLayer}
          className="eyewear-debug"
          aria-hidden="true"
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            visibility: 'hidden',
          }}
        >
          {['#00ffff', '#ff40ff', '#ffff00', '#ffff00', '#00ff80', '#00ff80', '#ff9900'].map(
            (color, i) => (
              <circle
                key={i}
                data-pose-marker={i}
                r={i === 0 ? 6 : 3}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
              />
            ),
          )}
          {[-1, 1].map((side) => (
            <g key={side} data-temple-vector={side}>
              <line stroke="#ff9900" strokeWidth="1" />
              <circle r="4" fill="none" stroke="#ff9900" />
              <circle data-asset-hinge r="2" fill="#00ff80" />
              <line data-asset-axis stroke="#00ffff" strokeWidth="0.7" strokeDasharray="3 3" />
            </g>
          ))}
        </svg>
      )}
      {arDebug && kind === 'sunglasses' && (
        <div
          ref={debugPanel}
          className="eyewear-debug-panel"
          aria-label="AR diagnostics"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            background: '#10231fbb',
            color: 'white',
            padding: '6px 8px',
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.5,
            pointerEvents: 'none',
            maxWidth: 260,
            visibility: 'hidden',
          }}
        >
          {Array.from({ length: 7 }, (_, line) => (
            <div key={line} data-pose-line={line} />
          ))}
        </div>
      )}
      {arDebug && kind === 'sunglasses' && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            zIndex: 2,
            background: '#10231fee',
            color: 'white',
            padding: 8,
            fontSize: 12,
          }}
        >
          <label>
            <input
              type="checkbox"
              aria-label="Force temple visibility"
              checked={forceTemples}
              onChange={(event) => setForceTemples(event.target.checked)}
            />{' '}
            Force real temples visible
          </label>
          <label style={{ marginLeft: 12 }}>
            <input
              type="checkbox"
              aria-label="Enable temple clipping"
              checked={clipTemples}
              disabled={forceTemples}
              onChange={(event) => setClipTemples(event.target.checked)}
            />{' '}
            Temple clipping
          </label>
        </div>
      )}
    </>
  );
});
export default CanvasPreview;
