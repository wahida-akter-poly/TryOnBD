import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { services } from '../services';
import { api, errorMessage } from '../services/api';
import { Button, EmptyState, ErrorState, LoadingState, Price } from '../components/common/UI';
export default function Dashboard() {
  const { section = 'profile' } = useParams();
  const { user, role, state, refreshCatalog, refreshAccount } = useApp();
  const [records, setRecords] = useState([]),
    [sellers, setSellers] = useState([]),
    [seller, setSeller] = useState(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [editing, setEditing] = useState(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const admin = ['admin', 'super_admin'].includes(role);
  const allowed =
    section === 'profile' ||
    (role === 'customer' && ['orders', 'try-on-history'].includes(section)) ||
    (role === 'seller' && section === 'products') ||
    (admin && ['users', 'sellers', 'products', 'categories', 'orders'].includes(section));
  async function load() {
    setLoading(true);
    setRecords([]);
    setError('');
    try {
      if (section === 'profile') {
        if (role === 'seller') {
          const { data } = await services.account.seller();
          setSeller(data);
        }
        return;
      }
      if (role === 'customer') {
        await refreshAccount();
        return;
      }
      if (role === 'seller') {
        const [products, profile] = await Promise.all([
          services.account.products(),
          services.account.seller(),
        ]);
        setRecords(products.data);
        setSeller(profile.data);
        return;
      }
      const { data } = await services[section].list();
      setRecords(data);
      if (section === 'products') {
        const response = await services.sellers.list();
        setSellers(response.data);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setEditing(null);
    if (allowed) load();
  }, [section, revision, role]);
  async function action(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      setEditing(null);
      setRevision((n) => n + 1);
      await refreshCatalog();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return <ErrorState message="You cannot access this section." />;
  const list =
    role === 'customer' ? (section === 'orders' ? state.orders : state.sessions) : records;
  return (
    <>
      <span className="eyebrow">YOUR SPACE</span>
      <h1>{section.replaceAll('-', ' ')}</h1>
      {error && <ErrorState message={error} retry={() => setRevision((n) => n + 1)} />}{' '}
      {loading ? (
        <LoadingState />
      ) : section === 'profile' ? (
        <div className="panel">
          <h2>{user.fullName}</h2>
          <p>{user.email}</p>
          <p>{user.phone}</p>
          <p>{user.address}</p>
          {seller && (
            <>
              <h3>{seller.businessName}</h3>
              <p>{seller.contactEmail}</p>
              <p>{seller.phone}</p>
            </>
          )}
          <div className="summary-grid">
            <Link to="/checkout">
              {state.cart.reduce((sum, i) => sum + i.quantity, 0)} cart items
            </Link>
            {role !== 'seller' && (
              <Link to={`/dashboard/${role}/orders`}>{state.orders.length} orders</Link>
            )}
            <span>{state.sessions.length} try-on sessions</span>
          </div>
        </div>
      ) : (
        <>
          {['products', 'categories', 'sellers'].includes(section) && (
            <Button onClick={() => setEditing({})}>Create {section.slice(0, -1)}</Button>
          )}
          {editing && (
            <ManagementForm
              key={editing.id || 'new'}
              section={section}
              record={editing}
              categories={state.categories}
              sellers={sellers}
              seller={seller}
              users={records}
              busy={busy}
              cancel={() => setEditing(null)}
              submit={(payload) =>
                action(() =>
                  editing.id
                    ? services[section].update(editing.id, payload)
                    : services[section].create(payload),
                )
              }
            />
          )}
          {!list.length ? (
            <EmptyState
              title={`No ${section.replaceAll('-', ' ')} yet`}
              text="Records will appear here when they are available."
            />
          ) : (
            <div className="record-list">
              {list.map((record) => (
                <article className="panel" key={record.id}>
                  {section === 'products' ? (
                    <>
                      <Link to={`/products/${record.id}`}>
                        <h3>{record.name}</h3>
                      </Link>
                      <Price value={record.price} />
                      <p>Stock: {record.stockQuantity}</p>
                      <p>AR: {record.arType || 'NONE'}</p>
                      <p>{record.imageUrl || 'No product image uploaded'}</p>
                    </>
                  ) : section === 'categories' ? (
                    <>
                      <h3>{record.categoryName}</h3>
                      <p>{record.description}</p>
                    </>
                  ) : section === 'users' ? (
                    <>
                      <h3>{record.fullName}</h3>
                      <p>
                        {record.email} | {record.role}
                      </p>
                    </>
                  ) : section === 'sellers' ? (
                    <>
                      <h3>{record.businessName}</h3>
                      <p>{record.contactEmail}</p>
                      <p>User #{record.userId}</p>
                    </>
                  ) : section === 'orders' ? (
                    <>
                      <h3>Order #{record.id}</h3>
                      <p>
                        {record.orderStatus} | {new Date(record.createdAt).toLocaleDateString()}
                      </p>
                      <Price value={record.totalAmount} />
                      {record.items?.map((item) => (
                        <p key={item.productId}>
                          {item.name} x {item.quantity}
                        </p>
                      ))}
                    </>
                  ) : (
                    <>
                      <h3>Try-on #{record.id}</h3>
                      <Link to={`/products/${record.productId}`}>Product #{record.productId}</Link>
                      <p>
                        {record.tryOnType} | {new Date(record.createdAt).toLocaleString()}
                      </p>
                      <p>Capture metadata saved. Photos remain on your device.</p>
                    </>
                  )}
                  <div className="record-actions">
                    {['products', 'categories', 'sellers'].includes(section) && (
                      <>
                        <Button variant="ghost" onClick={() => setEditing(record)}>
                          Edit
                        </Button>
                        {section !== 'sellers' && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => action(() => services[section].remove(record.id))}
                          >
                            Remove
                          </Button>
                        )}
                      </>
                    )}
                    {section === 'users' && role === 'super_admin' && record.id !== user.id && (
                      <select
                        aria-label={`Role for ${record.email}`}
                        value={record.role}
                        disabled={busy}
                        onChange={(e) =>
                          action(() =>
                            api.put(`/api/users/${record.id}/role`, { role: e.target.value }),
                          )
                        }
                      >
                        {['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    )}
                    {section === 'orders' && admin && (
                      <select
                        aria-label={`Status for order ${record.id}`}
                        value={record.orderStatus}
                        disabled={busy}
                        onChange={(e) =>
                          action(() =>
                            services.orders.update(record.id, { orderStatus: e.target.value }),
                          )
                        }
                      >
                        {['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
function ManagementForm({ section, record, categories, sellers, seller, busy, cancel, submit }) {
  const [form, setForm] = useState({ ...record, arType: record.arType || 'NONE' });
  const [validation, setValidation] = useState('');
  const change = (key) => (e) => setForm((old) => ({ ...old, [key]: e.target.value }));
  const input = (key, label, props = {}) => (
    <label key={key}>
      {label}
      <input value={form[key] ?? ''} onChange={change(key)} {...props} />
    </label>
  );
  function save(e) {
    e.preventDefault();
    setValidation('');
    let payload;
    if (section === 'products') {
      if (!form.name?.trim() || !form.categoryId || !(seller?.id || form.sellerId)) {
        setValidation('Name, category and seller are required.');
        return;
      }
      payload = {
        name: form.name.trim(),
        description: form.description || '',
        price: Number(form.price),
        stockQuantity: Number(form.stockQuantity),
        imageUrl: form.imageUrl || '',
        categoryId: Number(form.categoryId),
        sellerId: Number(seller?.id || form.sellerId),
        arType: form.arType,
      };
    } else if (section === 'categories')
      payload = {
        categoryName: form.categoryName?.trim(),
        description: form.description || '',
        parentCategoryId: null,
      };
    else
      payload = {
        userId: Number(form.userId),
        businessName: form.businessName?.trim(),
        contactEmail: form.contactEmail,
        phone: form.phone,
        subscriptionStatus: form.subscriptionStatus || 'ACTIVE',
      };
    submit(payload);
  }
  return (
    <form className="panel management-form" onSubmit={save}>
      {section === 'products' ? (
        <>
          {input('name', 'Name', { required: true })}
          {input('price', 'Price', { type: 'number', min: 0, step: '0.01', required: true })}
          {input('stockQuantity', 'Stock', { type: 'number', min: 0, step: 1, required: true })}
          {input('imageUrl', 'Image URL or local asset path')}
          <label>
            Description
            <textarea value={form.description || ''} onChange={change('description')} />
          </label>
          <label>
            Category
            <select
              aria-label="Category"
              required
              value={form.categoryId || ''}
              onChange={change('categoryId')}
            >
              <option value="">Choose category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.categoryName}
                </option>
              ))}
            </select>
          </label>
          <label>
            AR type
            <select aria-label="AR type" value={form.arType} onChange={change('arType')}>
              {['NONE', 'EYEWEAR', 'SHIRT', 'TSHIRT', 'NECKLACE'].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          {!seller && (
            <label>
              Seller
              <select
                aria-label="Seller"
                required
                value={form.sellerId || ''}
                onChange={change('sellerId')}
              >
                <option value="">Choose seller</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.businessName}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : section === 'categories' ? (
        <>
          {input('categoryName', 'Category name', { required: true })}
          {input('description', 'Description', { required: true })}
        </>
      ) : (
        <>
          {!record.id &&
            input('userId', 'Existing user ID', { type: 'number', min: 1, required: true })}
          {input('businessName', 'Business name', { required: true })}
          {input('contactEmail', 'Contact email', { type: 'email', required: true })}
          {input('phone', 'Phone', { required: true })}
        </>
      )}
      {validation && <p role="alert">{validation}</p>}
      <div className="record-actions">
        <Button busy={busy}>Save</Button>
        <Button type="button" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
