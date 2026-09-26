import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Eye,
  EyeOff,
  Search,
  Loader2,
  Star,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
  AlertCircle,
  Check,
  ArrowUpDown,
} from 'lucide-react';
import { money } from '../../utils/format';

export function Button({
  children,
  variant = 'primary',
  className = '',
  busy,
  disabled,
  ...props
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={disabled || busy} {...props}>
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
export function IconButton({ label, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`icon-btn ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
export function Input({ label, error, className = '', ...props }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <small id={`${id}-error`} className="error-text">
          {error}
        </small>
      )}
    </div>
  );
}
export function Textarea({ label, ...props }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={4} {...props} />
    </div>
  );
}
export function Select({ label, children, className = '', ...props }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}
export function PasswordInput({ label = 'Password', ...props }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-wrap">
        <input id={id} type={visible ? 'text' : 'password'} {...props} />
        <IconButton
          label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </IconButton>
      </div>
    </div>
  );
}
export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search' }) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input aria-label={label} placeholder={placeholder} value={value} onChange={onChange} />
    </div>
  );
}
export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function StatusChip({ status }) {
  const good = ['ACTIVE', 'DELIVERED', 'Controller validated', 'Online'].includes(status);
  const bad = ['SUSPENDED', 'CANCELLED', 'Offline', 'Local / Unsynced'].includes(status);
  return <Badge tone={good ? 'green' : bad ? 'amber' : 'neutral'}>{status || 'Demo'}</Badge>;
}
export function Price({ value, className = '' }) {
  return <span className={`price ${className}`}>{money(value)}</span>;
}
export function Rating({ value = 0, onChange }) {
  return (
    <span className="rating" aria-label={`${value} out of 5 stars`}>
      {onChange ? (
        [1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
          >
            <Star size={23} fill={n <= value ? 'currentColor' : 'none'} />
          </button>
        ))
      ) : (
        <>
          <Star size={14} fill="currentColor" />
          <span>{Number(value).toFixed(1)}</span>
        </>
      )}
    </span>
  );
}
export function Avatar({ name = 'Demo User', size = '' }) {
  return (
    <span className={`avatar ${size}`} aria-label={name}>
      {name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}
export function Modal({ open, onClose, title, children, drawer = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={drawer ? 'drawer' : 'modal'}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={21} />
          </IconButton>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}
export const Drawer = (props) => <Modal {...props} drawer />;
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Remove this record?',
  children,
  busy,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="muted mb-6">
        {children ||
          'This removes the local demo record after a successful controller response, or an explicitly enabled offline fallback.'}
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" busy={busy} onClick={onConfirm}>
          Confirm removal
        </Button>
      </div>
    </Modal>
  );
}
export function Tabs({ tabs, value, onChange, label = 'View' }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          type="button"
          key={tab.value}
          role="tab"
          aria-selected={tab.value === value}
          tabIndex={tab.value === value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            onChange(tabs[next].value);
            event.currentTarget.parentElement.children[next].focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
export function Breadcrumbs({ items }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link to="/">Home</Link>
      {items.map((item, i) => (
        <span key={i}>
          <ChevronRight size={12} />
          {item.to ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
export function EmptyState({
  title = 'Nothing here yet',
  description = 'Your next favorite find is waiting.',
  action,
}) {
  return (
    <div className="empty-state">
      <PackageOpen size={38} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorState({ message, retry }) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={18} />
      <div>
        {message}
        {retry && (
          <button type="button" className="text-link block mt-2" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function LoadingState() {
  return (
    <div className="loading-state flex-col" role="status">
      <div className="flex items-center gap-3">
        <Loader2 className="animate-spin" />
        <span>Getting things ready…</span>
      </div>
      <div className="grid grid-cols-3 gap-4 w-full max-w-xl mt-5" aria-hidden="true">
        {[1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-32" />
        ))}
      </div>
    </div>
  );
}
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}
export function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <article className="stat-card">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {Icon && <Icon size={18} />}
      </div>
      <strong>{value}</strong>
      <small>{hint || 'Frontend demo data'}</small>
    </article>
  );
}
export function ChartCard({ title, description = 'Simulated demonstration data', children }) {
  return (
    <section className="panel chart-card">
      <div className="panel-heading">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}
export function Pagination({ page, pages, onChange }) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <IconButton label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={17} />
      </IconButton>
      <span>
        Page {page} of {Math.max(1, pages)}
      </span>
      <IconButton label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        <ChevronRight size={17} />
      </IconButton>
    </nav>
  );
}
export function Table({ columns, rows, searchKeys = [], label = 'records', filterKey }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState({ key: '', direction: 1 });
  const [page, setPage] = useState(1);
  const filtered = rows
    .filter(
      (row) =>
        searchKeys.some((key) =>
          String(row[key] || '')
            .toLowerCase()
            .includes(query.toLowerCase()),
        ) || !query,
    )
    .filter((row) => !filter || row[filterKey] === filter)
    .sort(
      (a, b) =>
        String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), undefined, {
          numeric: true,
        }) * sort.direction,
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const current = Math.min(page, pages);
  return (
    <div className="panel table-panel">
      <div className="table-toolbar">
        <SearchInput
          label={`Search ${label}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={`Search ${label}…`}
        />
        {filterKey && (
          <Select
            label="Filter status"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[...new Set(rows.map((r) => r[filterKey]).filter(Boolean))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        )}
        <span className="muted text-sm">
          {filtered.length} {label}
        </span>
      </div>
      {filtered.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>
                      {c.sortable === false ? (
                        c.label
                      ) : (
                        <button
                          onClick={() =>
                            setSort({
                              key: c.key,
                              direction: sort.key === c.key ? -sort.direction : 1,
                            })
                          }
                        >
                          {c.label}
                          <ArrowUpDown size={12} />
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((current - 1) * 6, current * 6).map((row) => (
                  <tr key={row.id}>
                    {columns.map((c) => (
                      <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={current} pages={pages} onChange={setPage} />
        </>
      ) : (
        <EmptyState title="No matching records" description="Try a different search or filter." />
      )}
    </div>
  );
}
export function Dropdown({ label, children }) {
  return (
    <details className="dropdown">
      <summary>{label}</summary>
      <div
        className="dropdown-menu"
        onClick={(e) => {
          if (e.target.closest('a,button')) e.currentTarget.parentElement.removeAttribute('open');
        }}
      >
        {children}
      </div>
    </details>
  );
}
export function Toast({ toast, dismiss }) {
  return (
    <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      {toast.type === 'error' ? <AlertCircle size={19} /> : <Check size={19} />}
      <span>{toast.message}</span>
      <IconButton label="Dismiss notification" onClick={dismiss}>
        <X size={15} />
      </IconButton>
    </div>
  );
}
