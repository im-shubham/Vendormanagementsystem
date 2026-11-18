import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cursor, Page } from '@/lib/firestore';
import { toAppError } from '@/lib/errors';

/**
 * Cursor pagination for Firestore queries. `deps` describe the filters —
 * changing them resets to page 1. Only next/previous navigation is needed.
 */
export function usePagedQuery<T>(load: (after: Cursor | null) => Promise<Page<T>>, deps: unknown[]) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key, page: 1 });
  const page = state.key === key ? state.page : 1;
  const cursors = useRef<Map<string, (Cursor | null)[]>>(new Map());
  const [data, setData] = useState<Page<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    const list = cursors.current.get(key) ?? [null];
    cursors.current.set(key, list);
    setLoading(true);
    setError(null);
    loadRef
      .current(list[page - 1] ?? null)
      .then((r) => {
        if (cancelled) return;
        list[page] = r.last;
        setData(r);
      })
      .catch((e) => !cancelled && setError(toAppError(e).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key, page, nonce]);

  const setPage = useCallback((p: number) => setState({ key, page: Math.max(1, p) }), [key]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, page, setPage, reload };
}
