import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, Upload, ScanLine, Download, ShoppingBag, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/common/UI';
import CanvasPreview, { loadImage } from '../../components/tryon/CanvasPreview';
import { defaultControls } from '../../components/tryon/faceGeometry';
import { accessoryStyles, sunglassesAssetFor } from '../../data/faceAccessories';
import { useTryOnCamera } from '../../hooks/useTryOnCamera';
import { services } from '../../services';
import { normalizeProduct } from '../../services/catalog';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/UI';
import { errorMessage } from '../../services/api';
import ShirtOverlay from '../../components/tryon/ShirtOverlay.jsx';
import ShirtStudio from '../../components/tryon/ShirtStudio.jsx';
import { shirtCalibration } from '../../data/shirtProducts.js';
import NecklaceOverlay from '../../components/tryon/NecklaceOverlay.jsx';

const blobFrom = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not create the snapshot. Please retry.')),
      'image/png',
    ),
  );
const modeFor = (product) => product?.engine;
const controlsFor = (mode, shirt = false) => ({
  ...defaultControls(),
  auto: mode === 'sunglasses' || mode === 'necklace' || shirt,
});

export default function TryOn() {
  const [params] = useSearchParams();
  const requested = params.get('productId');
  const { state, catalogLoading, catalogError, refreshCatalog } = useApp();
  const [product, setProduct] = useState(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setProduct(null);
    setError('');
    if (!requested) return;
    if (!/^[1-9]\d*$/.test(requested)) {
      setError('Choose a valid product from the collection.');
      return;
    }
    services.products
      .get(requested)
      .then(({ data }) => {
        if (active) setProduct(normalizeProduct(data));
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [requested, retry]);
  if (requested && error)
    return (
      <div className="container page">
        <ErrorState message={error} retry={() => setRetry((n) => n + 1)} />
      </div>
    );
  if (requested && (!product || String(product.id) !== requested)) return <LoadingState />;
  if (product && !product.engine)
    return (
      <div className="container page">
        <EmptyState title="Virtual try-on is unavailable for this product" />
      </div>
    );
  if (product && !product.imageUrl)
    return (
      <div className="container page">
        <EmptyState
          title="No product image uploaded"
          text="This product needs an image before virtual try-on is available."
        />
      </div>
    );
  if (!requested)
    return (
      <div className="container page">
        <h1>Choose your next look</h1>
        <p>Select a product to begin virtual try-on. Then start your camera or upload a photo.</p>
        {catalogLoading ? (
          <LoadingState />
        ) : catalogError ? (
          <ErrorState message={catalogError} retry={refreshCatalog} />
        ) : state.products.some((p) => p.engine) ? (
          <div className="product-grid">
            {state.products
              .filter((p) => p.engine)
              .map((p) => (
                <Link className="panel" key={p.id} to={`/try-on?productId=${p.id}`}>
                  {p.name}
                </Link>
              ))}
          </div>
        ) : (
          <EmptyState title="No try-on products yet" />
        )}
      </div>
    );
  return <TryOnStudio key={product.id} product={product} />;
}
function TryOnStudio({ product }) {
  const { state, identity, refreshAccount, addToCart, registerMedia, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const arDebug = false;
  const [adjustFit, setAdjustFit] = useState(false);
  const products = state.products.filter((p) => p.engine);
  const mode = modeFor(product),
    isAR = mode === 'sunglasses';
  const isNecklace = mode === 'necklace';
  const isShirt = product?.engine === 'clothing';
  const shirtFit = useMemo(() => (isShirt ? shirtCalibration(product) : null), [product, isShirt]);
  const [styleId, setStyleId] = useState(product?.accessoryStyle || 'aviator');
  const style = isShirt
    ? { id: 'tshirt', kind: 'tshirt', overlayAsset: shirtFit.asset }
    : isNecklace
      ? { id: 'necklace', kind: 'necklace', overlayAsset: product.imageUrl }
      : accessoryStyles.find((s) => s.id === product.accessoryStyle) || accessoryStyles[0];
  const glassesAsset = isAR ? sunglassesAssetFor(product, style) : null;
  const overlay = product.imageUrl;
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
  async function save() {
    if (!identity) {
      toast('Sign in to save your try-on session.', 'error');
      return;
    }
    if (!canExport || busy) return;
    setBusy(true);
    setSaveError('');
    try {
      const snapshot = preview.current?.snapshot();
      if (!snapshot) throw new Error('Capture a try-on first.');
      await services.sessions.create({
        productId: product.id,
        inputImageUrl: `urn:tryonbd:capture:${source.kind}:${snapshot.result.width}x${snapshot.result.height}`,
        tryOnType: product.arType,
      });
      await refreshAccount();
      setSaved('Try-on session saved');
      toast('Try-on session saved');
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
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
        save={save}
        saved={saved}
        saveError={saveError}
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
            {saved && (
              <p role="status">
                Try-on saved.{' '}
                {identity?.role === 'customer' && (
                  <Link to="/dashboard/customer/try-on-history">View saved try-ons</Link>
                )}
              </p>
            )}
            <p className="eyewear-privacy">Your camera and photos stay in your browser.</p>
          </fieldset>
        </div>
      </div>
    );
  }
  if (isAR && !arDebug) {
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
            {products.filter((p) => p.engine === 'sunglasses' && p.id !== product.id).length >
              0 && (
              <section className="eyewear-frames" aria-label="Other eyewear">
                <h2>Explore more frames</h2>
                {products
                  .filter((p) => p.engine === 'sunglasses' && p.id !== product.id)
                  .map((p) => (
                    <Link className="btn btn-ghost" key={p.id} to={`/try-on?productId=${p.id}`}>
                      {p.name}
                    </Link>
                  ))}
              </section>
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
            {saved && (
              <p role="status">
                Try-on saved.{' '}
                {identity?.role === 'customer' && (
                  <Link to="/dashboard/customer/try-on-history">View saved try-ons</Link>
                )}
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
  return <EmptyState title="Virtual try-on is unavailable" />;
}
