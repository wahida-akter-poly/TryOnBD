import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { services } from '../../services';
import { normalizeProduct } from '../../services/catalog';
import { errorMessage } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Button, Price, LoadingState, ErrorState } from '../../components/common/UI';
import ProductGallery from '../../components/product/ProductGallery';
import TryOnModal from '../../components/tryon/TryOnModal';
export default function ProductDetails() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tryOnOpen = params.get('tryOn') === 'true';
  function toggleTryOn(open) {
    const next = new URLSearchParams(params);
    if (open) next.set('tryOn', 'true');
    else next.delete('tryOn');
    setParams(next, { replace: true, preventScrollReset: true });
  }
  const { state, addToCart, identity } = useApp();
  const [product, setProduct] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setProduct(null);
    setError('');
    if (!/^[1-9]\d*$/.test(id)) {
      setError('Choose a valid product from the collection.');
      return;
    }
    services.products
      .get(id)
      .then(({ data }) => {
        if (active) setProduct(normalizeProduct(data));
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  if (error)
    return (
      <div className="container page">
        <ErrorState message={error} retry={() => setRetry((n) => n + 1)} />
      </div>
    );
  if (!product) return <LoadingState />;
  return (
    <div className="container page">
      <Link to="/products">Back to shop</Link>
      <div className="production-details">
        <ProductGallery key={product.id} product={product} />
        <section>
          <span className="eyebrow">
            {product.categoryName ||
              state.categories.find((c) => c.id === product.categoryId)?.categoryName ||
              'Collection'}
          </span>
          <h1>{product.name}</h1>
          <Price value={product.price} />
          <p>{product.description}</p>
          {product.sellerName && <p>Sold by {product.sellerName}</p>}
          <p>{product.stockQuantity > 0 ? `${product.stockQuantity} available` : 'Out of stock'}</p>
          {product.arAvailable && (
            <Button onClick={() => toggleTryOn(true)}>
              Try Virtually
            </Button>
          )}{' '}
          {product.engine && !product.arAvailable && (
            <p>Virtual try-on is unavailable for this product.</p>
          )}
          {identity ? (
            <Button
              busy={busy}
              disabled={product.stockQuantity < 1}
              onClick={async () => {
                setBusy(true);
                try {
                  await addToCart(product);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add to Cart
            </Button>
          ) : (
            <Link className="btn btn-ghost" to="/login">
              Sign in to shop
            </Link>
          )}
        </section>
      </div>
      {tryOnOpen && product.arAvailable && <TryOnModal key={product.id} product={product} onClose={() => toggleTryOn(false)} />}
    </div>
  );
}
