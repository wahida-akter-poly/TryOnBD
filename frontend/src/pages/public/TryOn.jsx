import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Camera,
  Upload,
  ScanLine,
  RotateCcw,
  Download,
  Glasses,
  Gem,
  ShoppingBag,
  Save,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Badge, Button, Select, Tabs } from '../../components/common/UI';
import CanvasPreview, { loadImage } from '../../components/tryon/CanvasPreview';
import { defaultControls } from '../../components/tryon/faceGeometry';
import { accessoryStyles, sunglassesAssetFor } from '../../data/faceAccessories';
import { useTryOnCamera } from '../../hooks/useTryOnCamera';
import { tryOnService } from '../../services/tryOnService';
import { errorMessage } from '../../services/api';
import ShirtOverlay from '../../components/tryon/ShirtOverlay.jsx';
import ShirtStudio from '../../components/tryon/ShirtStudio.jsx';
import { shirtCalibration, shirtPreviewProduct } from '../../data/shirtProducts.js';
import NecklaceOverlay from '../../components/tryon/NecklaceOverlay.jsx';

const necklacePreviewProduct = {
  id: 'necklace-preview',
  testId: 1,
  name: 'Zariya Bridal Necklace',
  price: 3290,
  categoryId: 7,
  sellerId: 3,
  stockQuantity: 9,
  rating: 4.9,
  imageUrl: '/assets/necklace.jpg',
  asset: 'necklace',
  arType: 'NECKLACE',
  tryOnType: 'NECKLACE',
  badge: 'Preview',
  color: '#eee9e0',
  sync: 'Demo',
  description: 'A local necklace preview for the browser-only virtual try-on demo.',
};

const blobFrom = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not create the snapshot. Please retry.')),
      'image/png',
    ),
  );
async function thumbnail(canvas) {
  const small = document.createElement('canvas');
  const ratio = Math.min(1, 480 / Math.max(canvas.width, canvas.height));
  small.width = Math.round(canvas.width * ratio);
  small.height = Math.round(canvas.height * ratio);
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  return blobFrom(small);
}
const modeFor = (product) =>
  product?.accessoryKind === 'sunglasses' || product?.tryOnType === 'SUNGLASSES'
    ? 'sunglasses'
    : product?.arType === 'NECKLACE' || product?.tryOnType === 'NECKLACE'
      ? 'necklace'
      : product?.arType === 'tshirt' || product?.tryOnType === 'CLOTHING'
      ? 'clothing'
      : 'jewelry';
const controlsFor = (mode, shirt = false) => ({
  ...defaultControls(),
  auto: mode === 'sunglasses' || mode === 'necklace' || shirt,
});

