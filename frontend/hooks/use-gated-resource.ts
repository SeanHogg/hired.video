import { useCallback, useEffect, useRef, useState } from "react";
import { useApiReady } from "@/lib/auth";
import { authService } from "@/lib/services/auth-service";

export interface UseGatedResourceOptions<T> {
  /** Fetch fn that runs when (and only when) the user is api-ready. */
  fetcher: () => Promise<T>;
  /** Default state used before the first fetch and whenever the user is not
   *  api-ready (anonymous, signed-out, in verification limbo). */
  defaults: T;
  /** Optional poll interval in ms. Gated by api-ready: the timer is only
   *  installed while ready and torn down when ready flips false. */
  pollMs?: number;
  /** Extra deps that should trigger a re-fetch. The api-ready predicate is
   *  always part of the dependency set; callers don't need to add it. */
  deps?: ReadonlyArray<unknown>;
}

export interface UseGatedResourceResult<T> {
  /** Current value. Equal to `defaults` whenever the user is not api-ready. */
  data: T;
  /** True while the first or refresh fetch is in flight. */
  isLoading: boolean;
  /** Mirrors `useApiReady()` so consumers can branch on "would a fetch fire". */
  isReady: boolean;
  /** Manual refresh — no-op when not api-ready. */
  refresh: () => Promise<void>;
  /** Optimistic update entry-point for consumers that mutate the cached value
   *  before round-tripping (e.g. mark-read, optimistic delete). */
  setData: (next: T | ((prev: T) => T)) => void;
}

/**
 * Base hook for "fetch a user-scoped resource when the user is api-ready".
 *
 * Every user-data hook in the app (useSubscription, useTokenBudget,
 * useAIUsage, ...) shares the same lifecycle: short-circuit when the user
 * isn't api-ready (anonymous OR verification-limbo), reset to a sensible
 * default in that case, fetch on transition into ready, optionally poll,
 * tear down cleanly on transition out. This hook encapsulates that
 * lifecycle so resource hooks become one-liners. The gate predicate
 * (`useApiReady`) lives here and only here — consumers inherit it.
 *
 * For hooks with extra concerns (SignalR push subscriptions, custom window
 * events, multi-stream merges) compose this for the basic fetch and add
 * the bespoke listeners alongside; the base still owns the gate.
 */
export function useGatedResource<T>({
  fetcher,
  defaults,
  pollMs,
  deps = [],
}: UseGatedResourceOptions<T>): UseGatedResourceResult<T> {
  const apiReady = useApiReady();
  const [data, setData] = useState<T>(defaults);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Latch the latest fetcher in a ref so refresh's identity stays stable
  // even when callers pass a new function reference each render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!apiReady) return;
    // Freshness check: `apiReady` is captured at callback creation, but the
    // token can be cleared between then and now — an in-flight polling tick
    // that fired before logout, or a multi-tab logout that this tab hasn't
    // re-rendered for yet. Trust localStorage as the freshest "do we still
    // hold credentials" signal so we never send an auth-required request
    // without a token (which would 401).
    if (!authService.isAuthenticated()) return;
    setIsLoading(true);
    try {
      const next = await fetcherRef.current();
      setData(next);
    } catch {
      // Keep last-known state — 401/403/429 are recoverable on next tick.
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, ...deps]);

  useEffect(() => {
    if (!apiReady) {
      setData(defaults);
      setIsLoading(false);
      return;
    }
    void refresh();
    if (pollMs && pollMs > 0) {
      const t = setInterval(() => void refresh(), pollMs);
      return () => clearInterval(t);
    }
    return undefined;
    // `defaults` is a value-typed reset target; intentionally not a dep so
    // a fresh object literal at the call site doesn't thrash the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, refresh, pollMs]);

  return { data, isLoading, isReady: apiReady, refresh, setData };
}
