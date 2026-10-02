// Dedicated worker: Pose's synchronous WASM inference never blocks face fitting
// or the existing animation loop. Exactly one transferable frame is in flight.
export const poseIntervalMs = 1000 / 15;
export function acquirePoseLandmarker() {
  let worker,
    pending,
    released = false,
    sequence = 0,
    failed = false;
  const metrics = { calls: 0, inferenceMs: 0, maxInferenceMs: 0, error: '', lastSampleAt: null };
  return {
    metrics,
    async detect(source, live, timestamp = performance.now(), faceRegion = null) {
      if (released || failed || pending) return null;
      // Reserve before createImageBitmap awaits, preventing overlapping captures.
      let resolvePending;
      const result = new Promise((resolve) => {
        resolvePending = resolve;
      });
      pending = resolvePending;
      try {
        if (!worker) {
          worker = new Worker(new URL('./poseLandmarker.worker.js', import.meta.url), {
            type: 'module',
          });
          worker.onmessage = ({ data }) => {
            if (data.error) {
              failed = true;
              metrics.error = data.error;
            } else {
              metrics.calls++;
              metrics.inferenceMs = data.inferenceMs;
              metrics.maxInferenceMs = Math.max(metrics.maxInferenceMs, data.inferenceMs);
              metrics.lastSampleAt = data.timestamp;
            }
            const finish = pending;
            pending = null;
            finish?.(data.error ? null : data);
          };
          worker.onerror = (error) => {
            failed = true;
            metrics.error = error.message || 'Pose worker unavailable';
            const finish = pending;
            pending = null;
            finish?.(null);
          };
        }
        const width = source.videoWidth || source.naturalWidth || source.width;
        const height = source.videoHeight || source.naturalHeight || source.height;
        const roi =
          faceRegion && faceRegion.width < 0.35
            ? {
                x: Math.max(0, Math.floor((faceRegion.x - faceRegion.width * 1.25) * width)),
                y: Math.max(0, Math.floor(faceRegion.y * height - faceRegion.width * width * 0.9)),
                width: Math.min(width, Math.round(faceRegion.width * width * 2.5)),
                height: Math.min(height, Math.round(faceRegion.width * width * 3)),
              }
            : { x: 0, y: 0, width, height };
        roi.width = Math.min(roi.width, width - roi.x);
        roi.height = Math.min(roi.height, height - roi.y);
        const ratio = Math.min(1, 640 / Math.max(roi.width, roi.height));
        const bitmap = await createImageBitmap(source, roi.x, roi.y, roi.width, roi.height, {
          resizeWidth: Math.max(1, Math.round(roi.width * ratio)),
          resizeHeight: Math.max(1, Math.round(roi.height * ratio)),
          resizeQuality: 'low',
        });
        if (released) {
          bitmap.close();
          resolvePending(null);
          return result;
        }
        worker.postMessage(
          {
            bitmap,
            live,
            timestamp,
            roi: {
              x: roi.x / width,
              y: roi.y / height,
              width: roi.width / width,
              height: roi.height / height,
            },
            id: ++sequence,
          },
          [bitmap],
        );
      } catch (error) {
        failed = true;
        metrics.error = String(error);
        pending = null;
        resolvePending(null);
      }
      return result;
    },
    release() {
      released = true;
      worker?.terminate();
      worker = null;
      pending?.(null);
      pending = null;
    },
  };
}
