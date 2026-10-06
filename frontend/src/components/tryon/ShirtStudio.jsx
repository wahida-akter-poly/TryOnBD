import { Camera, Upload, Download, RotateCcw } from 'lucide-react';
import { Button, Select } from '../common/UI';

// Presentation only; the existing TryOn page owns camera, upload and exports.
export default function ShirtStudio({
  product,
  products,
  chooseProduct,
  canvasStage,
  source,
  status,
  notice,
  camera,
  busy,
  canExport,
  onCamera,
  onStop,
  upload,
  capture,
  download,
  save,
  saved,
  saveError,
  reset,
  retry,
}) {
  const label = source?.composite
    ? 'Captured'
    : status.tracking === 'Active'
      ? 'Torso fitted'
      : source
        ? 'Finding your torso…'
        : 'Ready when you are';
  return (
    <div className="studio-page face-studio simple-eyewear">
      <div className="container">
        <header className="eyewear-heading">
          <h1>Try your T-shirt.</h1>
          <p>{product.name}</p>
        </header>
        <fieldset disabled={busy} className="face-fieldset eyewear-studio">
          <Select
            label="Selected product"
            value={product.id}
            onChange={(e) => chooseProduct(e.target.value)}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <section className="studio-preview" aria-label="Try-on preview">
            <div className="preview-toolbar">
              <span role="status">{label}</span>
            </div>
            {canvasStage}
          </section>
          <div className="eyewear-input" role="group" aria-label="Input source">
            <Button
              variant="studio"
              busy={camera.status === 'Requesting Permission'}
              disabled={camera.status === 'Camera Active'}
              onClick={onCamera}
            >
              <Camera size={18} />
              Camera
            </Button>
            <label className="btn btn-studio eyewear-upload">
              <Upload size={18} />
              Upload Photo
              <input
                aria-label="Upload photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={upload}
              />
            </label>
            {(source?.live || camera.status === 'Requesting Permission') && (
              <Button variant="ghost" onClick={onStop}>
                Stop camera
              </Button>
            )}
            {camera.devices.length > 1 && source?.live && (
              <Button variant="ghost" onClick={camera.switchCamera}>
                Switch camera
              </Button>
            )}
          </div>
          <p className="eyewear-privacy">
            Stand back so both shoulders and hips are visible. Your photos stay in your browser.
          </p>
          {notice && (
            <p className="face-feedback face-error" role="alert">
              {notice}
            </p>
          )}
          {source && status.detectorError && status.detectorError !== notice && (
            <p className="face-feedback face-error" role="alert">
              {status.detectorError}
            </p>
          )}
          {source && status.bodyNotice && !source.composite && (
            <p role="status">{status.bodyNotice}</p>
          )}
          {saveError && (
            <p role="alert" className="error-text">
              {saveError}
            </p>
          )}
          <div className="eyewear-primary-actions">
            <Button disabled={!canExport} onClick={save}>
              {saved || 'Save Try-On'}
            </Button>
            <Button disabled={!source?.live || !canExport} onClick={capture}>
              <Camera size={18} />
              Capture
            </Button>
            <Button variant="ghost" disabled={!canExport} onClick={download}>
              <Download size={18} />
              Download PNG
            </Button>
            <Button variant="ghost" disabled={!!source?.composite} onClick={reset}>
              <RotateCcw size={18} />
              Reset Fit
            </Button>
            <Button variant="ghost" onClick={retry}>
              Retry fitting
            </Button>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
