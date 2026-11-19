import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function ApiStatus() {
  const [state, setState] = useState('checking');

  useEffect(() => {
    const controller = new AbortController();
    api
      .get('/health', { signal: controller.signal })
      .then(() => setState('online'))
      .catch(() => {
        if (!controller.signal.aborted) setState('offline');
      });
    return () => controller.abort();
  }, []);

  const styles = {
    checking: 'bg-stone-200 text-stone-700',
    online: 'bg-emerald-100 text-emerald-800',
    offline: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${styles[state]}`}>
      {state}
    </span>
  );
}
