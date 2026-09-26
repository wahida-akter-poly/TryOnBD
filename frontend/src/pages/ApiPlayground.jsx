import { useState } from 'react';
import { Braces, Play, CheckCircle2, Copy, Clock, ArrowUpRight } from 'lucide-react';
import { contracts, endpoints } from '../services/contracts';
import { sendRequest, errorMessage } from '../services/api';
import { useApp } from '../context/AppContext';
import { Badge, Button, ErrorState, Input, Select } from '../components/common/UI';
import { ConnectionStatus } from '../components/common/DemoNotice';

export default function ApiPlayground() {
  const [resource, setResource] = useState('users');
  const [selected, setSelected] = useState(2);
  const [testId, setTestId] = useState('1');
  const [body, setBody] = useState(JSON.stringify(contracts.users.create, null, 2));
  const [response, setResponse] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useApp();
  const routes = endpoints.filter((e) => e.resource === resource);
  const endpoint = routes[selected];
  function select(r, index) {
    const next = endpoints.filter((e) => e.resource === r)[index];
    setResource(r);
    setSelected(index);
    setBody(next.example ? JSON.stringify(next.example, null, 2) : '');
    setResponse(null);
    setError('');
  }
  async function send() {
    if (endpoint.path.includes('{id}') && !/^\d+$/.test(testId)) {
      setError('Enter a positive numeric demo/test ID.');
      return;
    }
    let data;
    try {
      data = endpoint.example ? JSON.parse(body) : undefined;
      if (data !== undefined && (!data || Array.isArray(data) || typeof data !== 'object'))
        throw new Error();
    } catch {
      setError('Request body must be a valid JSON object.');
      return;
    }
    setBusy(true);
    setError('');
    const start = performance.now();
    try {
      const result = await sendRequest({
        method: endpoint.method,
        path: endpoint.path.replace('{id}', testId),
        data,
      });
      setResponse({
        status: result.status,
        data: result.data,
        time: Math.round(performance.now() - start),
      });
    } catch (e) {
      setResponse({
        status: e.backendOffline ? 'Backend Offline' : e.response?.status || 'Backend Offline',
        data: e.response?.data || { message: errorMessage(e) },
        time: Math.round(performance.now() - start),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page playground">
      <div className="playground-heading">
        <div>
          <span className="eyebrow">UNDER THE HOOD</span>
          <h1>
            API Playground<span>.</span>
          </h1>
          <p>Real requests. Transparent responses. Explore the controller milestone.</p>
        </div>
        <div className="api-count">
          <Braces size={24} />
          <strong>35</strong>
          <span>existing REST routes</span>
        </div>
      </div>
      <div className="notice mb-6">
        <CheckCircle2 size={20} />
        <div>
          <strong>Spring Boot · Controllers + Request DTOs</strong>
          <p>
            POST and PUT validate request bodies. GET and DELETE currently return temporary text.
            Nothing here claims database persistence. Requests do not modify the frontend demo
            records.
          </p>
        </div>
        <ConnectionStatus />
      </div>
      <div className="playground-layout">
        <aside className="api-sidebar">
          {Object.entries(contracts).map(([key, contract]) => (
            <button
              key={key}
              className={resource === key ? 'active' : ''}
              onClick={() => select(key, 2)}
            >
              {contract.label}
              <span>5</span>
            </button>
          ))}
          <div className="api-sidebar-note">
            All paths are the existing <code>/api/…</code> routes.
            <br />
            No additional backend server.
          </div>
        </aside>
        <section className="api-workspace">
          <div className="endpoint-list">
            {routes.map((e, i) => (
              <button
                className={i === selected ? 'active' : ''}
                key={e.method + e.path}
                onClick={() => select(resource, i)}
              >
                <span className={`method method-${e.method.toLowerCase()}`}>{e.method}</span>
                <code>{e.path}</code>
                <span>{e.name}</span>
              </button>
            ))}
          </div>
          <div className="panel request-panel">
            <div className="panel-heading flex justify-between items-center">
              <h2>Request</h2>
              <Badge>Live HTTP</Badge>
            </div>
            <div className="request-url">
              <span className={`method method-${endpoint.method.toLowerCase()}`}>
                {endpoint.method}
              </span>
              <code>{endpoint.path.replace('{id}', testId)}</code>
            </div>
            {endpoint.path.includes('{id}') && (
              <div className="test-id">
                <Input
                  label="Numeric demo/test ID — not a persisted record ID"
                  type="number"
                  min="1"
                  step="1"
                  value={testId}
                  onChange={(e) => setTestId(e.target.value)}
                />
              </div>
            )}
            {endpoint.example && (
              <>
                <div className="editor-toolbar">
                  <span>JSON request body</span>
                  <div>
                    <button onClick={() => setBody(JSON.stringify(endpoint.example, null, 2))}>
                      Valid example
                    </button>
                    <button onClick={() => setBody('{}')}>Invalid example</button>
                  </div>
                </div>
                <textarea
                  className="json-editor"
                  aria-label="JSON request body"
                  spellCheck="false"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </>
            )}
            {error && <ErrorState message={error} />}
            <div className="request-actions">
              <small>
                {endpoint.method === 'DELETE'
                  ? 'Temporary controller response; no database deletion.'
                  : 'Sent to your configured Spring Boot backend.'}
              </small>
              <Button busy={busy} onClick={send}>
                <Play size={15} />
                Send request
              </Button>
            </div>
          </div>
          <div className="panel response-panel">
            <div className="panel-heading flex justify-between flex-wrap gap-3">
              <h2>Response</h2>
              {response && (
                <div className="flex items-center gap-3">
                  <Badge
                    tone={
                      Number(response.status) >= 200 && Number(response.status) < 300
                        ? 'green'
                        : 'amber'
                    }
                  >
                    {response.status === 200
                      ? '200 OK'
                      : response.status === 400
                        ? '400 Bad Request'
                        : response.status}
                  </Badge>
                  <small className="flex items-center gap-1">
                    <Clock size={13} />
                    {response.time} ms
                  </small>
                  <button
                    aria-label="Copy response"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
                        toast('Response copied');
                      } catch {
                        toast(
                          'Clipboard unavailable. Select and copy the response manually.',
                          'error',
                        );
                      }
                    }}
                  >
                    <Copy size={15} />
                  </button>
                </div>
              )}
            </div>
            <pre aria-live="polite">
              {response
                ? JSON.stringify(response.data, null, 2)
                : '// Send a request to inspect the actual backend response.'}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
