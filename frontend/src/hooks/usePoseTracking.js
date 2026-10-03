import { useEffect, useRef } from 'react';
import { acquirePoseLandmarker, poseIntervalMs } from '../services/poseLandmarker.js';
import { measureTorso, updateShirtTracking } from '../components/tryon/shirtGeometry.js';
import {
  measureTorsoSilhouette,
  updateSilhouetteTracking,
  silhouetteSnapshot,
} from '../components/tryon/shirtSilhouette.js';

// Inference scheduler only. The preview owns the sole animation loop and camera
// source; this hook does not open streams, schedule RAFs or set per-frame state.
export function usePoseTracking(source, fit, dimensions, onStatus, onSample, retry) {
  const track = useRef(null),
    sample = useRef(() => {}),
    callbacks = useRef({ onStatus, onSample }),
    metrics = useRef({ poseHz: 0, segmentationHz: 0 });
  callbacks.current = { onStatus, onSample };
  useEffect(() => {
    track.current = null;
    let active = true,
      busy = false,
      lastAt = -Infinity,
      lastVideo = -1,
      photoDone = false;
    const detector =
      source && !source.composite ? acquirePoseLandmarker({ segmentation: true }) : null;
    const poseTimes = [],
      maskTimes = [];
    metrics.current = { poseHz: 0, segmentationHz: 0, poseCalls: 0, segmentationCalls: 0 };
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
      const input = source.element,
        videoTime = input.currentTime;
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
        const measured = measureTorso(
          result,
          dimensions.width,
          dimensions.height,
          source.mirrored,
          { allowShoulderFallback: true, previous: track.current?.body, fit },
        );
        const previous = track.current;
        track.current = updateShirtTracking(
          track.current,
          measured,
          fit,
          performance.now(),
          source.live,
        );
        const completed = performance.now();
        const silhouette =
          !measured.error &&
          !track.current?.error &&
          track.current?.geometry &&
          result?.segmentation
            ? measureTorsoSilhouette(
                result.segmentation,
                track.current.geometry,
                fit,
                dimensions,
                source.mirrored,
              )
            : null;
        const silhouetteState = updateSilhouetteTracking(
          previous?.silhouetteState,
          silhouette,
          completed,
          source.live,
          fit.silhouette,
        );
        track.current.silhouetteState = silhouetteState;
        if (track.current.geometry)
          track.current.geometry = {
            ...track.current.geometry,
            silhouette: silhouetteSnapshot(silhouetteState, completed, fit.silhouette),
          };
        poseTimes.push(completed);
        if (result?.segmentation) maskTimes.push(completed);
        const rate = (times) => {
          while (times.length > 2 && completed - times[0] > 3000) times.shift();
          return times.length > 1 ? ((times.length - 1) * 1000) / (times.at(-1) - times[0]) : 0;
        };
        metrics.current = {
          ...detector.metrics,
          poseHz: rate(poseTimes),
          segmentationHz: rate(maskTimes),
          poseCalls: detector.metrics.calls,
          segmentationCalls: detector.metrics.segmentationCalls,
          silhouetteQuality: silhouette?.quality || 0,
        };
        callbacks.current.onStatus({
          tracking: measured.error ? 'Lost' : 'Active',
          bodyNotice:
            measured.error ||
            (measured.trackingMode === 'SHOULDERS_ONLY'
              ? 'Stand back to include your waist for a closer fit.'
              : ''),
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
  }, [source, fit, dimensions.width, dimensions.height, retry]);
  return { track, sample, metrics };
}
