import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { services } from '../../services';
import { errorMessage } from '../../services/api';
import { Button, EmptyState, ErrorState, Price, LoadingState } from '../../components/common/UI';
import { ProductImage } from '../../components/product/ProductCard';
export default function Checkout() {
  const {
    state,
    identity,
    restoring,
    accountError,
    refreshAccount,
    cartQuantity,
    refreshCatalog,
    catalogLoading,
    catalogError,
  } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const navigate = useNavigate();
  if (restoring) return <LoadingState />;
  if (!identity)
    return (
      <div className="container page">
        <h1>Your cart</h1>
        <Link className="btn btn-primary" to="/login">
          Sign in to view your cart
        </Link>
      </div>
    );
  if (catalogLoading) return <LoadingState />;
  const items = state.cart.map((item) => ({
    ...item,
    product: state.products.find((p) => p.id === item.productId),
  }));
  const pricingAvailable = items.every((item) => item.product);
  async function checkout() {
    setBusy(true);
    setError('');
    try {
      const { data } = await services.account.checkout();
      await Promise.all([refreshAccount(), refreshCatalog()]);
      navigate(`/invoice/${data.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <h1>Your cart</h1>
      {accountError ? (
        <ErrorState message={accountError} retry={() => refreshAccount().catch(() => {})} />
      ) : catalogError ? (
        <ErrorState message={catalogError} retry={refreshCatalog} />
      ) : !items.length ? (
        <EmptyState title="Your cart is empty" text="Find something you love in the collection." />
      ) : (
        <>
          <fieldset disabled={busy} className="face-fieldset">
            {items.map((item) => (
              <article className="panel cart-row" key={item.productId}>
                {item.product && (
                  <ProductImage product={item.product} className="catalog-thumbnail" />
                )}
                <Link to={`/products/${item.productId}`}>
                  {item.product?.name || `Product ${item.productId}`}
                </Link>
                {item.product && <Price value={item.product.price} />}
                <input
                  aria-label={`Quantity for ${item.product?.name || item.productId}`}
                  disabled={!item.product}
                  type="number"
                  min="1"
                  max={item.product?.stockQuantity}
                  value={item.quantity}
                  onChange={async (e) => {
                    setBusy(true);
                    try {
                      await cartQuantity(item.productId, Number(e.target.value));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await cartQuantity(item.productId, 0);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remove
                </Button>
              </article>
            ))}
            {pricingAvailable ? (
              <p>
                Total{' '}
                <Price
                  value={items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)}
                />
              </p>
            ) : (
              <p role="alert">
                Pricing is unavailable for removed products. Remove these items before placing an
                order.
              </p>
            )}
            <p>Place your order for seller confirmation. Payment is arranged separately.</p>
            <Button busy={busy} disabled={!pricingAvailable} onClick={checkout}>
              Place order
            </Button>
          </fieldset>
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
export function Invoice() {
  const { state, identity, restoring, accountError } = useApp();
  const { id } = useParams();
  const order = state.orders.find((o) => String(o.id) === id);
  if (restoring) return <LoadingState />;
  return (
    <div className="container page">
      <h1>Order confirmation</h1>
      {!identity ? (
        <Link to="/login">Sign in</Link>
      ) : accountError ? (
        <ErrorState message={accountError} />
      ) : order ? (
        <>
          <h2>Order #{order.id}</h2>
          <p>{order.orderStatus}</p>
          <Price value={order.totalAmount} />
          {order.items?.map((item) => (
            <p key={item.productId}>
              {item.name} x {item.quantity}
            </p>
          ))}
          <p>{new Date(order.createdAt).toLocaleString()}</p>
          <Link to="/dashboard/customer/orders">Your orders</Link>
        </>
      ) : (
        <EmptyState title="Order not found" />
      )}
    </div>
  );
}
