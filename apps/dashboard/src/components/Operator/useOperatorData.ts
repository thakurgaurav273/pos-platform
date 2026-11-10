"use client";

import { useCallback, useEffect, useState } from "react";
import { operatorRequest } from "@/lib/operatorSession";

/** GET a path under /operator; keeps the previous data on screen while reloading. */
export function useOperatorData<T>(path: string) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    operatorRequest<T>(path).then((r) => {
      if (cancelled) return;
      setState({ data: r.data, loading: false, error: r.message });
    });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
