import { useCallback, useEffect, useRef, useState } from 'react';

export function useTryOnCamera(video, onSource) {
  const stream = useRef(null),
    attempt = useRef(0),
    mounted = useRef(true);
  const [status, setStatus] = useState('Camera Off');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const deviceId = useRef('');
  const starting = useRef(false);
  const stop = useCallback(() => {
    attempt.current += 1;
    starting.current = false;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
    }
    if (mounted.current) setStatus('Camera Off');
  }, [video]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, [stop]);
  const start = useCallback(
    async (nextDevice = '') => {
      if (starting.current || (stream.current && !nextDevice)) return;
      stop();
      onSource(null);
      setError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Camera Error');
        setError('Camera is unavailable. Use localhost or HTTPS, or upload a photo.');
        return;
      }
      const token = attempt.current;
      starting.current = true;
      setStatus('Requesting Permission');
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(nextDevice ? { deviceId: { exact: nextDevice } } : { facingMode: 'user' }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
        });
        if (!mounted.current || token !== attempt.current) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = next;
        const element = video.current;
        element.srcObject = next;
        await element.play();
        if (!mounted.current || token !== attempt.current) return;
        const settings = next.getVideoTracks()[0].getSettings();
        deviceId.current = settings.deviceId;
        starting.current = false;
        setStatus('Camera Active');
        onSource({
          element,
          live: true,
          mirrored: settings.facingMode !== 'environment',
          kind: 'camera',
        });
        next.getVideoTracks()[0].onended = () => {
          if (token !== attempt.current || !mounted.current) return;
          stop();
          onSource(null);
          setStatus('Camera Error');
          setError('Camera disconnected. Reconnect it and retry.');
        };
        navigator.mediaDevices
          .enumerateDevices()
          .then((list) => {
            if (mounted.current && token === attempt.current)
              setDevices(list.filter((d) => d.kind === 'videoinput'));
          })
          .catch(() => {});
      } catch (e) {
        if (!mounted.current || token !== attempt.current) return;
        stop();
        setStatus(e.name === 'NotAllowedError' ? 'Permission Denied' : 'Camera Error');
        setError(
          e.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow access in your browser settings or upload a photo.'
            : e.name === 'NotFoundError'
              ? 'No camera found. Connect a camera or upload a photo.'
              : 'Could not open the camera. Close other apps using it and retry, or upload a photo.',
        );
      }
    },
    [stop, video, onSource],
  );
  return {
    status,
    error,
    devices,
    stop,
    start,
    clearError: () => setError(''),
    switchCamera: () =>
      start(
        devices[(devices.findIndex((d) => d.deviceId === deviceId.current) + 1) % devices.length]
          ?.deviceId,
      ),
  };
}
