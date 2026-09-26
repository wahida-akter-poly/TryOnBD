import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Pencil, Trash2, Plus, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { date, money, orderStatuses } from '../../utils/format';
import { useAsync } from '../../hooks/useAsync';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  Select,
  StatusChip,
  Table,
  Rating,
} from '../common/UI';
import RecordForm from './RecordForm';
import ReviewForm from '../product/ReviewForm';
import { InvoiceContent } from '../../pages/public/Checkout';
import { CategoryTree } from '../../pages/public/Products';

const labels = {
  users: 'Users',
  sellers: 'Sellers',
  products: 'Products',
  categories: 'Categories',
  orders: 'Orders',
  reviews: 'Reviews',
  sessions: 'Try-on sessions',
};
export default function Management({ collection, role }) {
  const { state, user, mutate, localUpdate, toast } = useApp();
  const [edit, setEdit] = useState(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [status, setStatus] = useState('');
  const [moderating, setModerating] = useState(null);
  const { busy, error, run, setError } = useAsync();
  const seller = state.sellers.filter((s) => s.userId === user.id).at(-1) || state.sellers[0];
  const ownProducts = state.products.filter((p) => p.sellerId === seller?.id);
  let rows = state[collection] || [];
  if (role === 'customer') rows = rows.filter((r) => r.userId === user.id);
  if (role === 'seller')
    rows = rows.filter((r) =>
      collection === 'products'
        ? r.sellerId === seller?.id
        : collection === 'reviews' || collection === 'sessions'
          ? ownProducts.some((p) => p.id === r.productId)
          : collection === 'orders'
            ? r.items?.some((i) => ownProducts.some((p) => p.id === i.productId))
            : true,
    );
  const lookupProduct = (id) =>
    state.products.find((p) => p.id === id)?.name || 'Removed demo product';
  const canDelete =
    role === 'admin' ||
    role === 'super-admin' ||
    (role === 'seller' && collection === 'products') ||
    (role === 'customer' && collection === 'reviews');
  const canEdit =
    (['users', 'sellers', 'products', 'categories', 'orders'].includes(collection) &&
      role !== 'customer') ||
    (collection === 'reviews' && role === 'customer');
  const canCreate =
    ['users', 'sellers', 'products', 'categories'].includes(collection) && role !== 'customer';
  const common = { key: 'sync', label: 'Source', render: (r) => <StatusChip status={r.sync} /> };
  const columnMap = {
    users: [
      { key: 'fullName', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      common,
    ],
    sellers: [
      { key: 'businessName', label: 'Business' },
      { key: 'contactEmail', label: 'Contact email' },
      {
        key: 'subscriptionStatus',
        label: 'Demo plan',
        render: (r) => <StatusChip status={r.subscriptionStatus} />,
      },
      {
        key: 'moderationStatus',
        label: 'Local moderation',
        render: (r) => <StatusChip status={r.moderationStatus || 'PENDING'} />,
      },
      common,
    ],
    products: [
      { key: 'name', label: 'Product' },
      {
        key: 'categoryId',
        label: 'Category',
        render: (r) =>
          state.categories.find((c) => c.id === r.categoryId)?.categoryName || 'Uncategorized',
      },
      { key: 'price', label: 'Price', render: (r) => money(r.price) },
      {
        key: 'stockQuantity',
        label: 'Stock',
        render: (r) => (
          <StatusChip
            status={
              r.stockQuantity === 0
                ? 'Out of stock'
                : r.stockQuantity < 6
                  ? `${r.stockQuantity} · Low stock`
                  : `${r.stockQuantity} in stock`
            }
          />
        ),
      },
      { key: 'rating', label: 'Rating', render: (r) => <Rating value={r.rating || 0} /> },
      {
        key: 'sessions',
        label: 'Try-ons',
        render: (r) => state.sessions.filter((s) => s.productId === r.id).length,
        sortable: false,
      },
      common,
    ],
    categories: [
      { key: 'categoryName', label: 'Category' },
      {
        key: 'parentCategoryId',
        label: 'Parent',
        render: (r) =>
          state.categories.find((c) => c.id === r.parentCategoryId)?.categoryName || 'Root',
      },
      { key: 'description', label: 'Description' },
      common,
    ],
    orders: [
      { key: 'id', label: 'Local order reference' },
      {
        key: 'userId',
        label: 'Demo customer',
        render: (r) =>
          state.users.find((u) => u.id === r.userId)?.fullName ||
          r.customer?.fullName ||
          'Demo customer',
      },
      { key: 'date', label: 'Date', render: (r) => date(r.date) },
      { key: 'totalAmount', label: 'Total', render: (r) => money(r.totalAmount) },
      { key: 'orderStatus', label: 'Status', render: (r) => <StatusChip status={r.orderStatus} /> },
      common,
    ],
    reviews: [
      { key: 'productId', label: 'Product', render: (r) => lookupProduct(r.productId) },
      { key: 'rating', label: 'Rating', render: (r) => <Rating value={r.rating} /> },
      { key: 'comment', label: 'Comment' },
      { key: 'date', label: 'Date', render: (r) => date(r.date) },
      common,
    ],
    sessions: [
      { key: 'id', label: 'Local reference' },
      { key: 'productId', label: 'Product', render: (r) => lookupProduct(r.productId) },
      { key: 'tryOnType', label: 'Try-on mode' },
      { key: 'date', label: 'Date', render: (r) => date(r.date) },
      common,
    ],
  };
  const actions = {
    key: 'actions',
    label: 'Actions',
    sortable: false,
    render: (r) => (
      <div className="table-actions">
        <IconButton label={`View ${r.name || r.id}`} onClick={() => setDetail(r)}>
          <Eye size={16} />
        </IconButton>
        {canEdit && (
          <IconButton
            label={`Edit ${r.name || r.id}`}
            onClick={() => {
              setError('');
              setEdit(r);
              setStatus(r.orderStatus || 'PENDING');
            }}
          >
            <Pencil size={15} />
          </IconButton>
        )}
        {collection === 'sellers' && role !== 'seller' && (
          <IconButton
            label={`Moderate ${r.businessName}`}
            onClick={() => {
              setModerating(r);
              setStatus(r.moderationStatus || 'PENDING');
            }}
          >
            <ShieldCheck size={16} />
          </IconButton>
        )}
        {canDelete && (
          <IconButton
            label={`Delete ${r.name || r.id}`}
            onClick={() => {
              setRemoving(r);
              setError('');
            }}
          >
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>
    ),
  };
  const closeEdit = () => {
    setEdit(null);
    setCreating(false);
  };
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">YOUR DEMO WORKSPACE</span>
          <h1>
            {labels[collection]}
            <span>.</span>
          </h1>
          <p>
            {collection === 'orders' && role === 'seller'
              ? 'Orders inferred from local invoice lines. Totals may include other sellers; backend item associations are future work.'
              : 'Browse, inspect, and manage clearly labeled local demo records.'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={17} />
            Add {collection === 'categories' ? 'category' : collection.slice(0, -1)}
          </Button>
        )}
        {collection === 'reviews' && role === 'customer' && (
          <Link className="btn btn-primary" to="/dashboard/customer/write-review">
            <Plus size={17} />
            Write review
          </Link>
        )}
      </div>
      {collection === 'categories' && (
        <details className="panel category-tree-panel">
          <summary>Explore category hierarchy</summary>
          <CategoryTree
            categories={state.categories}
            onSelect={(id) => setDetail(state.categories.find((c) => String(c.id) === id))}
          />
        </details>
      )}
      <Table
        rows={rows}
        columns={[...columnMap[collection], actions]}
        label={labels[collection].toLowerCase()}
        searchKeys={[
          'id',
          'name',
          'fullName',
          'email',
          'businessName',
          'categoryName',
          'comment',
          'tryOnType',
        ]}
        filterKey={
          collection === 'orders'
            ? 'orderStatus'
            : collection === 'sellers'
              ? 'moderationStatus'
              : 'sync'
        }
      />
      <Modal
        open={creating || Boolean(edit)}
        onClose={closeEdit}
        title={`${creating ? 'Add' : 'Edit'} ${labels[collection].toLowerCase()}`}
      >
        {collection === 'reviews' ? (
          <ReviewForm review={edit} onDone={closeEdit} />
        ) : collection === 'orders' ? (
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await mutate('orders', 'update', { orderStatus: status }, edit);
                if (result.ok) closeEdit();
                else setError(result.error);
              });
            }}
          >
            <p className="muted text-sm">
              Only orderStatus is sent to the controller. Demo/test ID: {edit?.testId || 1}.
            </p>
            <Select label="Order status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {orderStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            {error && <ErrorState message={error} />}
            <Button busy={busy}>Update demo order status</Button>
          </form>
        ) : (
          <RecordForm
            collection={collection}
            record={edit}
            defaults={collection === 'products' ? { sellerId: seller?.id } : {}}
            onDone={closeEdit}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={collection === 'orders' ? 'Order details' : 'Demo record details'}
      >
        {detail &&
          (collection === 'orders' ? (
            <>
              <div className="order-timeline">
                {orderStatuses
                  .filter((s) => s !== 'CANCELLED')
                  .map((s, i) => (
                    <span
                      key={s}
                      className={
                        detail.orderStatus !== 'CANCELLED' &&
                        i <= orderStatuses.indexOf(detail.orderStatus)
                          ? 'done'
                          : ''
                      }
                    >
                      {s}
                    </span>
                  ))}
              </div>
              <InvoiceContent order={detail} />
              <Link className="text-link mt-5" to={`/invoice/${detail.id}`}>
                Open printable invoice →
              </Link>
            </>
          ) : (
            <>
              <dl className="record-details">
                {Object.entries(detail)
                  .filter(([key, value]) => typeof value !== 'object' && key !== 'password')
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value ?? 'None')}</dd>
                    </div>
                  ))}
              </dl>
              {collection === 'sessions' && <SessionImages session={detail} />}
            </>
          ))}
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        busy={busy}
        onConfirm={() =>
          run(async () => {
            if (
              collection === 'categories' &&
              (state.categories.some((c) => c.parentCategoryId === removing.id) ||
                state.products.some((p) => p.categoryId === removing.id))
            ) {
              setError('Reassign child categories and products before deleting this category.');
              return;
            }
            const result = await mutate(collection, 'delete', {}, removing);
            if (result.ok) setRemoving(null);
            else setError(result.error);
          })
        }
      >
        {error ||
          'The delete endpoint returns a temporary controller response. On success, this demo record is removed only from browser state.'}
      </ConfirmDialog>
      <Modal
        open={Boolean(moderating)}
        onClose={() => setModerating(null)}
        title="Local seller moderation"
      >
        <p className="muted mb-5">
          Moderation status is frontend-only. The Seller DTO has no moderation field, so no request
          is sent.
        </p>
        <Select
          label="Demo moderation status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {['ACTIVE', 'PENDING', 'SUSPENDED'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Button
          className="mt-5"
          onClick={() => {
            localUpdate('sellers', { ...moderating, moderationStatus: status, sync: 'Local' });
            toast('Local demo moderation status updated.');
            setModerating(null);
          }}
        >
          Save local status
        </Button>
      </Modal>
    </>
  );
}
export function SessionImages({ session }) {
  return (
    <div className="session-images">
      {[
        ['Before', session.inputImageUrl],
        ['Demo result', session.resultImageUrl],
      ].map(([label, src]) => (
        <figure key={label}>
          {src ? (
            <img
              src={src}
              alt={`${label} for saved demo try-on`}
              onError={(e) => {
                e.currentTarget.src = '/assets/person.svg';
              }}
            />
          ) : (
            <div className="session-image-missing">
              Image was kept in memory.
              <br />
              Try again to create a new preview.
            </div>
          )}
          <figcaption>{label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
