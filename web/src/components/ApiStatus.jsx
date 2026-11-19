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
    checking: 'bg-beige text-clay-brown',
    online: 'bg-green-100 text-green-800',
    offline: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${styles[state]}`}>
      API: {state}
    </span>
  );
}
