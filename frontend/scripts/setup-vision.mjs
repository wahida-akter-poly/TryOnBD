import { cp, mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'public/mediapipe');
await mkdir(destination, { recursive: true });
await cp(
  path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
  path.join(destination, 'wasm'),
  { recursive: true, force: false, errorOnExist: false },
);
const model = path.join(destination, 'face_landmarker.task');
try {
  await access(model);
} catch {
  const response = await fetch(
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  );
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  await writeFile(model, Buffer.from(await response.arrayBuffer()));
}
const poseModel = path.join(destination, 'pose_landmarker_lite.task');
try {
  await access(poseModel);
} catch {
  const response = await fetch(
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  );
  if (!response.ok) throw new Error(`Pose model download failed: HTTP ${response.status}`);
  await writeFile(poseModel, Buffer.from(await response.arrayBuffer()));
}
console.log(
  'MediaPipe WASM, version 1 face model and lite pose model (including person segmentation) ready in public/mediapipe.',
);
