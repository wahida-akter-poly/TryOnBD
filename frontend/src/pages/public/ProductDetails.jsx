import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Heart, ScanLine, ShoppingBag, ArrowUpRight, Check, Truck, Leaf } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import ProductCard, { ProductImage } from '../../components/product/ProductCard';
import ReviewForm from '../../components/product/ReviewForm';
import {
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  EmptyState,
  Modal,
  Price,
  Rating,
  Tabs,
} from '../../components/common/UI';
import { date } from '../../utils/format';
import { supportsFaceAR } from '../../data/faceAccessories';

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, addToCart, toggleWishlist, setCartOpen } = useApp();
  const [tab, setTab] = useState('story');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [angle, setAngle] = useState(0);
  const product = state.products.find((p) => String(p.id) === id);
  if (!product)
    return (
      <div className="container page">
        <EmptyState
          title="This piece is no longer in the edit"
          action={
            <Link className="btn btn-primary" to="/products">
              Browse the collection
            </Link>
          }
        />
      </div>
    );
  const reviews = state.reviews.filter((r) => r.productId === product.id);
  const seller = state.sellers.find((s) => s.id === product.sellerId);
  const category = state.categories.find((c) => c.id === product.categoryId);
  const wished = state.wishlist.includes(product.id);
  return (
    <div className="container page">
      <Breadcrumbs
        items={[{ label: 'The collection', to: '/products' }, { label: product.name }]}
      />
      <div className="product-detail-grid">
        <div>
          <div className={`detail-image angle-${angle}`} style={{ background: product.color }}>
            <ProductImage product={product} loading="eager" />
            {product.badge && <Badge>{product.badge}</Badge>}
          </div>
          <div className="gallery-thumbnails">
            {['Full view', 'Detail crop', 'Close-up'].map((name, i) => (
              <button
                key={name}
                aria-label={name}
                aria-pressed={angle === i}
                onClick={() => setAngle(i)}
              >
                <ProductImage product={product} style={{ transform: `scale(${1 + i * 0.35})` }} />
              </button>
            ))}
          </div>
          <small className="muted">Gallery uses alternate crops of the demo product image.</small>
        </div>
        <div className="detail-copy">
          <span className="eyebrow">
            {category?.categoryName} · {seller?.businessName}
          </span>
          <h1>{product.name}</h1>
          <div className="flex items-center gap-3">
            <Rating value={product.rating || 0} />
            <span className="muted text-sm">{reviews.length} demo reviews</span>
          </div>
          <Price value={product.price} className="detail-price" />
          <p>
            {product.description ||
              'A thoughtfully selected addition to the TryOnBD demo collection.'}
          </p>
          <div className="stock-note">
            <Check size={16} />
            {product.stockQuantity
              ? `${product.stockQuantity} available in demo stock`
              : 'Currently out of stock'}
          </div>
          {supportsFaceAR(product) ? <Link className="btn btn-primary w-full" to={`/try-on?productId=${id}`}>
            <ScanLine size={18} />
            Try on virtually
            <ArrowUpRight size={17} />
          </Link> : <p className="muted text-sm">{product.tryOnType === 'CLOTHING' ? 'AI Clothing Try-On — Phase 2' : 'Necklace / body fitting is not available in Phase 1.'}</p>}
          <div className="flex gap-3 mt-3">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={!product.stockQuantity}
              onClick={() => {
                if (addToCart(product)) setCartOpen(true);
              }}
            >
              <ShoppingBag size={17} />
              Add to bag
            </Button>
            <Button
              variant="secondary"
              aria-label="Toggle wishlist"
              onClick={() => toggleWishlist(product.id)}
            >
              <Heart size={18} fill={wished ? 'currentColor' : 'none'} />
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full mt-2"
            disabled={!product.stockQuantity}
            onClick={() => {
              if (addToCart(product)) navigate('/checkout');
            }}
          >
            Buy with demo checkout <ArrowUpRight size={15} />
          </Button>
          <div className="detail-assurances">
            <span>
              <Leaf size={17} />
              Locally inspired design
            </span>
            <span>
              <ScanLine size={17} />
              Preview your next look
            </span>
          </div>
          <div className="seller-mini">
            <Avatar name={seller?.businessName || 'Demo Seller'} />
            <div>
              <strong>{seller?.businessName || 'Demo seller'}</strong>
              <p>{seller?.contactEmail}</p>
              <small>Fictional seller · Bangladesh</small>
            </div>
          </div>
        </div>
      </div>
      <section className="detail-tabs">
        <Tabs
          tabs={[
            { value: 'story', label: 'The details' },
            { value: 'reviews', label: `Reviews (${reviews.length})` },
            { value: 'delivery', label: 'Ordering information' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'story' && (
          <div className="prose-panel">
            <h3>A little more about this piece</h3>
            <p>{product.description || 'Part of our fictional Bangladeshi fashion collection.'}</p>
            <p>
              Sunglasses and head jewelry use browser face landmarks in the virtual studio.
              The 2D preview does not measure physical fit or size.
            </p>
          </div>
        )}
        {tab === 'delivery' && (
          <div className="prose-panel">
            <h3>A transparent demo experience</h3>
            <p>
              Checkout creates a local demo invoice and sends only the supported order summary to
              Spring Boot. No payment is taken, and no shipping is arranged.
            </p>
          </div>
        )}
        {tab === 'reviews' && (
          <div className="prose-panel">
            <div className="flex justify-between items-center mb-6">
              <h3>From the demo community</h3>
              <Button variant="secondary" onClick={() => setReviewOpen(true)}>
                Write a review
              </Button>
            </div>
            {reviews.length ? (
              reviews.map((r) => (
                <article className="review" key={r.id}>
                  <Avatar
                    name={state.users.find((u) => u.id === r.userId)?.fullName || 'Demo customer'}
                  />
                  <div>
                    <strong>
                      {state.users.find((u) => u.id === r.userId)?.fullName || 'Demo customer'}
                    </strong>
                    <div className="flex gap-4 my-2">
                      <Rating value={r.rating} />
                      <small className="muted">
                        {date(r.date)} · {r.sync}
                      </small>
                    </div>
                    <p>{r.comment}</p>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                title="Start the conversation"
                description="Be the first to leave a demo review."
              />
            )}
          </div>
        )}
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A FEW MORE POSSIBILITIES</span>
            <h2>You might also love.</h2>
          </div>
          <Link to="/products" className="text-link">
            Explore more
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="product-grid">
          {state.products
            .filter((p) => p.id !== product.id)
            .sort(
              (a, b) =>
                Number(b.categoryId === product.categoryId) -
                Number(a.categoryId === product.categoryId),
            )
            .slice(0, 4)
            .map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
        </div>
      </section>
      <Modal title="Share your thoughts" open={reviewOpen} onClose={() => setReviewOpen(false)}>
        <ReviewForm productId={product.id} onDone={() => setReviewOpen(false)} />
      </Modal>
    </div>
  );
}
