import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ArrowRight, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAsync } from '../../hooks/useAsync';
import {
  Breadcrumbs,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Price,
  StatusChip,
} from '../../components/common/UI';
import DemoNotice from '../../components/common/DemoNotice';
import { ProductImage } from '../../components/product/ProductCard';
import { date, money } from '../../utils/format';

export default function Checkout() {
  const { state, setState, user, mutate } = useApp();
  const navigate = useNavigate();
  const [promo, setPromo] = useState('');
  const [discountOn, setDiscountOn] = useState(false);
  const [promoError, setPromoError] = useState('');
  const { busy, error, run, setError } = useAsync();
  const [customer, setCustomer] = useState({
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
  });
  const lines = state.cart
    .map((x) => ({ ...x, product: state.products.find((p) => p.id === x.productId) }))
    .filter((x) => x.product);
  const subtotal = lines.reduce((n, x) => n + x.quantity * x.product.price, 0);
  const discount = discountOn ? Math.round(subtotal * 0.1) : 0;
  if (!lines.length)
    return (
      <div className="container page">
        <EmptyState
          title="Your bag is waiting for a little inspiration"
          action={
            <Link className="btn btn-primary" to="/products">
              Find your next favorite
            </Link>
          }
        />
      </div>
    );
  async function submit(e) {
    e.preventDefault();
    run(async () => {
      if (lines.some((x) => x.quantity > x.product.stockQuantity)) {
        setError('A quantity exceeds the current demo stock. Please update your bag.');
        return;
      }
      const result = await mutate(
        'orders',
        'create',
        { userId: user.testId || 1, totalAmount: subtotal - discount, orderStatus: 'PENDING' },
        null,
        {
          userId: user.id,
          customer,
          subtotal,
          discount,
          items: lines.map((x) => ({
            productId: x.productId,
            name: x.product.name,
            quantity: x.quantity,
            price: x.product.price,
          })),
        },
      );
      if (result.ok) {
        setState((old) => ({ ...old, cart: [] }));
        navigate(`/invoice/${result.record.id}`);
      } else setError(result.error);
    });
  }
  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: 'Collection', to: '/products' }, { label: 'Checkout' }]} />
      <div className="page-heading">
        <span className="eyebrow">ALMOST YOURS</span>
        <h1>A few final details.</h1>
        <p>Demo checkout. No payment is collected and no parcel is shipped.</p>
      </div>
      <DemoNotice />
      <form className="checkout-grid" onSubmit={submit}>
        <section className="panel p-7">
          <h2 className="mb-6">Your information</h2>
          <div className="form-grid">
            {Object.entries({
              fullName: 'Full name',
              email: 'Email address',
              phone: 'Phone number',
              address: 'Demo delivery address',
            }).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                value={customer[key]}
                type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                required
                onChange={(e) => setCustomer((old) => ({ ...old, [key]: e.target.value }))}
              />
            ))}
          </div>
          <div className="checkout-method">
            <Check size={20} />
            <div>
              <strong>Demo pay on delivery</strong>
              <p>This selection is UI only. Payments and shipping are future features.</p>
            </div>
          </div>
          <label className="check-label my-6">
            <input type="checkbox" required />I understand that this is a local demonstration order.
          </label>
          {error && <ErrorState message={error} />}
          <Button type="submit" className="w-full mt-5" busy={busy}>
            Place demo order · {money(subtotal - discount)}
            <ArrowRight size={17} />
          </Button>
        </section>
        <aside className="panel p-7">
          <h2 className="mb-6">Your edit</h2>
          {lines.map((x) => (
            <div className="checkout-line" key={x.productId}>
              <ProductImage product={x.product} />
              <div>
                <strong>{x.product.name}</strong>
                <p>Quantity {x.quantity}</p>
              </div>
              <Price value={x.quantity * x.product.price} />
            </div>
          ))}
          <div className="promo-form">
            <Input
              label="Promo code"
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="Try STYLE10"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const valid = promo.trim().toUpperCase() === 'STYLE10';
                setDiscountOn(valid);
                setPromoError(valid ? '' : 'Use STYLE10 for the demo 10% discount.');
              }}
            >
              Apply
            </Button>
          </div>
          {promoError && <p className="error-text">{promoError}</p>}
          <div className="totals">
            <div>
              <span>Subtotal</span>
              <Price value={subtotal} />
            </div>
            <div>
              <span>Demo discount {discountOn && '(10%)'}</span>
              <span>−{money(discount)}</span>
            </div>
            <div>
              <span>Shipping</span>
              <span>Not simulated</span>
            </div>
            <div className="total">
              <strong>Total</strong>
              <Price value={subtotal - discount} />
            </div>
          </div>
          <p className="muted text-xs mt-4">
            Cart items and invoice details stay in your browser. The API receives only userId,
            totalAmount, and orderStatus.
          </p>
        </aside>
      </form>
    </div>
  );
}
export function InvoiceContent({ order }) {
  const { state } = useApp();
  const customer = order.customer || state.users.find((u) => u.id === order.userId);
  return (
    <div className="invoice">
      <div className="invoice-top">
        <div>
          <h2>
            TryOnBD<span>.</span>
          </h2>
          <p>LOCAL DEMO INVOICE</p>
        </div>
        <StatusChip status={order.orderStatus} />
      </div>
      <div className="invoice-meta">
        <div>
          <small>PREPARED FOR</small>
          <strong>{customer?.fullName || 'Demo customer'}</strong>
          <p>{customer?.email}</p>
          <p>{customer?.address}</p>
        </div>
        <div>
          <small>LOCAL INVOICE REFERENCE</small>
          <strong>{order.id}</strong>
          <p>{date(order.date)}</p>
          <StatusChip status={order.sync} />
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((x, i) => (
              <tr key={i}>
                <td>{x.name}</td>
                <td>{x.quantity}</td>
                <td>{money(x.price)}</td>
                <td>{money(x.price * x.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!order.items?.length && (
        <p className="muted my-4">No local item lines are available for this demo order.</p>
      )}
      <div className="totals ml-auto max-w-sm">
        <div>
          <span>Subtotal</span>
          <Price value={order.subtotal ?? order.totalAmount} />
        </div>
        <div>
          <span>Discount</span>
          <span>−{money(order.discount || 0)}</span>
        </div>
        <div className="total">
          <strong>Total</strong>
          <Price value={order.totalAmount} />
        </div>
      </div>
      <p className="invoice-note">
        This is a local demonstration invoice. Its reference is not a database-generated order ID.
        Item lines are frontend-only; no payment has been collected.
      </p>
    </div>
  );
}
export function Invoice() {
  const { id } = useParams();
  const { state } = useApp();
  const order = state.orders.find((o) => o.id === id);
  return (
    <div className="container page invoice-page">
      {order ? (
        <>
          <div className="invoice-success">
            <Check />
            <h1>Your demo order is ready.</h1>
            <p>
              {order.sync === 'Controller validated'
                ? 'Spring Boot accepted the order summary. Your invoice is stored locally.'
                : 'Saved in your browser as a local demo order.'}
            </p>
          </div>
          <InvoiceContent order={order} />
          <div className="flex flex-wrap justify-center gap-3 my-7 print-hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={17} />
              Print invoice
            </Button>
            <Link className="btn btn-primary" to="/dashboard/customer/orders">
              View my orders
            </Link>
            <Link className="btn btn-ghost" to="/products">
              Keep exploring
            </Link>
          </div>
        </>
      ) : (
        <EmptyState
          title="Invoice not found in this browser"
          action={
            <Link to="/dashboard/customer/orders" className="btn btn-primary">
              View demo orders
            </Link>
          }
        />
      )}
    </div>
  );
}
