import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let pending;
let users = 0;
let disposeTimer;
let mode = 'IMAGE';
let queue = Promise.resolve();

function initialize(initialMode) {
  if (!pending) {
    const base = import.meta.env.BASE_URL;
    pending = FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`)
      .then(async (fileset) => {
        const create = (delegate) =>
          FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: `${base}mediapipe/face_landmarker.task`, delegate },
            runningMode: initialMode,
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: true,
          });
        try {
          return await create('GPU');
        } catch {
          return create('CPU');
        }
      })
      .then((model) => {
        mode = initialMode;
        return model;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

// One shared initialization, serialized IMAGE/VIDEO transitions, and delayed
// disposal so React StrictMode cannot create duplicate WASM models.
export function acquireFaceLandmarker() {
  users += 1;
  clearTimeout(disposeTimer);
  let released = false;
  return {
    detect(source, live) {
      const task = queue.then(async () => {
        if (released) return null;
        const next = live ? 'VIDEO' : 'IMAGE';
        const model = await initialize(next);
        if (released) return null;
        if (mode !== next) {
          await model.setOptions({ runningMode: next });
          mode = next;
        }
        const result = live
          ? model.detectForVideo(source, performance.now())
          : model.detect(source);
        const landmarks = result.faceLandmarks[0];
        return landmarks
          ? { landmarks, matrix: result.facialTransformationMatrixes?.[0] ?? null }
          : null;
      });
      queue = task.catch(() => {});
      return task;
    },
    release() {
      if (released) return;
      released = true;
      users -= 1;
      disposeTimer = setTimeout(async () => {
        await queue;
        if (!users && pending) {
          const model = await pending.catch(() => null);
          if (!users) {
            model?.close();
            pending = null;
          }
        }
      }, 1000);
    },
  };
}
