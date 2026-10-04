import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useNecklaceTracking } from '../../hooks/useNecklaceTracking.js';
import { necklaceVisibility } from './necklaceGeometry.js';

const copy = (canvas) => {
  const result = Object.assign(document.createElement('canvas'), {
    width: canvas.width,
    height: canvas.height,
  });
  result.getContext('2d').drawImage(canvas, 0, 0);
  return result;
};

const loadAsset = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Necklace asset could not be loaded.'));
    image.src = src;
  });

export default forwardRef(function NecklaceOverlay({ source, overlay, retry, onStatus }, ref) {
  const canvas = useRef(null),
    original = useRef(null),
    asset = useRef(null),
    render = useRef(() => {}),
    reported = useRef({});
  const report = useRef(null);
  report.current = (patch) => {
    if (Object.keys(patch).every((key) => reported.current[key] === patch[key])) return;
    reported.current = { ...reported.current, ...patch };
    onStatus(patch);
  };
  const dimensions = useMemo(() => {
    const el = source?.element;
    const w = el?.videoWidth || el?.naturalWidth || el?.width || 640;
    const h = el?.videoHeight || el?.naturalHeight || el?.height || 480;
    const ratio = Math.min(1, 1280 / Math.max(w, h));
    return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
  }, [source]);
  const { track, sample } = useNecklaceTracking(
    source,
    dimensions,
    (patch) => report.current(patch),
    () => render.current(),
    retry,
  );

  useImperativeHandle(
    ref,
    () => ({
      snapshot() {
        if (!original.current || !canvas.current) return null;
        return { original: copy(original.current), result: copy(canvas.current) };
      },
    }),
    [],
  );

  useEffect(() => {
    let active = true;
    asset.current = null;
    report.current({ assetReady: false, assetError: '' });
    loadAsset(overlay)
      .then((image) => {
        if (!active) return;
        asset.current = image;
        report.current({ assetReady: true, assetError: '' });
        render.current();
      })
      .catch((error) => {
        if (active) report.current({ assetReady: false, assetError: error.message });
      });
    return () => {
      active = false;
    };
  }, [overlay, retry]);

  useEffect(() => {
    const target = canvas.current;
    target.width = dimensions.width;
    target.height = dimensions.height;
    const ctx = target.getContext('2d');
    const input = source?.element;
    let active = true,
      raf = 0,
      lastFrame = -Infinity;
    original.current = null;
    delete reported.current.ready;
    if (!input || !ctx) {
      ctx?.clearRect(0, 0, target.width, target.height);
      render.current = () => {};
      return;
    }
    const frame = Object.assign(document.createElement('canvas'), dimensions);
    const frameCtx = frame.getContext('2d');
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
      if (source.composite) {
        ctx.drawImage(source.composite, 0, 0, target.width, target.height);
      } else {
        const geometry = track.current?.geometry;
        const visibility = source.live ? necklaceVisibility(track.current, performance.now()) : geometry ? 1 : 0;
        if (asset.current && geometry && visibility > 0) {
          ctx.save();
          ctx.globalAlpha = visibility;
          ctx.translate(geometry.center.x, geometry.center.y);
          ctx.rotate(geometry.rotation);
          ctx.scale(geometry.xCompression, 1);
          ctx.drawImage(
            asset.current,
            -geometry.width / 2,
            -geometry.height * 0.24,
            geometry.width,
            geometry.height,
          );
          ctx.restore();
        }
      }
      report.current({ ready: true });
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
    };
  }, [source, dimensions, retry]);

  return <canvas ref={canvas} className="tryon-canvas" aria-label="Necklace try-on canvas" />;
});
