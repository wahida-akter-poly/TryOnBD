import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
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
  async function updateCart(productId, quantity) {
    setBusy(true);
    try {
      await cartQuantity(productId, quantity);
    } finally {
      setBusy(false);
    }
  }
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
  if (identity.role !== 'customer') return <Navigate to="/seller/dashboard" replace />;
  if (catalogLoading) return <LoadingState />;
  const items = state.cart.map((item) => ({
    ...item,
    product: state.products.find((p) => p.id === item.productId),
  }));
  const pricingAvailable = items.every((item) => item.product);
  const subtotal = items.reduce(
    (sum, item) => sum + (item.product ? Number(item.product.price) * item.quantity : 0),
    0,
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
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
        <ErrorState message={accountError} retry={() => refreshAccount()} />
      ) : catalogError ? (
        <ErrorState message={catalogError} retry={refreshCatalog} />
      ) : !items.length ? (
        <section className="cart-empty panel">
          <EmptyState
            title="Your cart is empty"
            text="Find something you love in the collection."
          />
          <Link className="btn btn-primary" to="/products">
            Continue Shopping
          </Link>
        </section>
      ) : (
        <div className="customer-cart-layout">
          <section className="customer-cart-items" aria-label="Shopping cart">
            <div className="customer-cart-heading">
              <h2>Your items</h2>
              <span>
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            </div>
            <fieldset disabled={busy} className="face-fieldset customer-cart-fieldset">
              {items.map((item) => (
                <article className="customer-cart-item" key={item.productId}>
                  {item.product ? (
                    <ProductImage product={item.product} className="customer-cart-image" />
                  ) : (
                    <div className="customer-cart-image" aria-hidden="true" />
                  )}
                  <div className="customer-cart-product">
                    <Link to={`/products/${item.productId}`}>
                      <h3>{item.product?.name || `Product ${item.productId}`}</h3>
                    </Link>
                    <p className="customer-cart-unit-price">
                      {item.product ? <Price value={item.product.price} /> : 'Price unavailable'}
                    </p>
                    <div className="customer-cart-actions">
                      <div className="customer-cart-quantity" aria-label="Quantity controls">
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Decrease ${item.product?.name || 'item'} quantity`}
                          disabled={!item.product || item.quantity <= 1}
                          onClick={() => updateCart(item.productId, item.quantity - 1)}
                        >
                          <Minus size={16} />
                        </Button>
                        <span aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Increase ${item.product?.name || 'item'} quantity`}
                          disabled={!item.product || item.quantity >= item.product.stockQuantity}
                          onClick={() => updateCart(item.productId, item.quantity + 1)}
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Remove ${item.product?.name || 'item'}`}
                        onClick={() => updateCart(item.productId, 0)}
                      >
                        <Trash2 size={16} /> Remove
                      </Button>
                    </div>
                    {item.product && <small>{item.product.stockQuantity} available</small>}
                  </div>
                  <strong className="customer-cart-line-total">
                    {item.product ? (
                      <Price value={Number(item.product.price) * item.quantity} />
                    ) : (
                      '—'
                    )}
                  </strong>
                </article>
              ))}
            </fieldset>
            <Link className="btn btn-ghost customer-continue-shopping" to="/products">
              Continue Shopping
            </Link>
          </section>
          <aside className="customer-order-summary">
            <h2>Order Summary</h2>
            <div>
              <span>Subtotal ({itemCount} items)</span>
              <strong>
                <Price value={subtotal} />
              </strong>
            </div>
            <div>
              <span>Shipping</span>
              <strong>Calculated at checkout</strong>
            </div>
            <div className="customer-estimated-total">
              <span>Estimated Total</span>
              <strong>
                <Price value={subtotal} />
              </strong>
            </div>
            {!pricingAvailable && (
              <p role="alert">
                Pricing is unavailable for removed products. Remove these items before placing an
                order.
              </p>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <Button busy={busy} disabled={!pricingAvailable || busy} onClick={checkout}>
              Proceed to Checkout
            </Button>
            <p>Shipping is calculated during checkout. Payment is arranged separately.</p>
          </aside>
        </div>
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
