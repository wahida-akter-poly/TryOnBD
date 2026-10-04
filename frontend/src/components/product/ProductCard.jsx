import { Heart, ScanLine, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Badge, Button, IconButton, Price, Rating } from '../common/UI';
import { supportsFaceAR } from '../../data/faceAccessories';
import { useState } from 'react';

export function ProductImage({ product, className = '', ...props }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const sunglasses = product.accessoryKind === 'sunglasses';
  if (sunglasses && (!product.imageUrl || failedSrc === product.imageUrl))
    return (
      <span role="img" aria-label={`${product.name}: product photo unavailable`}>
        Product photo unavailable
      </span>
    );
  return (
    <img
      className={`${className}${sunglasses ? ' sunglasses-product-photo' : ''}`}
      src={product.imageUrl || '/assets/product.svg'}
      alt={product.name}
      loading="lazy"
      onError={(e) => {
        if (sunglasses) {
          setFailedSrc(product.imageUrl);
          return;
        }
        if (!e.currentTarget.src.endsWith('/assets/product.svg'))
          e.currentTarget.src = '/assets/product.svg';
      }}
      {...props}
    />
  );
}
export default function ProductCard({ product }) {
  const { state, addToCart, toggleWishlist } = useApp();
  const wished = state.wishlist.includes(product.id);
  const seller = state.sellers.find((s) => s.id === product.sellerId);
  const category = state.categories.find((c) => c.id === product.categoryId);
  const canTryOn =
    supportsFaceAR(product) ||
    ['tshirt', 'SHIRT', 'CLOTHING'].includes(product.arType) ||
    ['CLOTHING'].includes(product.tryOnType);
  return (
    <article className="product-card">
      <div className="product-image" style={{ background: product.color || '#eeeae2' }}>
        <Link to={`/products/${product.id}`} aria-label={`View ${product.name}`}>
          <ProductImage product={product} />
        </Link>
        {product.badge && <Badge>{product.badge}</Badge>}
        <IconButton
          label={`${wished ? 'Remove' : 'Add'} ${product.name} ${wished ? 'from' : 'to'} wishlist`}
          className={wished ? 'wished' : ''}
          onClick={() => toggleWishlist(product.id)}
        >
          <Heart size={17} fill={wished ? 'currentColor' : 'none'} />
        </IconButton>
        {canTryOn && (
          <Link className="product-try" to={`/try-on?productId=${product.id}`}>
            <ScanLine size={15} />
            Try Virtually
            <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
      <div className="product-meta">
        <span>
          {category?.categoryName || 'Fashion'} · {seller?.businessName || 'Demo seller'}
        </span>
        <Rating value={product.rating || 0} />
      </div>
      <h3>
        <Link to={`/products/${product.id}`}>{product.name}</Link>
      </h3>
      <div className="flex justify-between items-center mt-2">
        <Price value={product.price} />
        <span className={`stock ${product.stockQuantity === 0 ? 'out' : ''}`}>
          {product.stockQuantity === 0
            ? 'Out of stock'
            : product.stockQuantity < 6
              ? `Only ${product.stockQuantity} left`
              : 'In stock'}
        </span>
      </div>
      <Link className="details-link" to={`/products/${product.id}`}>
        View details <ArrowUpRight size={12} />
      </Link>
      <div className="product-card-actions">
        {canTryOn && (
          <Link className="btn btn-secondary" to={`/try-on?productId=${product.id}`}>
            <ScanLine size={15} />
            Try Virtually
          </Link>
        )}
        <Button variant="secondary" disabled={!product.stockQuantity} onClick={() => addToCart(product)}>
          Add to Cart
        </Button>
      </div>
    </article>
  );
}
