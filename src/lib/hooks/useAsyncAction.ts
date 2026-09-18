"use client";

import { useCallback, useState } from "react";
import type { ApiResult } from "@/lib/clientApi";

export type AsyncActionStatus = "idle" | "loading" | "success" | "error";

/**
 * Guided-activation restructure (reference doc §20 "Error and Recovery"):
 * standardizes Loading/Success/Failure/Retry around the existing
 * apiFetch/ApiResult shape (src/lib/clientApi.ts) instead of each component
 * hand-rolling its own busy/error booleans. `retry` re-runs the same call
 * with the same arguments — recovery from failure never requires losing
 * work or restarting a flow.
 */
export function useAsyncAction<T, Args extends unknown[]>(
  action: (...args: Args) => Promise<ApiResult<T>>,
) {
  const [status, setStatus] = useState<AsyncActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [lastArgs, setLastArgs] = useState<Args | null>(null);

  const run = useCallback(
    async (...args: Args) => {
      setLastArgs(args);
      setStatus("loading");
      setError(null);
      const res = await action(...args);
      if (!res.ok) {
        setStatus("error");
        setError(res.error ?? "Something went wrong.");
        return null;
      }
      setStatus("success");
      setData(res.data ?? null);
      return res.data ?? null;
    },
    [action],
  );

  const retry = useCallback(() => {
    if (lastArgs) return run(...lastArgs);
    return Promise.resolve(null);
  }, [lastArgs, run]);

  return {
    run,
    retry,
    status,
    error,
    data,
    loading: status === "loading",
  };
}
