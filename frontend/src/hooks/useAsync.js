import { useState } from 'react';
export function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (task) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      return await task();
    } catch (e) {
      setError(e.message || 'Something went wrong. Please retry.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
