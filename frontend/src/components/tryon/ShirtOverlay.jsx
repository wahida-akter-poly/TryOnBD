import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { usePoseTracking } from '../../hooks/usePoseTracking.js';
import { loadShirtAsset } from './shirtAssets.js';
import { drawShirt } from './shirtWarp.js';
import { shirtVisibility } from './shirtGeometry.js';
import { torsoPanelPoint } from './structuredShirtGeometry.js';
import { armOcclusionMasks, capsulePolygon } from './shirtOcclusion.js';

const copy = (canvas) => {
  const result = Object.assign(document.createElement('canvas'), {
    width: canvas.width,
    height: canvas.height,
  });
  result.getContext('2d').drawImage(canvas, 0, 0);
  return result;
};
export default forwardRef(function ShirtOverlay({ source, fit, arDebug, retry, onStatus }, ref) {
  const canvas = useRef(null),
    original = useRef(null),
    asset = useRef(null);
  const render = useRef(() => {}),
    diagnostics = useRef(null),
    reported = useRef({}),
    lastDebug = useRef(-Infinity);
  const report = useRef(null);
  report.current = (patch) => {
    if (Object.keys(patch).every((k) => reported.current[k] === patch[k])) return;
    reported.current = { ...reported.current, ...patch };
    onStatus(patch);
  };
  const dimensions = useMemo(() => {
    const el = source?.element,
      w = el?.videoWidth || el?.naturalWidth || el?.width || 640;
    const h = el?.videoHeight || el?.naturalHeight || el?.height || 480;
    const ratio = Math.min(1, 1280 / Math.max(w, h));
    return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
  }, [source]);
  const { track, sample, metrics } = usePoseTracking(
    source,
    fit,
    dimensions,
    (patch) => report.current(patch),
    () => {
      lastDebug.current = -Infinity;
      render.current();
    },
    retry,
  );
  useImperativeHandle(
    ref,
    () => ({
      snapshot() {
        if (!original.current || !canvas.current) return null;
        // Both capture and download copy the exact displayed canvas. DOM diagnostics
        // are separate and cannot leak into the exported PNG.
        return { original: copy(original.current), result: copy(canvas.current) };
      },
    }),
    [],
  );
  useEffect(() => {
    let active = true,
      timer,
      attempt = 0;
    asset.current = null;
    report.current({ assetReady: false, assetError: '', assetCode: '', assetNotice: '' });
    const load = async () => {
      try {
        const path = attempt
          ? `${fit.asset}${fit.asset.includes('?') ? '&' : '?'}arRetry=${attempt}`
          : fit.asset;
        const loaded = await loadShirtAsset(path);
        if (!active) return;
        asset.current = loaded;
        report.current({ assetReady: true, assetError: '', assetCode: '' });
        render.current();
      } catch (error) {
        if (!active) return;
        report.current({ assetReady: false, assetError: error.message, assetCode: error.code });
        // A supplied file becomes available without architecture changes or a
        // model/camera restart. Failed image loads are never cached as assets.
        timer = setTimeout(() => {
          attempt++;
          void load();
        }, 4000);
      }
    };
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fit.asset, retry]);
  useEffect(() => {
    const target = canvas.current;
    target.width = dimensions.width;
    target.height = dimensions.height;
    const ctx = target.getContext('2d'),
      input = source?.element;
    let active = true,
      raf = 0,
      lastFrame = -Infinity;
    const renderTimes = [];
    let renderHz = 0;
    original.current = null;
    lastDebug.current = -Infinity;
    // The page resets readiness on source changes (including capture). The
    // status cache must permit readiness to be reported for the new canvas.
    delete reported.current.ready;
    delete window.__tryOnShirtDebug;
    if (!input || !ctx) {
      ctx?.clearRect(0, 0, target.width, target.height);
      render.current = () => {};
      return;
    }
    const frame = Object.assign(document.createElement('canvas'), dimensions),
      frameCtx = frame.getContext('2d');
    const drawSource = () => {
      frameCtx.save();
      if (source.mirrored) {
        frameCtx.translate(frame.width, 0);
        frameCtx.scale(-1, 1);
      }
      frameCtx.drawImage(input, 0, 0, frame.width, frame.height);
      frameCtx.restore();
      original.current = frame;
    };
    render.current = () => {
      if (!active || !original.current) return;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(frame, 0, 0);
      const visibility = source.live
        ? shirtVisibility(track.current, performance.now())
        : track.current?.geometry
          ? 1
          : 0;
      let mesh;
      if (source.composite) ctx.drawImage(source.composite, 0, 0, target.width, target.height);
      else mesh = drawShirt(ctx, asset.current, track.current?.geometry, fit, visibility, frame);
      const renderedAt = performance.now();
      renderTimes.push(renderedAt);
      while (renderTimes.length > 2 && renderedAt - renderTimes[0] > 3000) renderTimes.shift();
      renderHz =
        renderTimes.length > 1
          ? ((renderTimes.length - 1) * 1000) / (renderedAt - renderTimes[0])
          : 0;
      report.current({ ready: true });
      const g = track.current?.geometry,
        garment = mesh?.garment;
      // Keep frame inspection atomic with its pixels. Only DOM updates are
      // throttled; an older geometry snapshot can misidentify mask edges.
      if (arDebug)
        window.__tryOnShirtDebug = {
          geometry: g,
          visibility,
          assetCode: reported.current.assetCode,
          rendered: !!asset.current,
          garment,
          performance: { ...metrics.current, renderHz },
          silhouette: g?.silhouette,
        };
      if (arDebug && performance.now() - lastDebug.current > 100) {
        lastDebug.current = performance.now();
        const panel = diagnostics.current;
        if (panel) {
          panel.style.visibility = g && visibility > 0 && !source.composite ? 'visible' : 'hidden';
          if (g) {
            const svg = panel.querySelector('svg');
            svg.setAttribute('viewBox', `0 0 ${target.width} ${target.height}`);
            const pts = [
              g.left.shoulder,
              g.right.shoulder,
              g.left.hip,
              g.right.hip,
              g.left.elbow,
              g.right.elbow,
              g.shoulderMidpoint,
              g.collar,
              g.left.wrist,
              g.right.wrist,
              garment?.neckBaseCenter,
              garment?.leftNeckAnchor,
              garment?.rightNeckAnchor,
              garment?.seamLeft,
              garment?.seamRight,
              garment?.collarCenterTop,
              garment?.collarCenterBottom,
              garment?.leftSleeve.cuffCenter,
              garment?.rightSleeve.cuffCenter,
              garment?.torso.rows.at(-1).left,
              garment?.torso.rows.at(-1).right,
            ];
            svg.querySelectorAll('[data-destination-point]').forEach((node, i) => {
              node.style.visibility = pts[i] ? 'visible' : 'hidden';
              if (pts[i]) {
                node.setAttribute('cx', pts[i].x);
                node.setAttribute('cy', pts[i].y);
              }
            });
            panel
              .querySelector('polygon')
              .setAttribute(
                'points',
                (garment
                  ? [
                      ...garment.torso.rows.map((r) => r.left),
                      ...garment.torso.rows.map((r) => r.right).reverse(),
                    ]
                  : g.quad
                )
                  .map((p) => `${p.x},${p.y}`)
                  .join(' '),
              );
            const lines = [];
            if (mesh) {
              for (const row of mesh.torso.vertices) lines.push(row);
              for (let i = 0; i < mesh.torso.us.length; i++)
                lines.push(mesh.torso.vertices.map((row) => row[i]));
              for (const side of ['leftSleeve', 'rightSleeve'])
                lines.push([garment[side].seamTop, garment[side].cuffCenter]);
            }
            panel
              .querySelector('[data-shirt-mesh]')
              .setAttribute(
                'd',
                lines.map((points) => 'M' + points.map((p) => `${p.x},${p.y}`).join('L')).join(' '),
              );
            const path = (points, closed = false) =>
              points.length
                ? 'M' + points.map((p) => `${p.x},${p.y}`).join('L') + (closed ? 'Z' : '')
                : '';
            const boundaries = [],
              overlaps = [];
            if (garment && asset.current) {
              const s = fit.sourceLandmarks,
                bounds = asset.current.bounds;
              for (const side of ['left', 'right']) {
                const a = s[`${side}ShoulderSeam`],
                  b = s[`${side}Armpit`];
                const dx = (b.x - a.x) * bounds.width,
                  dy = (b.y - a.y) * bounds.height;
                const half =
                  ((s.rightShoulderSeam.x - s.leftShoulderSeam.x) *
                    bounds.width *
                    fit.seamOverlapRatio) /
                  2;
                const span = Math.hypot(dx, dy);
                const du = ((dy / span) * half) / bounds.width,
                  dv = ((-dx / span) * half) / bounds.height;
                const samples = Array.from({ length: 9 }, (_, i) => ({
                  x: a.x + ((b.x - a.x) * i) / 8,
                  y: a.y + ((b.y - a.y) * i) / 8,
                }));
                boundaries.push(path(samples.map((p) => torsoPanelPoint(p.x, p.y, garment, fit))));
                overlaps.push(
                  path(
                    [
                      ...samples.map((p) => torsoPanelPoint(p.x + du, p.y + dv, garment, fit)),
                      ...[...samples]
                        .reverse()
                        .map((p) => torsoPanelPoint(p.x - du, p.y - dv, garment, fit)),
                    ],
                    true,
                  ),
                );
              }
              boundaries.push(
                path([garment.torso.rows.at(-1).left, garment.torso.rows.at(-1).right]),
              );
              const sourcePanel = panel.querySelector('[data-shirt-source]');
              const image = asset.current.image;
              sourcePanel.setAttribute(
                'viewBox',
                `0 0 ${image.naturalWidth} ${image.naturalHeight}`,
              );
              const sourceImage = sourcePanel.querySelector('image');
              if (sourceImage.getAttribute('href') !== fit.asset)
                sourceImage.setAttribute('href', fit.asset);
              sourcePanel.querySelectorAll('circle').forEach((node, i) => {
                const p = [s.collarLeft, s.collarCenterTop, s.collarCenterBottom, s.collarRight][i];
                node.setAttribute('cx', bounds.x + p.x * bounds.width);
                node.setAttribute('cy', bounds.y + p.y * bounds.height);
              });
            }
            svg.querySelector('[data-shirt-seams]').setAttribute('d', boundaries.join(' '));
            svg.querySelector('[data-shirt-overlap]').setAttribute('d', overlaps.join(' '));
            svg.querySelector('[data-shirt-arm-masks]').setAttribute(
              'd',
              garment
                ? armOcclusionMasks(g, garment, fit)
                    .map((m) => path(capsulePolygon(m), true))
                    .join(' ')
                : '',
            );
            const measuredRows = g.silhouette?.diagnostics?.rows || [];
            svg
              .querySelector('[data-shirt-corridor]')
              .setAttribute(
                'd',
                measuredRows.map((r) => path([r.corridorLeft, r.corridorRight])).join(' '),
              );
            svg.querySelector('[data-shirt-silhouette]').setAttribute(
              'd',
              measuredRows
                .filter((r) => r.left && r.right)
                .map((r) => path([r.left, r.right]))
                .join(' '),
            );
            svg
              .querySelector('[data-shirt-outer-shoulders]')
              .setAttribute('d', garment ? path(garment.outerShoulders) : '');
            const widths = garment?.widths;
            panel.querySelector('[data-shirt-values]').textContent =
              `Shoulders ${g.shoulderWidth.toFixed(1)}px · Torso ${g.torsoHeight.toFixed(1)}px\nRoll ${((g.roll * 180) / Math.PI).toFixed(1)}° · Yaw ${g.yaw.toFixed(1)}°\n${garment?.trackingMode || 'POSE_ONLY'} · Pose ${g.trackingMode}\nChest ${(widths?.[0.24] || 0).toFixed(1)} · Waist ${(widths?.[0.74] || 0).toFixed(1)} · Hip ${(widths?.[1] || 0).toFixed(1)}px\nMask ${(g.silhouette?.quality || 0).toFixed(2)} · Pose fallback ${garment?.trackingMode !== 'SILHOUETTE_FUSED'}\nPose ${metrics.current.poseHz.toFixed(1)}Hz · Mask ${metrics.current.segmentationHz.toFixed(1)}Hz · Render ${renderHz.toFixed(1)}Hz`;
          }
        }
      }
    };
    drawSource();
    render.current();
    void sample.current(performance.now());
    if (source.live) {
      const tick = (now) => {
        if (!active) return;
        if (now - lastFrame >= 1000 / 30) {
          lastFrame = now;
          drawSource();
          void sample.current(now);
          render.current();
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      render.current = () => {};
      delete window.__tryOnShirtDebug;
    };
  }, [source, dimensions, fit, arDebug, retry]);
  return (
    <>
      <canvas ref={canvas} className="tryon-canvas" aria-label="T-shirt try-on canvas" />
      {arDebug && (
        <div
          ref={diagnostics}
          aria-label="Shirt AR diagnostics"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', visibility: 'hidden' }}
        >
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <polygon fill="none" stroke="#00e6be" strokeWidth="2" />
            <path data-shirt-mesh fill="none" stroke="#ffcb55" strokeWidth="0.7" />
            <path data-shirt-overlap fill="#00e6be33" stroke="none" />
            <path data-shirt-seams fill="none" stroke="#e9ff81" strokeWidth="2" />
            <path data-shirt-arm-masks fill="none" stroke="#ff836d" strokeWidth="1" />
            <path data-shirt-corridor fill="none" stroke="#a6a6ff" strokeWidth="0.6" />
            <path data-shirt-silhouette fill="none" stroke="#5effa5" strokeWidth="2" />
            <path data-shirt-outer-shoulders fill="none" stroke="#ff75df" strokeWidth="2" />
            {Array.from({ length: 21 }, (_, i) => (
              <circle
                data-destination-point
                key={i}
                r="4"
                fill={i >= 15 && i <= 16 ? '#ffcb55' : '#00e6be'}
              />
            ))}
          </svg>
          <svg
            data-shirt-source
            aria-label="Collar source points"
            width="180"
            height="170"
            style={{ position: 'absolute', top: 8, left: 8, background: '#10231fe8' }}
          >
            <image width="100%" height="100%" />
            {Array.from({ length: 4 }, (_, i) => (
              <circle key={i} r="8" fill="#ffcb55" />
            ))}
          </svg>
          <div
            data-shirt-values
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              whiteSpace: 'pre-line',
              background: '#10231fe8',
              color: 'white',
              padding: 8,
              fontSize: 11,
            }}
          />
        </div>
      )}
    </>
  );
});
