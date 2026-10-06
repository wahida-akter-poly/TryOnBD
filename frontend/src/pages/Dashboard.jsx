import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { services } from '../services';
import { api, errorMessage } from '../services/api';
import { Button, EmptyState, ErrorState, LoadingState, Price } from '../components/common/UI';
import { ProductImage } from '../components/product/ProductCard';
export default function Dashboard() {
  const { section: routeSection } = useParams();
  const location = useLocation();
  const { user, role, state, refreshCatalog, refreshAccount } = useApp();
  const isAdminArea = /^\/(?:admin|super-admin)\/dashboard(?:\/|$)/.test(location.pathname);
  const section =
    routeSection ||
    (location.pathname === '/seller/dashboard/products'
      ? 'products'
      : isAdminArea
        ? 'overview'
        : 'profile');
  const [records, setRecords] = useState([]),
    [sellers, setSellers] = useState([]),
    [seller, setSeller] = useState(null),
    [overview, setOverview] = useState(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [editing, setEditing] = useState(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(''),
    [recordFilter, setRecordFilter] = useState('all');
  const admin = ['admin', 'super_admin'].includes(role);
  const allowed =
    section === 'profile' ||
    (role === 'customer' && ['orders', 'try-on-history'].includes(section)) ||
    (role === 'seller' && section === 'products') ||
    (admin &&
      [
        'overview',
        'users',
        'admins',
        'sellers',
        'products',
        'categories',
        'orders',
        'try-on-sessions',
      ].includes(section) &&
      (section !== 'admins' || role === 'super_admin'));
  async function load() {
    setLoading(true);
    setRecords([]);
    setError('');
    try {
      if (section === 'overview' && admin) {
        const [users, sellersResponse, products, orders, sessions] = await Promise.all([
          services.users.list(),
          services.sellers.list(),
          services.products.list(),
          services.orders.list(),
          services.sessions.list(),
        ]);
        setOverview({
          users: users.data,
          sellers: sellersResponse.data,
          products: products.data,
          orders: orders.data,
          sessions: sessions.data,
        });
        return;
      }
      if (section === 'profile') {
        if (role === 'seller') {
          const [profile, products] = await Promise.all([
            services.account.seller(),
            services.account.products(),
          ]);
          setSeller(profile.data);
          setRecords(products.data);
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
      if (section === 'admins') {
        const { data } = await services.users.list();
        setRecords(data.filter((record) => record.role === 'ADMIN'));
        return;
      }
      const resource = section === 'try-on-sessions' ? services.sessions : services[section];
      const { data } = await resource.list();
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
  const visibleRecords = list.filter((record) => {
    const searchable = JSON.stringify(record).toLowerCase();
    const matchesSearch = !search.trim() || searchable.includes(search.trim().toLowerCase());
    const matchesFilter =
      recordFilter === 'all' ||
      record.role === recordFilter ||
      record.orderStatus === recordFilter ||
      record.subscriptionStatus === recordFilter;
    return matchesSearch && matchesFilter;
  });
  const dashboardPath = role === 'super_admin' ? '/super-admin/dashboard' : '/admin/dashboard';
  return (
    <>
      <span className="eyebrow">
        {admin
          ? role === 'super_admin'
            ? 'SUPER ADMINISTRATION'
            : 'ADMINISTRATION'
          : 'YOUR SPACE'}
      </span>
      <h1>
        {section === 'overview'
          ? `${role === 'super_admin' ? 'Super Admin' : 'Admin'} dashboard`
          : section.replaceAll('-', ' ')}
      </h1>
      {error && <ErrorState message={error} retry={() => setRevision((n) => n + 1)} />}{' '}
      {loading ? (
        <LoadingState />
      ) : section === 'overview' && overview ? (
        <>
          <section className="summary-grid admin-statistics" aria-label="System statistics">
            {(role === 'super_admin'
              ? [
                  ['Total Users', overview.users.length, 'users'],
                  ['Customers', overview.users.filter((row) => row.role === 'CUSTOMER').length, 'users'],
                  ['Sellers', overview.sellers.length, 'sellers'],
                  [
                    'Admins',
                    overview.users.filter((row) => row.role === 'ADMIN').length,
                    'admins',
                  ],
                  ['Products', overview.products.length, 'products'],
                  ['Orders', overview.orders.length, 'orders'],
                  ['Try-On Sessions', overview.sessions.length, 'try-on-sessions'],
                ]
              : [
                  ['Total Users', overview.users.length, 'users'],
                  ['Sellers', overview.sellers.length, 'sellers'],
                  ['Products', overview.products.length, 'products'],
                  ['Orders', overview.orders.length, 'orders'],
                  ['Try-On Sessions', overview.sessions.length, 'try-on-sessions'],
                ]
            ).map(([label, count, target]) => (
              <Link className="panel" key={label} to={`${dashboardPath}/${target}`}>
                <span>{label}</span>
                <strong>{count}</strong>
              </Link>
            ))}
          </section>
          {role === 'super_admin' && (
            <section className="panel super-admin-controls" aria-label="Super Admin controls">
              <h2>Super Admin-only controls</h2>
              <p>Manage administrator accounts and system-wide roles.</p>
              <Link to={`${dashboardPath}/admins`}>Manage Admin accounts</Link>
            </section>
          )}
        </>
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
              <p>Your products: {records.length}</p>
            </>
          )}
          {role === 'seller' ? (
            <Link to="/seller/dashboard/products">Manage your products</Link>
          ) : (
            <div className="summary-grid">
              <Link to="/checkout">
                {state.cart.reduce((sum, i) => sum + i.quantity, 0)} cart items
              </Link>
              <Link to={`/dashboard/${role}/orders`}>{state.orders.length} orders</Link>
              <span>{state.sessions.length} try-on sessions</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {role === 'seller' && seller && (
            <section aria-label={`${seller.businessName} seller products`}>
              <h2>
                {seller.businessName} products ({records.length})
              </h2>
            </section>
          )}
          {admin && (
            <div className="admin-record-tools">
              <label>
                Search records
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search this section"
                />
              </label>
              <label>
                Filter
                <select value={recordFilter} onChange={(event) => setRecordFilter(event.target.value)}>
                  <option value="all">All records</option>
                  {section === 'users' || section === 'admins'
                    ? (section === 'admins' ? ['ADMIN'] : ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN']).map((value) => (
                        <option key={value}>{value}</option>
                      ))
                    : section === 'orders'
                      ? ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'].map((value) => (
                          <option key={value}>{value}</option>
                        ))
                      : section === 'sellers'
                        ? ['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((value) => (
                            <option key={value}>{value}</option>
                          ))
                        : null}
                </select>
              </label>
            </div>
          )}
          {(['products', 'categories', 'sellers'].includes(section) ||
            (section === 'admins' && role === 'super_admin')) && (
            <Button onClick={() => setEditing({})}>
              Create {section === 'admins' ? 'Admin account' : section.slice(0, -1)}
            </Button>
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
                action(() => {
                  if (section === 'admins') {
                    return services.users.create(payload).then(({ data }) =>
                      api.put(`/api/users/${data.id}/role`, { role: 'ADMIN' }),
                    );
                  }
                  return editing.id
                    ? services[section].update(editing.id, payload)
                    : services[section].create(payload);
                })
              }
            />
          )}
          {!visibleRecords.length ? (
            <EmptyState
              title={search || recordFilter !== 'all' ? 'No matching records' : `No ${section.replaceAll('-', ' ')} yet`}
              text={search || recordFilter !== 'all' ? 'Try a different search or filter.' : 'Records will appear here when they are available.'}
            />
          ) : (
            <div className="record-list">
              {visibleRecords.map((record) => (
                <article className="panel" key={record.id}>
                  {section === 'products' ? (
                    <>
                      <Link to={`/products/${record.id}`}>
                        <h3>{record.name}</h3>
                      </Link>
                      <ProductImage product={record} className="catalog-thumbnail" />
                      <Price value={record.price} />
                      <p>Stock: {record.stockQuantity}</p>
                      <p>Category: {record.categoryName || 'Uncategorized'}</p>
                      <p>AR type: {record.arType || 'NONE'}</p>
                      <p>{record.imageUrl || 'No product image uploaded'}</p>
                    </>
                  ) : section === 'categories' ? (
                    <>
                      <h3>{record.categoryName}</h3>
                      <p>{record.description}</p>
                    </>
                  ) : section === 'users' || section === 'admins' ? (
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
                      <p>Status: {record.subscriptionStatus}</p>
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
                    {section === 'sellers' && admin && (
                      <select
                        aria-label={`Subscription status for ${record.businessName}`}
                        value={record.subscriptionStatus}
                        disabled={busy}
                        onChange={(e) =>
                          action(() =>
                            services.sellers.update(record.id, {
                              businessName: record.businessName,
                              contactEmail: record.contactEmail,
                              phone: record.phone,
                              subscriptionStatus: e.target.value,
                            }),
                          )
                        }
                      >
                        {['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    )}
                    {['users', 'admins'].includes(section) &&
                    role === 'super_admin' &&
                    record.id !== user.id && (
                      <select
                        aria-label={`Role for ${record.email}`}
                        value={record.role}
                        disabled={busy}
                        onChange={(e) =>
                          action(async () => {
                            await api.put(`/api/users/${record.id}/role`, { role: e.target.value });
                            setRecords((old) =>
                              old.filter(
                                (item) =>
                                  item.id !== record.id ||
                                  e.target.value === 'ADMIN',
                              ),
                            );
                          })
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
                    {section === 'try-on-sessions' && <p>Customer #{record.userId}</p>}
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
    else if (section === 'admins') {
      if (
        !form.fullName?.trim() ||
        !form.email?.trim() ||
        !form.password ||
        !form.phone?.trim() ||
        !form.address?.trim()
      ) {
        setValidation('All administrator account fields are required.');
        return;
      }
      payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
        address: form.address.trim(),
      };
    } else
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
              {['NONE', 'EYEWEAR', 'SHIRT', 'TSHIRT', 'CLOTHING', 'NECKLACE'].map((type) => (
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
      ) : section === 'admins' ? (
        <>
          {input('fullName', 'Full name', { required: true })}
          {input('email', 'Email', { type: 'email', required: true })}
          {input('password', 'Temporary password', { type: 'password', minLength: 6, required: true })}
          {input('phone', 'Phone', { required: true })}
          {input('address', 'Address', { required: true })}
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
