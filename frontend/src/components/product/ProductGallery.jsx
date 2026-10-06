import { useEffect, useRef, useState } from 'react';
import { productGallerySources } from '../../services/catalog';
import { ProductImage } from './ProductCard';

export default function ProductGallery({ product }) {
  const images = productGallerySources(product);
  const [selected, setSelected] = useState(0),
    [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const current = images[selected] ?? images[0];
  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  const move = (step) => setSelected((index) => (index + step + images.length) % images.length);
  const keyboard = (event) => {
    if (images.length < 2) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    }
  };
  if (!current) return <ProductImage product={product} />;
  return (
    <div className="product-gallery">
      <button
        className="gallery-main"
        type="button"
        aria-label={`Enlarge ${product.name} image`}
        onClick={() => setOpen(true)}
      >
        <ProductImage product={{ ...product, imageUrl: current }} />
      </button>
      {images.length > 1 && (
        <div
          className="gallery-thumbnails"
          aria-label={`${product.name} image views`}
          onKeyDown={keyboard}
        >
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              aria-label={`View ${product.name} image ${index + 1}`}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              <img src={src} alt={`${product.name} view ${index + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        className="product-lightbox"
        aria-label={`${product.name} image gallery`}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onKeyDown={keyboard}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="lightbox-content">
          <div className="lightbox-toolbar">
            <h2>{product.name}</h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
              autoFocus
            >
              Close image gallery
            </button>
          </div>
          <ProductImage
            product={{
              ...product,
              name: `${product.name} enlarged view ${selected + 1}`,
              imageUrl: current,
            }}
          />
          {images.length > 1 && (
            <div className="lightbox-navigation">
              <button
                type="button"
                className="btn btn-ghost"
                aria-label="Previous product image"
                onClick={() => move(-1)}
              >
                Previous
              </button>
              <span aria-live="polite">
                {selected + 1} / {images.length}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label="Next product image"
                onClick={() => move(1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
