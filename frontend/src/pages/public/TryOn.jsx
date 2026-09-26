import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Camera,
  Upload,
  ScanLine,
  RotateCcw,
  Download,
  ImagePlus,
  X,
  Check,
  Shirt,
  Glasses,
  Gem,
  Sparkles,
  ShoppingBag,
  Save,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAsync } from '../../hooks/useAsync';
import { Badge, Button, ErrorState, IconButton, Select, Tabs } from '../../components/common/UI';
import DemoNotice from '../../components/common/DemoNotice';
import { ProductImage } from '../../components/product/ProductCard';
import CanvasPreview, { defaultsFor, overlayFor } from '../../components/tryon/CanvasPreview';

export default function TryOn() {
  const { state, user, mutate, addToCart, registerMedia, toast } = useApp();
  const [params] = useSearchParams();
  const initial =
    state.products.find((p) => String(p.id) === params.get('product')) ||
    state.products[1] ||
    state.products[0];
  const [productId, setProductId] = useState(initial?.id);
  const product = state.products.find((p) => String(p.id) === String(productId));
  const [mode, setMode] = useState(initial?.tryOnType || 'SUNGLASSES');
  const [photo, setPhoto] = useState('');
  const [controls, setControls] = useState(defaultsFor(initial?.tryOnType || 'SUNGLASSES'));
  const [view, setView] = useState('after');
  const [compare, setCompare] = useState(50);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [imageError, setImageError] = useState('');
  const [stage, setStage] = useState(0);
  const [processed, setProcessed] = useState(false);
  const [saved, setSaved] = useState(false);
  const { busy, error, run, setError } = useAsync();
  const canvas = useRef(null);
  const video = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);
  const mounted = useRef(true);
  const cameraAttempt = useRef(0);
  const imageFailure = useCallback((message) => setImageError(message), []);
  const stopCamera = useCallback(() => {
    cameraAttempt.current += 1;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCameraActive(false);
    setCameraBusy(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      clearInterval(timer.current);
    };
  }, []);
  useEffect(() => {
    if (cameraActive && video.current) {
      video.current.srcObject = stream.current;
      video.current
        .play()
        .catch(() => setCameraError('Camera preview could not start. Try an image upload.'));
    }
  }, [cameraActive]);
  useEffect(() => {
    setSaved(false);
    setProcessed(false);
    setStage(0);
    clearInterval(timer.current);
  }, [photo, productId, mode]);
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is unavailable. Use localhost or HTTPS, or upload a photo.');
      return;
    }
    stopCamera();
    setCameraBusy(true);
    setCameraError('');
    const attempt = cameraAttempt.current;
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 } },
        audio: false,
      });
      if (!mounted.current || attempt !== cameraAttempt.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = next;
      setCameraActive(true);
    } catch (e) {
      setCameraError(
        e.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow access in your browser or upload a photo.'
          : e.name === 'NotFoundError'
            ? 'No camera found. Upload a photo to continue.'
            : 'Could not open the camera. It may be in use by another application.',
      );
    } finally {
      if (mounted.current) setCameraBusy(false);
    }
  }
  function capture() {
    const source = video.current;
    if (!source?.videoWidth) {
      setCameraError('Wait for the camera preview before capturing.');
      return;
    }
    const buffer = document.createElement('canvas');
    buffer.width = source.videoWidth;
    buffer.height = source.videoHeight;
    buffer.getContext('2d').drawImage(source, 0, 0);
    buffer.toBlob(
      (blob) => {
        if (blob && mounted.current) {
          setPhoto(registerMedia(blob));
          setImageError('');
          setCameraError('');
          stopCamera();
        }
      },
      'image/jpeg',
      0.9,
    );
  }
  function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      setImageError('Choose a JPEG, PNG, or WebP photo smaller than 12 MB.');
      return;
    }
    stopCamera();
    setImageError('');
    setCameraError('');
    setPhoto(registerMedia(file));
  }
  function process() {
    setProcessed(false);
    setStage(1);
    clearInterval(timer.current);
    let current = 1;
    timer.current = setInterval(() => {
      current += 1;
      if (current > 3) {
        clearInterval(timer.current);
        setStage(0);
        setProcessed(true);
        setView('after');
      } else setStage(current);
    }, 650);
  }
  async function save() {
    run(async () => {
      if (!canvas.current) return;
      const blob = await new Promise((resolve) => canvas.current.toBlob(resolve, 'image/png'));
      if (!blob) {
        setError('Unable to create a snapshot. Please try a different photo.');
        return;
      }
      const result = await mutate(
        'sessions',
        'create',
        {
          userId: user.testId || 1,
          productId: product.testId || 1,
          inputImageUrl: photo.startsWith('blob:')
            ? `https://example.com/demo-input-${Date.now()}.jpg`
            : `${window.location.origin}${photo}`,
          tryOnType: mode,
        },
        null,
        {
          userId: user.id,
          productId: product.id,
          inputImageUrl: photo,
          resultImageUrl: registerMedia(blob),
          controls,
          prototype: true,
        },
      );
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }
  function download() {
    canvas.current?.toBlob((blob) => {
      if (!blob) {
        toast('Snapshot could not be created.', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TryOnBD-demo-preview.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }
  function chooseProduct(id) {
    const next = state.products.find((p) => String(p.id) === String(id));
    setProductId(next.id);
    setMode(next.tryOnType || 'CLOTHING');
    setControls(defaultsFor(next.tryOnType || 'CLOTHING'));
  }
  return (
    <div className="studio-page">
      <div className="container">
        <header className="studio-heading">
          <div>
            <span className="eyebrow">
              <span className="live-dot" />
              YOUR PERSONAL STYLE LAB
            </span>
            <h1>
              A new look. <em>All you.</em>
            </h1>
            <p>A little experimentation looks good on you.</p>
          </div>
          <Badge tone="dark">
            <Sparkles size={13} />
            Prototype / Demo Processing
          </Badge>
        </header>
        <div className="studio-steps">
          {['Choose your piece', 'Bring your photo', 'Make it yours'].map((x, i) => (
            <span key={x}>
              <b>{i + 1}</b>
              {x}
              <Check
                size={13}
                className={
                  (i === 0 && product) || (i === 1 && photo) || (i === 2 && processed)
                    ? ''
                    : 'invisible'
                }
              />
            </span>
          ))}
        </div>
        <div className="studio-grid">
          <aside className="studio-panel">
            <h2>
              01 <span>The piece</span>
            </h2>
            <Select
              label="Selected product"
              value={productId || ''}
              onChange={(e) => chooseProduct(e.target.value)}
            >
              {state.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {product && (
              <div className="studio-product">
                <ProductImage product={product} />
                <div>
                  <strong>{product.name}</strong>
                  <p>Manual overlay preview</p>
                </div>
              </div>
            )}
            <div className="studio-mode">
              {[
                { id: 'CLOTHING', label: 'Clothing', icon: Shirt },
                { id: 'SUNGLASSES', label: 'Glasses', icon: Glasses },
                { id: 'JEWELRY', label: 'Jewelry', icon: Gem },
              ].map((m) => (
                <button
                  key={m.id}
                  aria-pressed={mode === m.id}
                  onClick={() => {
                    setMode(m.id);
                    setControls(defaultsFor(m.id));
                  }}
                >
                  <m.icon size={20} />
                  {m.label}
                </button>
              ))}
            </div>
            <h2 className="mt-7">
              02 <span>Your photo</span>
            </h2>
            <label className="upload-zone">
              <Upload size={24} />
              <strong>Drop into a new look</strong>
              <span>Choose a photo to upload</span>
              <small>JPG, PNG, WebP · up to 12 MB</small>
              <input
                aria-label="Upload photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={upload}
              />
            </label>
            <Button
              variant="studio"
              className="w-full mt-3"
              busy={cameraBusy}
              onClick={startCamera}
            >
              <Camera size={17} />
              {photo ? 'Retake with camera' : 'Start camera'}
            </Button>
            <button
              className="demo-photo-link"
              onClick={() => {
                stopCamera();
                setPhoto('/assets/person.svg');
                setImageError('');
              }}
            >
              Or use the illustrated demo portrait <Arrow />
            </button>
            {photo && (
              <button
                className="text-sm muted mt-3 flex gap-2 items-center"
                onClick={() => {
                  setPhoto('');
                  stopCamera();
                }}
              >
                <X size={14} />
                Remove photo
              </button>
            )}
            <p className="studio-privacy">
              Your photos stay in browser memory. Uploaded images are not hosted or saved to
              localStorage.
            </p>
          </aside>
          <section className="studio-preview" aria-label="Canvas preview">
            <div className="preview-toolbar">
              <span>
                <span className="live-dot" />
                LIVE CANVAS
              </span>
              <IconButton
                label="Reset canvas controls"
                onClick={() => setControls(defaultsFor(mode))}
              >
                <RotateCcw size={16} />
              </IconButton>
            </div>
            <div className="canvas-stage">
              {cameraActive ? (
                <div className="camera-preview">
                  <video ref={video} muted playsInline autoPlay aria-label="Live camera preview" />
                  <div className="camera-actions">
                    <Button onClick={capture}>
                      <Camera size={16} />
                      Capture photo
                    </Button>
                    <Button variant="secondary" onClick={stopCamera}>
                      Stop camera
                    </Button>
                  </div>
                </div>
              ) : photo ? (
                <>
                  <CanvasPreview
                    ref={canvas}
                    photo={photo}
                    overlay={overlayFor(mode, product?.categoryId)}
                    controls={controls}
                    view={view}
                    compare={compare}
                    onError={imageFailure}
                  />
                  <span className="canvas-label">
                    {view === 'before' ? 'ORIGINAL PHOTO' : 'MANUAL DEMO OVERLAY'}
                  </span>
                </>
              ) : (
                <div className="canvas-empty">
                  <div className="viewfinder">
                    <ScanLine size={70} strokeWidth={0.7} />
                  </div>
                  <h3>Your next look starts with you.</h3>
                  <p>
                    Upload a photo, open your camera,
                    <br />
                    or explore with our demo portrait.
                  </p>
                  <span>PRIVATE BY DESIGN · PHOTOS STAY IN YOUR BROWSER</span>
                </div>
              )}
              {stage > 0 && (
                <div className="processing-overlay">
                  <ScanLine className="animate-pulse" size={45} />
                  <h3>
                    {
                      [
                        '',
                        'Preparing your local preview…',
                        'Composing the demo overlay…',
                        'Finishing your style preview…',
                      ][stage]
                    }
                  </h3>
                  <p>Prototype / Demo Processing · No AI model</p>
                  <div className="progress-track">
                    <span style={{ width: `${(stage / 3) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="preview-bottom">
              <Tabs
                tabs={[
                  { value: 'before', label: 'Before' },
                  { value: 'after', label: 'After' },
                  { value: 'compare', label: 'Compare' },
                ]}
                value={view}
                onChange={setView}
                label="Preview comparison"
              />
              <button
                disabled={!photo || !!imageError || cameraActive}
                onClick={download}
                aria-label="Download snapshot"
              >
                <Download size={18} />
              </button>
            </div>
            {view === 'compare' && (
              <label className="comparison-slider">
                Before / after split
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={compare}
                  onChange={(e) => setCompare(Number(e.target.value))}
                />
              </label>
            )}
          </section>
          <aside className="studio-panel controls-panel">
            <h2>
              03 <span>Make it yours</span>
            </h2>
            <p className="muted text-sm mb-6">Fine-tune your overlay. You’re in control.</p>
            {[
              { key: 'x', label: 'Horizontal position', min: 0, max: 100, step: 1, unit: '%' },
              { key: 'y', label: 'Vertical position', min: 0, max: 100, step: 1, unit: '%' },
              { key: 'scale', label: 'Scale', min: 0.2, max: 2.5, step: 0.05, unit: '×' },
              { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, unit: '°' },
              { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, unit: '%' },
            ].map((control) => (
              <label className="range-control" key={control.key}>
                <span>
                  {control.label}
                  <b>
                    {controls[control.key]}
                    {control.unit}
                  </b>
                </span>
                <input
                  aria-label={control.label}
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={controls[control.key]}
                  onChange={(e) => {
                    setSaved(false);
                    setControls((old) => ({ ...old, [control.key]: Number(e.target.value) }));
                  }}
                />
              </label>
            ))}
            <Button
              variant="studio"
              className="w-full"
              onClick={() => setControls(defaultsFor(mode))}
            >
              <RotateCcw size={15} />
              Reset adjustments
            </Button>
            <div className="future-note">
              <Sparkles size={16} />
              <div>
                <strong>Made for a little imagination</strong>
                <p>
                  {mode === 'CLOTHING'
                    ? 'Clothing uses an illustrated garment overlay. AI fitting and pose detection are future features.'
                    : 'Place accessories manually. Automatic face landmarks are a future feature.'}
                </p>
              </div>
            </div>
            <Button
              className="studio-start w-full"
              disabled={!photo || !!imageError || cameraActive || !product || stage > 0}
              onClick={process}
            >
              <ScanLine size={17} />
              {processed ? 'Try again' : 'Start demo try-on'}
            </Button>
            {processed && (
              <div className="studio-results">
                <span>
                  <Check size={15} />
                  Your prototype preview is ready
                </span>
                <Button
                  variant="studio"
                  className="w-full"
                  busy={busy}
                  disabled={saved || view !== 'after'}
                  onClick={save}
                >
                  <Save size={16} />
                  {saved ? 'Demo session saved' : 'Save demo session'}
                </Button>
                {view !== 'after' && <small>Select After to save the complete result.</small>}
                <Button
                  variant="studio"
                  className="w-full"
                  disabled={!product?.stockQuantity}
                  onClick={() => addToCart(product)}
                >
                  <ShoppingBag size={16} />
                  Add piece to bag
                </Button>
                <Link to="/dashboard/customer/try-on-history">View your demo history →</Link>
              </div>
            )}
          </aside>
        </div>
        {(cameraError || imageError || error) && (
          <div className="mt-4">
            <ErrorState message={cameraError || imageError || error} />
          </div>
        )}
        <div className="studio-disclosure">
          <DemoNotice compact />
          <p>
            Session creation tests the existing controller. Uploaded photos use a clearly
            illustrative URL in the request; real image storage and persisted session IDs are future
            work. Saved image previews are available only during this browser visit.
          </p>
        </div>
      </div>
    </div>
  );
}
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
