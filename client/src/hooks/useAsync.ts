import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { toAppError } from '@/lib/errors';

/** Loads data with loading / error state; `reload()` re-runs the loader. */
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === seq.current) setData(result);
    } catch (err) {
      if (id === seq.current) setError(toAppError(err, 'Something went wrong while loading data.').message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
