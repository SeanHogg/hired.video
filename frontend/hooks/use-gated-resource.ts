import { useCallback, useEffect, useRef, useState } from "react";
import { useApiReady } from "@/lib/auth";
import { authService } from "@/lib/services/auth-service";
import { NetworkError, RateLimitError } from "@/lib/errors";

// On a transient failure (5xx / network drop / 429) we skip this many poll
// cycles before retrying, doubling each consecutive failure up to the cap.
// Resets on a successful fetch. Lets the client back off when the server
// is struggling instead of hammering it every interval.
const MAX_BACKOFF_CYCLES = 32;

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
  /** Optional seed function. If it returns non-null on mount, that value
   *  becomes the initial `data` AND the first fetch is skipped (subsequent
   *  poll ticks still fire normally). Use this when an upstream aggregate
   *  (e.g. /api/bootstrap) already hydrated what this hook would fetch —
   *  collapses the second round-trip without losing the polling cadence.
   *  Re-evaluated on api-ready transitions, not on every render. */
  seedFn?: () => T | null;
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
  seedFn,
}: UseGatedResourceOptions<T>): UseGatedResourceResult<T> {
  const apiReady = useApiReady();
  const [data, setData] = useState<T>(defaults);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Latch the latest fetcher in a ref so refresh's identity stays stable
  // even when callers pass a new function reference each render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // Backoff bookkeeping. `skipCycles` counts how many upcoming poll ticks
  // to swallow; `nextBackoff` is the cycle-count we'll apply on the next
  // failure (doubles each consecutive failure). Refs so changes don't
  // re-render consumers just to throttle our own poll.
  const skipCyclesRef = useRef(0);
  const nextBackoffRef = useRef(1);

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
      skipCyclesRef.current = 0;
      nextBackoffRef.current = 1;
    } catch (err) {
      // Throttle further polls when the server signals "back off" — 5xx
      // / network drop / rate-limit. Other error classes (auth, validation)
      // aren't transient, no point retrying faster.
      if (err instanceof NetworkError || err instanceof RateLimitError) {
        skipCyclesRef.current = nextBackoffRef.current;
        nextBackoffRef.current = Math.min(
          nextBackoffRef.current * 2,
          MAX_BACKOFF_CYCLES,
        );
      }
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
    // Seed-skip: if an upstream aggregate already hydrated this resource,
    // adopt the seed and skip the initial fetch. Subsequent poll ticks
    // still fire normally so freshness recovers within `pollMs`. Caller
    // is responsible for TTL'ing the seed (see lib/inbox-seed.ts).
    const seed = seedFn?.() ?? null;
    if (seed !== null) {
      setData(seed);
    } else {
      void refresh();
    }
    if (!(pollMs && pollMs > 0)) return undefined;
    const tick = () => {
      // Hidden tabs don't need fresh data; browsers throttle to ~1/min
      // anyway. Skip cleanly without consuming a backoff cycle.
      if (typeof document !== "undefined" && document.hidden) return;
      if (skipCyclesRef.current > 0) {
        skipCyclesRef.current -= 1;
        return;
      }
      void refresh();
    };
    const t = setInterval(tick, pollMs);
    // Returning from a hidden tab should feel live, not "wait up to the
    // poll interval for fresh data" — refresh once and reset backoff so
    // a transient outage that recovered while away doesn't keep us muted.
    const onVisible = () => {
      if (typeof document === "undefined" || document.hidden) return;
      skipCyclesRef.current = 0;
      nextBackoffRef.current = 1;
      void refresh();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearInterval(t);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
    // `defaults` is a value-typed reset target; intentionally not a dep so
    // a fresh object literal at the call site doesn't thrash the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, refresh, pollMs]);

  return { data, isLoading, isReady: apiReady, refresh, setData };
}
