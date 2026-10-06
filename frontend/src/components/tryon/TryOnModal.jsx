import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, X } from 'lucide-react';

const Studio = lazy(() => import('../../pages/public/TryOn.jsx').then((module) => ({ default: module.TryOnStudio })));

export default function TryOnModal({ product, onClose }) {
  const dialog = useRef(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement;
    document.body.style.overflow = 'hidden';
    element.showModal();
    const update = () => setExpanded(document.fullscreenElement === element);
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      if (document.fullscreenElement === element) document.exitFullscreen().catch(() => {});
      element.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  async function fullscreen() {
    if (document.fullscreenElement === dialog.current) await document.exitFullscreen();
    else if (expanded) setExpanded(false);
    else {
      try {
        if (!dialog.current.requestFullscreen) throw new Error('Fullscreen unavailable');
        await dialog.current.requestFullscreen();
      } catch {
        setExpanded(true);
      }
    }
  }
  return (
    <dialog ref={dialog} className={`tryon-modal${expanded ? ' is-expanded' : ''}`} aria-labelledby="tryon-modal-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="tryon-modal-header">
        <div><span className="eyebrow">Virtual fitting</span><h2 id="tryon-modal-title">{product.name}</h2></div>
        <div className="tryon-modal-window-controls">
          <button type="button" aria-label={expanded ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={fullscreen}>{expanded ? <Minimize /> : <Maximize />}</button>
          <button type="button" aria-label="Close virtual try-on" onClick={onClose} autoFocus><X /></button>
        </div>
      </header>
      <Suspense fallback={<p role="status">Loading virtual fitting…</p>}><Studio product={product} embedded /></Suspense>
    </dialog>
  );
}
