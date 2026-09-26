import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Eye, ShoppingBag, ScanLine } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { date } from '../../utils/format';
import ProductCard from '../product/ProductCard';
import { Button, EmptyState, Modal, StatusChip } from '../common/UI';
import { SessionImages } from './Management';

export function Wishlist() {
  const { state } = useApp();
  const products = state.products.filter((p) => state.wishlist.includes(p.id));
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">SAVED FOR A SECOND LOOK</span>
          <h1>Your little wishlist.</h1>
          <p>Favorites stay in this browser. No Wishlist API is used.</p>
        </div>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Room for a few favorites"
          action={
            <Link className="btn btn-primary" to="/products">
              Explore the collection
            </Link>
          }
        />
      )}
    </>
  );
}
export function TryOnHistory() {
  const { state, user, addToCart } = useApp();
  const [detail, setDetail] = useState(null);
  const sessions = state.sessions.filter((s) => s.userId === user.id);
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">ALL THE SIDES OF YOU</span>
          <h1>A look back.</h1>
          <p>Local try-on history. Uploaded image previews last for the current browser visit.</p>
        </div>
        <Link className="btn btn-primary" to="/try-on">
          <ScanLine size={17} />
          Try another look
        </Link>
      </div>
      {sessions.length ? (
        <div className="history-grid">
          {sessions.map((s) => {
            const product = state.products.find((p) => p.id === s.productId);
            return (
              <article className="panel history-card" key={s.id}>
                <SessionImages session={s} />
                <div className="p-5">
                  <div className="flex justify-between flex-wrap gap-2">
                    <h3>{product?.name || 'Removed demo product'}</h3>
                    <StatusChip status={s.sync} />
                  </div>
                  <p className="muted text-xs my-3">
                    {s.tryOnType} · {date(s.date)} · {s.id}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setDetail(s)}>
                      <Eye size={15} />
                      View
                    </Button>
                    <Link className="btn btn-secondary" to={`/try-on?product=${s.productId}`}>
                      Try again
                    </Link>
                    <Button disabled={!product?.stockQuantity} onClick={() => addToCart(product)}>
                      <ShoppingBag size={15} />
                      Buy piece
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Your next look starts here"
          action={
            <Link className="btn btn-primary" to="/try-on">
              Open the studio
            </Link>
          }
        />
      )}
      <Modal title="Your demo preview" open={Boolean(detail)} onClose={() => setDetail(null)}>
        {detail && <SessionImages session={detail} />}
      </Modal>
    </>
  );
}
