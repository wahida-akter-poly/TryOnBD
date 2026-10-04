import { useState } from 'react';
import { Link } from 'react-router-dom';
import { imageSource, arEngine } from '../../services/catalog';
import { Price } from '../common/UI';
export function ProductImage({ product, className = '', ...props }) {
  const src = imageSource(product.imageUrl);
  const [loaded, setLoaded] = useState(null),
    [failed, setFailed] = useState(null);
  if (!src || failed === src)
    return (
      <div
        className={`product-image-empty ${className}`}
        role="img"
        aria-label={`${product.name}: no product image uploaded`}
      >
        No product image uploaded
      </div>
    );
  return (
    <div className={`product-image-wrap ${className}`}>
      {loaded !== src && (
        <span role="status" className="image-loading">
          Loading image...
        </span>
      )}
      <img
        {...props}
        src={src}
        alt={product.name}
        loading="lazy"
        onLoad={() => setLoaded(src)}
        onError={() => setFailed(src)}
      />
    </div>
  );
}
export default function ProductCard({ product }) {
  return (
    <article className="product-card">
      <Link to={`/products/${product.id}`}>
        <div className="product-image">
          <ProductImage product={product} />
        </div>
        <h3>{product.name}</h3>
      </Link>
      <Price value={product.price} />
      <p className="muted">
        {product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : 'Out of stock'}
      </p>
      {arEngine(product.arType) && (
        <Link className="btn btn-ghost" to={`/try-on?productId=${product.id}`}>
          Try Virtually
        </Link>
      )}
    </article>
  );
}
