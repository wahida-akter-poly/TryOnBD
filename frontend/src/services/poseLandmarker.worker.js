import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

let model,
  mode,
  masksEnabled = false,
  maskUnavailable = false;
// tasks-vision 0.10.32's loader falls back to self.import in module workers.
// Its installed classic WASM glue declares ModuleFactory rather than exporting
// it; evaluate that same-origin runtime and expose its factory in this worker.
self.import = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`WASM loader: HTTP ${response.status}`);
  const code = await response.text();
  self.ModuleFactory = Function(`${code}\nreturn ModuleFactory;`)();
};
self.onmessage = async ({ data }) => {
  const { bitmap, live, timestamp, id, roi, segmentation = false } = data;
  try {
    const next = live ? 'VIDEO' : 'IMAGE';
    if (!model) {
      const files = await FilesetResolver.forVisionTasks(`${self.location.origin}/mediapipe/wasm`);
      model = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${self.location.origin}/mediapipe/pose_landmarker_lite.task`,
          delegate: 'CPU',
        },
        runningMode: next,
        numPoses: 1,
        outputSegmentationMasks: false,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      mode = next;
    }
    if (mode !== next) {
      await model.setOptions({ runningMode: next });
      mode = next;
    }
    // Shirt-only opt-in. The lite Pose task already contains its person-mask
    // head; there is no second task/model/inference or change to landmarks.
    let segmentationError = '';
    if (masksEnabled !== segmentation && !maskUnavailable) {
      try {
        await model.setOptions({ outputSegmentationMasks: segmentation });
        masksEnabled = segmentation;
      } catch (error) {
        segmentationError = String(error);
        // A mask failure must not take away the existing pose-only fit.
        await model.setOptions({ outputSegmentationMasks: false });
        masksEnabled = false;
        maskUnavailable = true;
      }
    }
    const started = performance.now();
    const result = live ? model.detectForVideo(bitmap, timestamp) : model.detect(bitmap);
    const landmarks = result.landmarks[0]?.map((p) => ({
      ...p,
      x: roi.x + p.x * roi.width,
      y: roi.y + p.y * roi.height,
    }));
    const maskStarted = performance.now();
    let personMask = null;
    try {
      const mask = segmentation && result.segmentationMasks?.[0];
      if (mask) {
        // Copy before closing the MediaPipe-owned result; transfer the copy.
        const values = mask.getAsFloat32Array();
        const ratio = Math.min(1, 256 / Math.max(mask.width, mask.height));
        const width = Math.max(1, Math.round(mask.width * ratio)),
          height = Math.max(1, Math.round(mask.height * ratio));
        const pixels = new Uint8Array(width * height);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            pixels[y * width + x] = Math.round(
              values[
                Math.min(mask.height - 1, Math.floor(((y + 0.5) * mask.height) / height)) *
                  mask.width +
                  Math.min(mask.width - 1, Math.floor(((x + 0.5) * mask.width) / width))
              ] * 255,
            );
        personMask = { width, height, pixels, roi };
      }
    } catch (error) {
      segmentationError = String(error);
    }
    self.postMessage(
      {
        id,
        timestamp,
        landmarks: landmarks || null,
        // Preserve the existing image-space result for eyewear diagnostics.
        // Shirts optionally use world-space shoulder/hip depth, in metres.
        worldLandmarks: result.worldLandmarks?.[0] || null,
        segmentation: personMask,
        segmentationMs: performance.now() - maskStarted,
        segmentationError,
        inferenceMs: performance.now() - started,
      },
      personMask ? [personMask.pixels.buffer] : [],
    );
    result.close();
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  } finally {
    bitmap.close();
  }
};
