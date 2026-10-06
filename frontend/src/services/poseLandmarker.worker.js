import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

let model, mode;
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
  const { bitmap, live, timestamp, id, roi } = data;
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
    const started = performance.now();
    const result = live ? model.detectForVideo(bitmap, timestamp) : model.detect(bitmap);
    const landmarks = result.landmarks[0]?.map((p) => ({
      ...p,
      x: roi.x + p.x * roi.width,
      y: roi.y + p.y * roi.height,
    }));
    self.postMessage({
      id,
      timestamp,
      landmarks: landmarks || null,
      inferenceMs: performance.now() - started,
    });
    result.close();
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  } finally {
    bitmap.close();
  }
};