export default function TryOn() {
  const { state, user, addToCart, localUpdate, registerMedia, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const arDebug = params.get('arDebug') === '1';
  const [adjustFit, setAdjustFit] = useState(false);
  const products = [
    ...state.products.filter(
      (p) =>
        p.arType === 'tshirt' ||
        ['FACE_AR', 'SUNGLASSES', 'CLOTHING', 'JEWELRY', 'NECKLACE'].includes(p.tryOnType) ||
        p.arType === 'NECKLACE',
    ),
    shirtPreviewProduct,
    necklacePreviewProduct,
  ];
  const requested = params.get('productId') || params.get('product');
  const product =
    products.find((p) => String(p.id) === requested) ||
    products.find((p) => modeFor(p) === 'sunglasses') ||
    products[0];
  const mode = modeFor(product),
    isAR = mode === 'sunglasses';
  const isNecklace = mode === 'necklace';
  const isShirt = product?.arType === 'tshirt';
  const shirtFit = useMemo(() => (isShirt ? shirtCalibration(product) : null), [product, isShirt]);
  const [styleId, setStyleId] = useState(product?.accessoryStyle || 'aviator');
  const style = isShirt
    ? { id: 'tshirt', kind: 'tshirt', overlayAsset: shirtFit.asset }
    : isNecklace
      ? { id: 'necklace', kind: 'necklace', overlayAsset: '/assets/overlay-necklace.svg' }
    : mode === 'clothing'
      ? { id: 'clothing', kind: 'clothing', overlayAsset: '/assets/overlay-clothing.svg' }
      : mode === 'jewelry' && !product?.accessoryKind
        ? { id: 'necklace', kind: 'necklace', overlayAsset: '/assets/overlay-necklace.svg' }
        : accessoryStyles.find((s) => s.id === styleId) || accessoryStyles[0];
  const glassesAsset = isAR ? sunglassesAssetFor(product, style) : null;
  const overlay = isAR
    ? glassesAsset.src
    : style.id === product?.accessoryStyle
      ? product.tryOnImageUrl || style.overlayAsset
      : style.overlayAsset;
  const [source, setSource] = useState(null);
  const [inputMode, setInputMode] = useState('camera');
  const [controls, setControls] = useState(() => controlsFor(mode, isShirt));
  const [view, setView] = useState('after');
  const [compare, setCompare] = useState(50);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState({
    ready: false,
    tracking: 'Waiting for input',
    assetReady: false,
  });
  const [inputError, setInputError] = useState('');
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState('');
  const [pendingLocal, setPendingLocal] = useState(null);
  const preview = useRef(null),
    video = useRef(null),
    uploadAttempt = useRef(0),
    mounted = useRef(true);
  const onStatus = useCallback(
    (patch) =>
      setStatus((old) => {
        if (Object.keys(patch).every((key) => old[key] === patch[key])) return old;
        return { ...old, ...patch };
      }),
    [],
  );
  const changeSource = useCallback((next) => {
    setSource(next);
    setSaved('');
    setPendingLocal(null);
    setSaveError('');
    setStatus((old) => ({
      ...old,
      ready: false,
      tracking: 'Waiting for input',
      detectorError: '',
    }));
  }, []);
  const camera = useTryOnCamera(video, changeSource);
  useEffect(() => {
    if ((isAR || isShirt || isNecklace) && !arDebug) {
      setControls((old) => ({ ...old, auto: true }));
      setView('after');
    }
  }, [isAR, isShirt, isNecklace, arDebug]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadAttempt.current += 1;
    };
  }, []);
  useEffect(
    () => () => {
      if (source?.mediaUrl) URL.revokeObjectURL(source.mediaUrl);
    },
    [source],
  );
  useEffect(() => {
    setStyleId(product?.accessoryStyle || 'aviator');
    setControls(controlsFor(mode, isShirt));
  }, [product?.id, product?.accessoryStyle, mode, isShirt]);
  useEffect(() => {
    uploadAttempt.current += 1;
    setLoadingPhoto(false);
    camera.stop();
    camera.clearError();
    changeSource(null);
    setInputError('');
    setView('after');
  }, [mode, camera.stop, changeSource]);
  useEffect(() => {
    // A captured result belongs to the product/style captured, never relabel it.
    setSource((old) => (old?.composite ? null : old));
  }, [product?.id, styleId]);
  useEffect(() => {
    setSaved('');
    setPendingLocal(null);
    setSaveError('');
  }, [controls, styleId, product?.id]);

  function chooseProduct(id) {
    setParams({ productId: String(id), ...(arDebug ? { arDebug: '1' } : {}) }, { replace: true });
  }
  function chooseMode(mode) {
    if (busy) return;
    const next = products.find((p) => modeFor(p) === mode);
    if (next) chooseProduct(next.id);
  }
  function switchInput(mode) {
    uploadAttempt.current += 1;
    setLoadingPhoto(false);
    camera.stop();
    camera.clearError();
    changeSource(null);
    setInputError('');
    setInputMode(mode);
    setView('after');
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      setInputError('Choose a PNG, JPG, JPEG, or WebP photo smaller than 12 MB.');
      return;
    }
    const token = ++uploadAttempt.current;
    camera.stop();
    camera.clearError();
    changeSource(null);
    setInputError('');
    setLoadingPhoto(true);
    const url = URL.createObjectURL(file);
    try {
      const element = await loadImage(url);
      if (!mounted.current || token !== uploadAttempt.current) return;
      changeSource({ element, live: false, mirrored: false, kind: 'upload' });
      setView('after');
      setRetry(0);
    } catch (e) {
      if (mounted.current && token === uploadAttempt.current) setInputError(e.message);
    } finally {
      URL.revokeObjectURL(url);
      if (mounted.current && token === uploadAttempt.current) setLoadingPhoto(false);
    }
  }
  async function capture() {
    const snapshot = preview.current?.snapshot(true);
    if (!snapshot) return;
    const token = ++uploadAttempt.current;
    setBusy(true);
    try {
      const blob = await blobFrom(snapshot.result);
      if (!mounted.current || token !== uploadAttempt.current) return;
      camera.stop();
      changeSource({
        element: snapshot.original,
        ...(isAR || isShirt || isNecklace ? { composite: snapshot.result } : {}),
        mediaUrl: registerMedia(blob),
        live: false,
        mirrored: false,
        kind: 'snapshot',
      });
      setRetry(0);
      setView('after');
    } catch (e) {
      if (mounted.current) toast(e.message, 'error');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function download() {
    try {
      const snapshot = preview.current?.snapshot();
      if (!snapshot) throw new Error('Add a photo or start the camera first.');
      const blob = await blobFrom(snapshot.result),
        url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tryonbd-${style.kind === 'forehead' ? 'head-jewelry' : style.kind}-result.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  function storeSession(prepared, validated) {
    const record = {
      ...prepared.metadata,
      inputImageUrl: registerMedia(prepared.original),
      resultImageUrl: registerMedia(prepared.result),
      sync: validated ? 'Controller validated' : 'Local / Unsynced',
      persistence: 'Demo / Local',
      requestValidated: validated,
    };
    localUpdate('sessions', record, 'create');
    const message =
      isAR && !arDebug
        ? validated
          ? 'Try-on saved'
          : 'Saved on this device'
        : validated
          ? 'Spring Boot request validated'
          : 'Saved as Local Demo / Unsynced';
    setSaved(message);
    setPendingLocal(null);
    setSaveError('');
    toast(message, validated ? 'success' : 'info');
  }
  async function save() {
    if (!product || !canExport || busy) return;
    const snapshot = preview.current?.snapshot();
    if (!snapshot) return;
    setBusy(true);
    setSaveError('');
    setPendingLocal(null);
    try {
      const prepared = {
        original: await thumbnail(snapshot.original),
        result: await thumbnail(snapshot.result),
        metadata: {
          id: `DEMO-LOCAL-${crypto.randomUUID()}`,
          date: new Date().toISOString(),
          userId: user.id,
          productId: product.id,
          tryOnType: isAR ? 'FACE_AR' : mode.toUpperCase(),
          accessoryStyle: style.id,
          controls: { ...controls },
          sourceKind: source.kind,
          testId: 1,
        },
      };
      try {
        // An honest local reference: this API validates text; it does not upload or host photos.
        await tryOnService.create({
          userId: Number(user.testId) || 1,
          productId: Number(product.testId) || 1,
          inputImageUrl: `urn:tryonbd:local-input:${crypto.randomUUID()}`,
          tryOnType: isAR ? 'FACE_AR' : mode.toUpperCase(),
        });
        if (mounted.current) storeSession(prepared, true);
      } catch (e) {
        if (!mounted.current) return;
        if (e.backendOffline) {
          setSaveError(
            isAR && !arDebug
              ? 'Saving is unavailable right now. You can keep this try-on on this device.'
              : 'Backend offline. You can retry or explicitly save this snapshot as a Local Demo.',
          );
          setPendingLocal(prepared);
        } else setSaveError(errorMessage(e));
      }
    } catch (e) {
      if (mounted.current) setSaveError(e.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const canExport = Boolean(
    source &&
    status.ready &&
    status.assetReady &&
    (source.composite || !controls.auto || status.tracking === 'Active'),
  );
  const cameraBusy = camera.status === 'Requesting Permission';
  const notice = inputError || camera.error || status.assetError || status.detectorError;
  const canvasStage = (
    <div className="canvas-stage">
      <video
        ref={video}
        muted
        playsInline
        autoPlay
        className="face-video-source"
        aria-hidden="true"
      />
      <div
        className={source ? 'face-canvas-wrap' : 'face-canvas-hidden'}
        style={arDebug ? { position: 'relative' } : undefined}
      >
        {isShirt ? (
          <ShirtOverlay
            ref={preview}
            source={source}
            fit={shirtFit}
            arDebug={arDebug}
            retry={retry}
            onStatus={onStatus}
          />
        ) : isNecklace ? (
          <NecklaceOverlay
            ref={preview}
            source={source}
            overlay={overlay}
            retry={retry}
            onStatus={onStatus}
          />
        ) : (
          <CanvasPreview
            ref={preview}
            source={source}
            overlay={overlay}
            leftTempleSrc={glassesAsset?.leftTempleSrc}
            rightTempleSrc={glassesAsset?.rightTempleSrc}
            fit={glassesAsset?.fit}
            kind={style.kind}
            controls={isAR && !arDebug ? { ...controls, auto: true } : controls}
            arDebug={arDebug}
            view={view}
            compare={compare}
            trackingEnabled={isAR}
            retry={retry}
            onStatus={onStatus}
          />
        )}
      </div>
      {!source && (
        <div className="canvas-empty">
          <ScanLine size={64} strokeWidth={0.8} />
          <h3>Your next look starts with you.</h3>
          <p>Start your camera or upload a clear, front-facing photo.</p>
        </div>
      )}
    </div>
  );
  if (isShirt)
    return (
      <ShirtStudio
        product={product}
        products={products.filter((p) => modeFor(p) === 'clothing')}
        chooseProduct={chooseProduct}
        canvasStage={canvasStage}
        source={source}
        status={status}
        notice={notice}
        camera={camera}
        busy={busy}
        canExport={canExport}
        onCamera={() => {
          setInputMode('camera');
          setInputError('');
          camera.start();
        }}
        onStop={() => {
          camera.stop();
          changeSource(null);
        }}
        upload={upload}
        capture={capture}
        download={download}
        reset={() => setRetry((n) => n + 1)}
        retry={() => setRetry((n) => n + 1)}
      />
    );
  if (isNecklace && !arDebug) {
    const trackingLabel = source?.composite
      ? 'Captured'
      : loadingPhoto
        ? 'Opening photo...'
        : status.tracking === 'Active'
          ? 'Pose detected'
          : status.tracking === 'Lost'
            ? 'Keep both shoulders in view'
            : source
              ? 'Finding your shoulders...'
              : 'Ready when you are';
    return (
      <div className="studio-page face-studio simple-eyewear">
        <div className="container">
          <header className="eyewear-heading">
            <Link to={`/products/${product.id}`}>Back to product</Link>
            <h1>Necklace Virtual Try-On</h1>
            <p>{product.name}</p>
          </header>
          <fieldset disabled={busy} className="face-fieldset eyewear-studio">
            <section className="studio-preview" aria-label="Try-on preview">
              <div className="preview-toolbar">
                <span role="status">{trackingLabel}</span>
              </div>
              {canvasStage}
            </section>
            <div className="eyewear-input" role="group" aria-label="Input source">
              <Button
                variant="studio"
                busy={cameraBusy}
                disabled={camera.status === 'Camera Active'}
                onClick={() => {
                  setInputMode('camera');
                  setInputError('');
                  setView('after');
                  camera.start();
                }}
              >
                <Camera size={18} />
                {source?.kind === 'snapshot' ? 'Retake' : 'Start Camera'}
              </Button>
              <label className="btn btn-studio eyewear-upload">
                <Upload size={18} /> Upload Photo
                <input
                  aria-label="Upload photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    setInputMode('upload');
                    upload(event);
                  }}
                />
              </label>
              {(source?.live || cameraBusy) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    camera.stop();
                    changeSource(null);
                  }}
                >
                  Stop camera
                </Button>
              )}
              {camera.devices.length > 1 && source?.live && (
                <Button variant="ghost" onClick={camera.switchCamera}>
                  Switch camera
                </Button>
              )}
            </div>
            {notice && (
              <p className="face-feedback face-error" role="alert">
                {status.detectorError
                  ? 'We could not fit the necklace. Try again with both shoulders visible.'
                  : notice}
              </p>
            )}
            {status.bodyNotice && source && !source.composite && (
              <p className="face-feedback" role="status">
                {status.bodyNotice}
              </p>
            )}
            {source && !source.composite && ['Unavailable', 'Lost'].includes(status.tracking) && (
              <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>
                Try fitting again
              </Button>
            )}
            <div className="eyewear-primary-actions">
              <Button disabled={!source?.live || !canExport} onClick={capture}>
                <Camera size={18} />
                Capture
              </Button>
              <Button
                variant="secondary"
                disabled={!product?.stockQuantity}
                onClick={() => addToCart(product)}
              >
                <ShoppingBag size={18} />
                Add to Cart
              </Button>
            </div>
            {canExport && (
              <div className="eyewear-secondary-actions">
                <Button variant="ghost" onClick={download}>
                  <Download size={16} />
                  Download PNG
                </Button>
                <Button variant="ghost" disabled={Boolean(saved)} onClick={save}>
                  <Save size={16} />
                  {saved ? 'Try-On saved' : 'Save Try-On'}
                </Button>
              </div>
            )}
            {saveError && (
              <p className="face-feedback face-error" role="alert">
                {saveError}
              </p>
            )}
            {pendingLocal && (
              <Button variant="ghost" onClick={() => storeSession(pendingLocal, false)}>
                Save on this device
              </Button>
            )}
            {saved && (
              <p role="status">
                Try-on saved.{' '}
                <Link to="/dashboard/customer/try-on-history">View saved try-ons</Link>
              </p>
            )}
            <p className="eyewear-privacy">Your camera and photos stay in your browser.</p>
          </fieldset>
        </div>
      </div>
    );
  }
  if (isAR && !arDebug) {
    const frames = accessoryStyles.filter((s) => s.kind === 'sunglasses' && s.src);
    const trackingLabel = source?.composite
      ? 'Captured'
      : loadingPhoto
        ? 'Opening photo…'
        : status.tracking === 'Active'
          ? 'Frame fitted'
          : status.tracking === 'Lost'
            ? 'Face forward in good light'
            : source
              ? 'Finding your face…'
              : 'Ready when you are';
    return (
      <div className="studio-page face-studio simple-eyewear">
        <div className="container">
          <header className="eyewear-heading">
            <Link to={`/products/${product.id}`}>← Back to product</Link>
            <h1>Find your frame.</h1>
            <p>{product.name}</p>
          </header>
          <fieldset disabled={busy} className="face-fieldset eyewear-studio">
            <section className="studio-preview" aria-label="Try-on preview">
              <div className="preview-toolbar">
                <span role="status">{trackingLabel}</span>
              </div>
              {canvasStage}
            </section>
            <div className="eyewear-input" role="group" aria-label="Input source">
              <Button
                variant="studio"
                busy={cameraBusy}
                disabled={camera.status === 'Camera Active'}
                onClick={() => {
                  setInputMode('camera');
                  setInputError('');
                  setView('after');
                  camera.start();
                }}
              >
                <Camera size={18} />
                {source?.kind === 'snapshot' ? 'Retake' : 'Camera'}
              </Button>
              <label className="btn btn-studio eyewear-upload">
                <Upload size={18} /> Upload Photo
                <input
                  aria-label="Upload photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    setInputMode('upload');
                    upload(event);
                  }}
                />
              </label>
              {(source?.live || cameraBusy) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    camera.stop();
                    changeSource(null);
                  }}
                >
                  Stop camera
                </Button>
              )}
              {camera.devices.length > 1 && source?.live && (
                <Button variant="ghost" onClick={camera.switchCamera}>
                  Switch camera
                </Button>
              )}
            </div>
            {notice && (
              <p className="face-feedback face-error" role="alert">
                {status.assetError ||
                  (status.detectorError
                    ? 'We could not fit your frame. Try again or upload a clear front-facing photo.'
                    : notice)}
              </p>
            )}
            {source && !source.composite && ['Unavailable', 'Lost'].includes(status.tracking) && (
              <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>
                Try fitting again
              </Button>
            )}
            {status.assetError && (
              <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>
                Retry image
              </Button>
            )}
            <section className="eyewear-frames" aria-label="Frames">
              <h2>Try another frame</h2>
              <div className="face-style-grid" aria-label="Accessory styles">
                {frames.map((s) => (
                  <button
                    key={s.id}
                    aria-pressed={style.id === s.id}
                    onClick={() => {
                      const nextProduct = products.find((p) => p.accessoryStyle === s.id);
                      if (nextProduct && nextProduct.id !== product.id)
                        chooseProduct(nextProduct.id);
                      setStyleId(s.id);
                    }}
                  >
                    <img
                      src={s.src}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
              {frames.length === 1 && (
                <p className="text-sm">Classic Aviator is currently the only available frame.</p>
              )}
            </section>
            <div className="eyewear-primary-actions">
              <Button disabled={!source?.live || !canExport} onClick={capture}>
                <Camera size={18} />
                Capture
              </Button>
              <Button
                variant="secondary"
                disabled={!product?.stockQuantity}
                onClick={() => addToCart(product)}
              >
                <ShoppingBag size={18} />
                Add to Cart
              </Button>
            </div>
            {canExport && (
              <div className="eyewear-secondary-actions">
                <Button variant="ghost" onClick={download}>
                  <Download size={16} />
                  Download PNG
                </Button>
                <Button variant="ghost" disabled={Boolean(saved)} onClick={save}>
                  <Save size={16} />
                  {saved ? 'Try-On saved' : 'Save Try-On'}
                </Button>
              </div>
            )}
            {saveError && (
              <p className="face-feedback face-error" role="alert">
                {saveError}
              </p>
            )}
            {pendingLocal && (
              <Button variant="ghost" onClick={() => storeSession(pendingLocal, false)}>
                Save on this device
              </Button>
            )}
            {saved && (
              <p role="status">
                Try-on saved.{' '}
                <Link to="/dashboard/customer/try-on-history">View saved try-ons</Link>
              </p>
            )}
            <button
              className="eyewear-adjust"
              aria-expanded={adjustFit}
              onClick={() => setAdjustFit((open) => !open)}
            >
              Adjust fit
            </button>
            {adjustFit && (
              <fieldset className="face-fieldset eyewear-fit" disabled={Boolean(source?.composite)}>
                <p>Your frame fits automatically. Make a small adjustment if needed.</p>
                {[
                  { key: 'scale', label: 'Size', min: 0.7, max: 1.3, step: 0.01 },
                  { key: 'y', label: 'Height', min: -10, max: 10, step: 0.5 },
                ].map((c) => (
                  <label className="range-control" key={c.key}>
                    <span>{c.label}</span>
                    <input
                      aria-label={c.label}
                      type="range"
                      min={c.min}
                      max={c.max}
                      step={c.step}
                      value={controls[c.key]}
                      onChange={(e) =>
                        setControls((old) => ({
                          ...old,
                          [c.key]: Number(e.target.value),
                          auto: true,
                        }))
                      }
                    />
                  </label>
                ))}
                <Button variant="ghost" onClick={() => setControls(controlsFor(mode))}>
                  Reset fit
                </Button>
              </fieldset>
            )}
            <p className="eyewear-privacy">Your camera and photos stay in your browser.</p>
          </fieldset>
        </div>
      </div>
    );
  }
  return (
    <div className="studio-page face-studio">
      <div className="container">
        <header className="studio-heading">
          <div>
            <span className="eyebrow">
              <span className="live-dot" />
              YOUR PERSONAL STYLE STUDIO
            </span>
            <h1>
              A new look. <em>All you.</em>
            </h1>
            <p>
              {isAR
                ? 'Sunglasses that follow your face in real time.'
                : isNecklace
                  ? 'A necklace preview that follows your shoulders.'
                  : 'Adjust a manual overlay on your camera or photo.'}
            </p>
          </div>
          <Badge tone="dark">
            {isAR || isNecklace ? 'LIVE AR TRY-ON' : 'MANUAL DEMO OVERLAY'}
          </Badge>
        </header>
        <div className="face-mode-bar">
          <Tabs
            label="Try-on mode"
            tabs={[
              { value: 'sunglasses', label: 'Sunglasses' },
              { value: 'necklace', label: 'Necklace' },
              { value: 'clothing', label: 'Clothing' },
              { value: 'jewelry', label: 'Jewelry' },
            ]}
            value={mode}
            onChange={chooseMode}
          />
          <span className="text-sm">
            {isAR || isNecklace
              ? 'Powered by real-time face landmarks'
              : 'Prototype / Demo Processing · No AI model'}
          </span>
        </div>
        <fieldset disabled={busy} className="studio-grid face-fieldset">
          <aside className="studio-panel">
            <h2>
              01 <span>The piece</span>
            </h2>
            <Select
              label="Selected product"
              value={product?.id || ''}
              onChange={(e) => chooseProduct(e.target.value)}
            >
              {products
                .filter((p) => modeFor(p) === mode)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
            {requested && !products.some((p) => String(p.id) === requested) && (
              <p className="text-sm mt-3">
                That product is unavailable. Choose another product to preview.
              </p>
            )}
            <div className="face-style-grid" aria-label="Accessory styles">
              {accessoryStyles
                .filter((s) => s.kind === product?.accessoryKind)
                .map((s) => (
                  <button
                    key={s.id}
                    aria-pressed={style.id === s.id}
                    disabled={s.kind === 'sunglasses' && !s.src}
                    onClick={() => setStyleId(s.id)}
                  >
                    {(s.kind !== 'sunglasses' || s.src) && (
                      <img
                        src={s.overlayAsset}
                        alt=""
                        onError={(event) => {
                          if (s.kind === 'sunglasses') {
                            event.currentTarget.hidden = true;
                            return;
                          }
                          if (
                            s.fallbackSrc &&
                            event.currentTarget.getAttribute('src') !== s.fallbackSrc
                          )
                            event.currentTarget.src = s.fallbackSrc;
                        }}
                      />
                    )}
                    <span>{s.name}</span>
                    {s.kind === 'sunglasses' && !s.src && (
                      <small>Real product photo required</small>
                    )}
                  </button>
                ))}
            </div>
            <h2 className="mt-7">
              02 <span>Your input</span>
            </h2>
            <Tabs
              label="Input source"
              tabs={[
                { value: 'camera', label: 'Live Camera' },
                { value: 'upload', label: 'Upload Photo' },
              ]}
              value={inputMode}
              onChange={switchInput}
            />
            {inputMode === 'upload' ? (
              <label className="upload-zone mt-4">
                <Upload size={24} />
                <strong>Choose your photo</strong>
                <small>PNG, JPG, JPEG, WebP · up to 12 MB</small>
                <input
                  aria-label="Upload photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={upload}
                />
              </label>
            ) : (
              <div className="face-camera-actions">
                <p role="status">{camera.status}</p>
                <Button
                  variant="studio"
                  busy={cameraBusy}
                  onClick={() => {
                    setInputError('');
                    camera.start();
                  }}
                  disabled={camera.status === 'Camera Active'}
                >
                  <Camera size={16} />
                  {source?.kind === 'snapshot'
                    ? 'Retake with camera'
                    : isAR || isNecklace
                      ? 'Start AR Camera'
                      : 'Start camera'}
                </Button>
                {(camera.status === 'Camera Active' || cameraBusy) && (
                  <Button
                    variant="studio"
                    onClick={() => {
                      camera.stop();
                      changeSource(null);
                    }}
                  >
                    Stop camera
                  </Button>
                )}
                {camera.devices.length > 1 && camera.status === 'Camera Active' && (
                  <Button variant="studio" onClick={camera.switchCamera}>
                    Switch camera
                  </Button>
                )}
                {camera.error && (
                  <Button variant="studio" onClick={() => camera.start()}>
                    Retry camera
                  </Button>
                )}
              </div>
            )}
            <p className="studio-privacy">
              Photos are processed in your browser. No face images are uploaded. Saved previews last
              for this visit; only session metadata stays in local storage.
            </p>
          </aside>
          <section className="studio-preview" aria-label="Try-on preview">
            <div className="preview-toolbar">
              <span role="status">
                {isAR
                  ? `Face Tracking: ${status.tracking}`
                  : isNecklace
                    ? `Pose Tracking: ${status.tracking}`
                    : 'Manual overlay preview'}
              </span>
              <span>
                {source?.kind === 'snapshot' ? 'SNAPSHOT' : source?.live ? 'LIVE' : 'PHOTO'}
              </span>
            </div>
            {canvasStage}
            <div className="preview-bottom">
              <Tabs
                label="Before and after"
                tabs={[
                  { value: 'before', label: 'Before' },
                  { value: 'after', label: 'After' },
                  { value: 'compare', label: 'Compare' },
                ]}
                value={view}
                onChange={setView}
              />
              <span className="text-xs">
                {source?.composite
                  ? 'Captured result'
                  : controls.auto
                    ? 'Automatic alignment'
                    : 'Manual placement'}
              </span>
            </div>
            {view === 'compare' && (
              <label className="range-control m-3">
                <span>Comparison split</span>
                <input
                  aria-label="Comparison split"
                  type="range"
                  min="0"
                  max="100"
                  value={compare}
                  onChange={(e) => setCompare(Number(e.target.value))}
                />
              </label>
            )}
            {(loadingPhoto || status.tracking === 'Loading face detector') && (
              <p className="face-feedback" role="status">
                {loadingPhoto ? 'Opening photo…' : 'Loading AR model…'}
              </p>
            )}
            {isAR && status.assetNotice && (
              <p className="face-feedback" role="status">
                {status.assetNotice}
              </p>
            )}
            {notice && (
              <p className="face-feedback face-error" role="alert">
                {notice}
              </p>
            )}
            {(isAR || isNecklace) && source && status.tracking === 'Lost' && (
              <p className="face-feedback" role="status">
                {isNecklace
                  ? 'No shoulder pose detected. Keep both shoulders in view or upload another photo.'
                  : 'No face detected. Please face the camera directly or upload another photo.'}
              </p>
            )}
            {(isAR || isNecklace) &&
              source &&
              !source.composite &&
              ['Unavailable', 'Lost'].includes(status.tracking) && (
                <Button className="m-3" variant="studio" onClick={() => setRetry((n) => n + 1)}>
                  Retry detection
                </Button>
              )}
            <div className="face-actions">
              <Button
                variant="studio"
                disabled={Boolean(source?.composite)}
                onClick={() => {
                  setControls(controlsFor(mode));
                  setView('after');
                }}
              >
                <RotateCcw size={16} />
                Reset
              </Button>
              <Button
                variant="studio"
                disabled={!source?.live || !canExport || view !== 'after'}
                onClick={capture}
              >
                <Camera size={16} />
                {isAR || isNecklace ? 'Capture AR Result' : 'Capture snapshot'}
              </Button>
              <Button variant="studio" disabled={!canExport} onClick={download}>
                <Download size={16} />
                Download snapshot
              </Button>
            </div>
          </section>
          <aside className="studio-panel controls-panel">
            <h2>
              03 <span>{isAR || isNecklace ? 'Fine tune' : 'Make it yours'}</span>
            </h2>
            <fieldset disabled={Boolean(source?.composite)} className="face-fieldset">
              {(isAR || isNecklace) && (
                <label className="face-check">
                  <input
                    type="checkbox"
                    checked={controls.auto}
                    onChange={(e) => setControls((old) => ({ ...old, auto: e.target.checked }))}
                  />
                  Auto Align
                </label>
              )}
              <p className="text-sm mb-5">
                {source?.composite
                  ? 'Result captured. Retake or upload a photo to adjust the fit.'
                  : controls.auto
                    ? isNecklace
                      ? 'Follows your shoulders. Move naturally and capture when it sits well.'
                      : 'Follows your face. Use offsets to fine-tune the fit.'
                    : 'Manual placement. Position your accessory with the controls.'}
              </p>
              {style.kind === 'earrings' && (
                <label className="face-check">
                  <input
                    type="checkbox"
                    checked={controls.mirror}
                    onChange={(e) => setControls((old) => ({ ...old, mirror: e.target.checked }))}
                  />
                  Mirror Adjustment
                </label>
              )}
              {[
                { key: 'x', label: 'X offset', min: -50, max: 50, step: 0.5, unit: '%' },
                { key: 'y', label: 'Y offset', min: -50, max: 50, step: 0.5, unit: '%' },
                { key: 'scale', label: 'Scale', min: 0.25, max: 2.5, step: 0.05, unit: '×' },
                { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, unit: '°' },
                { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, unit: '%' },
              ].map((c) => (
                <label className="range-control" key={c.key}>
                  <span>
                    {c.label}
                    <b>
                      {controls[c.key]}
                      {c.unit}
                    </b>
                  </span>
                  <input
                    aria-label={c.label}
                    type="range"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={controls[c.key]}
                    onChange={(e) =>
                      setControls((old) => ({ ...old, [c.key]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))}
            </fieldset>
            <Button
              className="studio-start w-full"
              busy={busy}
              disabled={!canExport || Boolean(saved)}
              onClick={save}
            >
              <Save size={16} />
              {saved ? 'Try-On saved' : 'Save Try-On'}
            </Button>
            {saveError && (
              <p className="face-feedback face-error" role="alert">
                {saveError}
              </p>
            )}
            {pendingLocal && (
              <Button
                className="w-full mt-3"
                variant="studio"
                onClick={() => storeSession(pendingLocal, false)}
              >
                Save as Local Demo
              </Button>
            )}
            {saved && (
              <p className="face-feedback" role="status">
                {saved}. Demo / Local session; no database persistence.
              </p>
            )}
            <Button
              className="w-full mt-3"
              variant="studio"
              disabled={!product?.stockQuantity}
              onClick={() => addToCart(product)}
            >
              <ShoppingBag size={16} />
              Add product to cart
            </Button>
            <Link className="demo-photo-link" to="/dashboard/customer/try-on-history">
              View your demo history →
            </Link>
            <p className="studio-privacy">
              {style.kind === 'earrings'
                ? 'Place the earrings manually. Use Mirror Adjustment for symmetrical spacing.'
                : 'A 2D style preview, not a measurement of physical fit.'}
            </p>
          </aside>
        </fieldset>
        <p className="face-footnote">
          {isAR ? <Glasses size={16} /> : <Gem size={16} />}{' '}
          {isAR
            ? 'One face at a time · Face forward in good light · A visual preview, not a measurement of physical fit'
            : 'Manual prototype · Automatic shirt and jewelry fitting are not implemented'}
        </p>
      </div>
    </div>
  );
}
