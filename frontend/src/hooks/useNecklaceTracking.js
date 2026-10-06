import { useEffect, useRef } from 'react';
import { acquirePoseLandmarker, poseIntervalMs } from '../services/poseLandmarker.js';
import { measureNecklace, updateNecklaceTracking } from '../components/tryon/necklaceGeometry.js';

export function useNecklaceTracking(source, dimensions, onStatus, onSample, retry, calibration) {
  const track = useRef(null),
    sample = useRef(() => {}),
    callbacks = useRef({ onStatus, onSample });
  callbacks.current = { onStatus, onSample };

  useEffect(() => {
    track.current = null;
    let active = true,
      busy = false,
      lastAt = -Infinity,
      lastVideo = -1,
      photoDone = false;
    const detector =
      source && !source.composite ? acquirePoseLandmarker({ segmentation: false }) : null;
    callbacks.current.onStatus({
      tracking: !source
        ? 'Waiting for input'
        : source.composite
          ? 'Captured'
          : 'Loading pose detector',
      detectorError: '',
      bodyNotice: '',
    });
    sample.current = async (now) => {
      if (!detector || !active || busy || photoDone || now - lastAt < poseIntervalMs) return;
      const input = source.element;
      const videoTime = input.currentTime;
      if (source.live && Number.isFinite(videoTime) && videoTime === lastVideo) return;
      busy = true;
      lastAt = now;
      lastVideo = videoTime;
      try {
        const result = await detector.detect(input, source.live, now);
        if (!active) return;
        if (detector.metrics.error) {
          photoDone = true;
          callbacks.current.onStatus({
            tracking: 'Unavailable',
            detectorError: 'Body tracking is unavailable. Retry fitting or use another photo.',
          });
          return;
        }
        const measured = measureNecklace(
          result,
          dimensions.width,
          dimensions.height,
          source.mirrored,
          calibration,
        );
        const completed = performance.now();
        track.current = updateNecklaceTracking(track.current, measured, completed, source.live);
        callbacks.current.onStatus({
          tracking: measured ? 'Active' : 'Lost',
          bodyNotice: measured ? '' : 'Keep both shoulders in view.',
        });
        if (!source.live) photoDone = true;
        callbacks.current.onSample();
      } catch {
        if (active)
          callbacks.current.onStatus({
            tracking: 'Unavailable',
            detectorError: 'Body tracking is unavailable. Retry fitting or use another photo.',
          });
      } finally {
        busy = false;
      }
    };
    return () => {
      active = false;
      sample.current = () => {};
      detector?.release();
    };
  }, [source, dimensions.width, dimensions.height, retry, calibration]);

  return { track, sample };
}
