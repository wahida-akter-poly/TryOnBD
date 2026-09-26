import { Heart, ScanLine, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Badge, IconButton, Price, Rating } from '../common/UI';

export function ProductImage({ product, className = '', ...props }) {
  return (
    <img
      className={className}
      src={product.imageUrl || '/assets/product.svg'}
      alt={product.name}
      loading="lazy"
      onError={(e) => {
        if (!e.currentTarget.src.endsWith('/assets/product.svg'))
          e.currentTarget.src = '/assets/product.svg';
      }}
      {...props}
    />
  );
}
export default function ProductCard({ product }) {
  const { state, toggleWishlist } = useApp();
  const wished = state.wishlist.includes(product.id);
  const seller = state.sellers.find((s) => s.id === product.sellerId);
  const category = state.categories.find((c) => c.id === product.categoryId);
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
        <Link className="product-try" to={`/try-on?product=${product.id}`}>
          <ScanLine size={15} />
          Try it on
          <ArrowUpRight size={15} />
        </Link>
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
    </article>
  );
}
