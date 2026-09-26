import { useState } from 'react';
import { Download, Check, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { localId, date } from '../../utils/format';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  StatCard,
  StatusChip,
  Table,
} from '../common/UI';
import SystemMonitor from './SystemMonitor';
import { Analytics } from './Overview';

export function Settings({ role }) {
  const { state, setState, toast } = useApp();
  const [settings, setSettings] = useState(state.settings);
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">A SPACE THAT WORKS FOR YOU</span>
          <h1>{role === 'super-admin' ? 'Platform' : 'Account'} settings.</h1>
          <p>These demonstration preferences only affect this browser.</p>
        </div>
      </div>
      <form
        className="panel p-7 max-w-3xl form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          setState((old) => ({ ...old, settings }));
          toast('Demo preferences saved locally. No backend settings API exists.');
        }}
      >
        <h3>Your preferences</h3>
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!settings.orderUpdates}
            onChange={(e) => setSettings((old) => ({ ...old, orderUpdates: e.target.checked }))}
          />
          Demo order notifications
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!settings.newsletter}
            onChange={(e) => setSettings((old) => ({ ...old, newsletter: e.target.checked }))}
          />
          Interest in new collections
        </label>
        {role === 'super-admin' && (
          <>
            <Input
              label="Demo platform display name"
              value={settings.platformName || 'TryOnBD'}
              onChange={(e) => setSettings((old) => ({ ...old, platformName: e.target.value }))}
            />
            <Input
              label="Simulated commission (%)"
              type="number"
              min="0"
              max="100"
              value={settings.commission ?? 5}
              onChange={(e) =>
                setSettings((old) => ({ ...old, commission: Number(e.target.value) }))
              }
            />
          </>
        )}
        <p className="muted text-sm">
          No emails, billing changes, or permission changes are performed by these preferences.
        </p>
        <Button type="submit">Save local preferences</Button>
      </form>
      <SystemMonitor />
    </>
  );
}
export function Subscription() {
  const { state, user, localUpdate, toast } = useApp();
  const seller = state.sellers.filter((s) => s.userId === user.id).at(-1) || state.sellers[0];
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">ROOM TO GROW</span>
          <h1>A plan for your next chapter.</h1>
          <p>UI-only plans. There is no subscription billing or payment API.</p>
        </div>
      </div>
      <div className="plans">
        {[
          {
            name: 'BASIC',
            price: 'Free',
            description: 'A thoughtful place to begin.',
            features: ['Demo seller storefront', 'Product management', 'Local order overview'],
          },
          {
            name: 'PREMIUM',
            price: '৳1,490',
            description: 'More space for a bigger idea.',
            features: [
              'Everything in Basic',
              'Simulated performance insights',
              'Demo featured placement',
            ],
          },
        ].map((plan) => (
          <article
            className={`panel plan ${plan.name === 'PREMIUM' ? 'featured-plan' : ''}`}
            key={plan.name}
          >
            <Badge>{plan.name}</Badge>
            <h2>
              {plan.price}
              <small>{plan.name === 'PREMIUM' ? ' / demo month' : ''}</small>
            </h2>
            <p>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={16} />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              variant={plan.name === 'PREMIUM' ? 'primary' : 'secondary'}
              disabled={!seller || seller.subscriptionStatus === plan.name}
              onClick={() => {
                localUpdate('sellers', { ...seller, subscriptionStatus: plan.name, sync: 'Local' });
                toast('Demo plan changed locally. No billing or subscription API was called.');
              }}
            >
              {seller?.subscriptionStatus === plan.name
                ? 'Current demo plan'
                : `Preview ${plan.name.toLowerCase()}`}
            </Button>
          </article>
        ))}
      </div>
    </>
  );
}
export function Permissions() {
  const { state, setState, toast } = useApp();
  const values = state.settings.permissions || {};
  const items = [
    'Browse & try on',
    'Manage own products',
    'Manage local users',
    'Moderate demo records',
    'Manage demo platform',
  ];
  const roleNames = ['Customer', 'Seller', 'Admin', 'Super Admin'];
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">FRONTEND DEMONSTRATION</span>
          <h1>Roles & permissions.</h1>
          <p>An interactive planning matrix. These switches do not enforce authorization.</p>
        </div>
      </div>
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Capability</th>
              {roleNames.map((r) => (
                <th key={r}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item}>
                <td>{item}</td>
                {roleNames.map((r, j) => {
                  const key = `${i}-${j}`;
                  return (
                    <td key={r}>
                      <input
                        aria-label={`${r}: ${item}`}
                        type="checkbox"
                        checked={values[key] ?? (j >= i || i === 0 || j === 3)}
                        onChange={(e) => {
                          setState((old) => ({
                            ...old,
                            settings: {
                              ...old.settings,
                              permissions: { ...values, [key]: e.target.checked },
                            },
                          }));
                          toast('Demo matrix updated locally. Authorization is not implemented.');
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function Admins() {
  const { state, localUpdate, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [removing, setRemoving] = useState(null);
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">LOCAL PLANNING ONLY</span>
          <h1>Admin management.</h1>
          <p>No backend admin accounts or permissions are created.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={17} />
          Add demo admin
        </Button>
      </div>
      <Table
        rows={state.admins}
        searchKeys={['name', 'email']}
        label="demo admins"
        filterKey="status"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
          {
            key: 'actions',
            label: 'Actions',
            sortable: false,
            render: (r) => (
              <Button variant="ghost" onClick={() => setRemoving(r)}>
                <Trash2 size={15} />
                Remove
              </Button>
            ),
          },
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title="Add local demo admin">
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            localUpdate(
              'admins',
              { id: localId('ADMIN'), name, email, status: 'ACTIVE', sync: 'Local' },
              'create',
            );
            setOpen(false);
            setName('');
            setEmail('');
            toast('Demo admin added locally. No account or access was granted.');
          }}
        >
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button>Add local record</Button>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          localUpdate('admins', removing, 'delete');
          setRemoving(null);
          toast('Local demo admin removed.');
        }}
      >
        Remove this frontend-only admin entry?
      </ConfirmDialog>
    </>
  );
}
export function ActivityLog() {
  const { state } = useApp();
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">THIS BROWSER’S DEMO ACTIVITY</span>
          <h1>A little history.</h1>
          <p>Local UI activity only. This is not a secure server audit log.</p>
        </div>
      </div>
      <Table
        rows={state.activity}
        label="local events"
        searchKeys={['message', 'date']}
        columns={[
          { key: 'date', label: 'When', render: (r) => new Date(r.date).toLocaleString() },
          { key: 'message', label: 'Demo activity' },
          { key: 'id', label: 'Local event ID' },
        ]}
      />
    </>
  );
}
export function Reports() {
  const { state, toast } = useApp();
  function download() {
    const data = {
      classification: 'Frontend demo report. Not database or financial reporting.',
      createdAt: new Date().toISOString(),
      counts: Object.fromEntries(
        ['users', 'sellers', 'products', 'orders', 'reviews', 'sessions'].map((k) => [
          k,
          state[k].length,
        ]),
      ),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tryonbd-demo-report.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Local demo report downloaded.');
  }
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">DEMO INSIGHTS</span>
          <h1>Patterns & possibilities.</h1>
          <p>Simulated trends alongside local record counts.</p>
        </div>
        <Button variant="secondary" onClick={download}>
          <Download size={17} />
          Export demo summary
        </Button>
      </div>
      <Analytics full />
      <SystemMonitor />
    </>
  );
}
