import { Info, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { services } from '../../services';
import { useAsync } from '../../hooks/useAsync';
import { Button } from './UI';

export function ConnectionStatus() {
  const { online } = useApp();
  return (
    <span className="connection">
      <span
        className={`status-dot ${online === true ? 'online' : online === false ? 'offline' : ''}`}
      />
      Spring Boot API{' '}
      <strong>{online === null ? 'Checking' : online ? 'Online' : 'Offline'}</strong>
    </span>
  );
}
export default function DemoNotice({ compact = false }) {
  const { fallback, setFallback } = useApp();
  const { busy, run } = useAsync();
  return (
    <div className={`demo-notice ${compact ? 'compact' : ''}`}>
      <Info size={16} />
      <div>
        <strong>Demo workspace</strong>
        <p>
          Records are local. API success means controller validation; database persistence is a
          future feature.
        </p>
      </div>
      <label className="check-label">
        <input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} />
        Local Demo Fallback
      </label>
      {!compact && (
        <Button
          variant="ghost"
          busy={busy}
          onClick={() => run(() => services.products.list().catch(() => {}))}
        >
          <RefreshCw size={14} />
          Check API
        </Button>
      )}
    </div>
  );
}
