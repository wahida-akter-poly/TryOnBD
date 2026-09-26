import { forwardRef, useEffect, useState } from 'react';

export const overlayFor = (mode, categoryId) =>
  `/assets/overlay-${mode === 'CLOTHING' ? 'clothing' : mode === 'SUNGLASSES' ? 'glasses' : categoryId === 8 ? 'earrings' : 'necklace'}.svg`;
export const defaultsFor = (mode) => ({
  x: 50,
  y: mode === 'CLOTHING' ? 78 : mode === 'SUNGLASSES' ? 41 : 68,
  scale: mode === 'CLOTHING' ? 1 : 0.9,
  rotation: 0,
  opacity: 90,
});
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('This image could not be opened. Try a PNG, JPEG, or WebP photo.'));
    image.src = src;
  });
}
const CanvasPreview = forwardRef(function CanvasPreview(
  { photo, overlay, controls, view, compare, onError },
  ref,
) {
  const [assets, setAssets] = useState(null);
  useEffect(() => {
    let current = true;
    setAssets(null);
    if (!photo) return;
    Promise.all([loadImage(photo), loadImage(overlay)])
      .then((images) => {
        if (current) setAssets(images);
      })
      .catch((e) => {
        if (current) onError(e.message);
      });
    return () => {
      current = false;
    };
  }, [photo, overlay, onError]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onError('Canvas is unavailable in this browser.');
      return;
    }
    ctx.clearRect(0, 0, 720, 900);
    ctx.fillStyle = '#e6e3da';
    ctx.fillRect(0, 0, 720, 900);
    if (!assets) return;
    const [person, asset] = assets;
    const ratio = Math.min(720 / person.width, 900 / person.height);
    ctx.drawImage(
      person,
      (720 - person.width * ratio) / 2,
      (900 - person.height * ratio) / 2,
      person.width * ratio,
      person.height * ratio,
    );
    if (view === 'before') return;
    ctx.save();
    if (view === 'compare') {
      ctx.beginPath();
      ctx.rect((720 * compare) / 100, 0, 720, 900);
      ctx.clip();
    }
    ctx.translate(controls.x * 7.2, controls.y * 9);
    ctx.rotate((controls.rotation * Math.PI) / 180);
    ctx.globalAlpha = controls.opacity / 100;
    const width = asset.width * controls.scale;
    const height = asset.height * controls.scale;
    ctx.drawImage(asset, -width / 2, -height / 2, width, height);
    ctx.restore();
    if (view === 'compare') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo((720 * compare) / 100, 0);
      ctx.lineTo((720 * compare) / 100, 900);
      ctx.stroke();
    }
  }, [assets, controls, view, compare, ref, onError]);
  return (
    <canvas
      ref={ref}
      width="720"
      height="900"
      className="tryon-canvas"
      aria-label="Manual try-on preview with an adjustable demo overlay"
    />
  );
});
export default CanvasPreview;
