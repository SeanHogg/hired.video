import { useCallback, useEffect, useRef, useState } from "react";
import { useApiReady } from "@/lib/auth";
import { authService } from "@/lib/services/auth-service";
import { NetworkError, RateLimitError } from "@/lib/errors";

// On a transient failure (5xx / network drop / 429) we skip this many poll
// cycles before retrying, doubling each consecutive failure up to the cap.
// Resets on a successful fetch. Lets the client back off when the server
// is struggling instead of hammering it every interval.
const MAX_BACKOFF_CYCLES = 32;

/**
 * Cross-instance shared cache (gap #1692). Two consumers of the same
 * `cacheKey` share one data value, one poller, and one in-flight refresh.
 *
 * Without this, every mounted `useTokenBudget` / `useSubscription` / future polled
 * resource installs its own `setInterval` keyed by its own mount time. The
 * intervals rarely collide (offset by mount time), so concurrent-GET coalescing
 * in `api-client.ts` doesn't help — N consumers = N polls per interval forever.
 * `optimistic setData` calls also don't propagate cross-instance.
 *
 * The store is keyed by the caller's `cacheKey` string. Each entry tracks:
 *   - `data`: the latest value (broadcast on every update)
 *   - `subscribers`: Set of state setters — every mount registers one and the
 *      cleanup deregisters; one poller serves them all
 *   - `inFlight`: Promise of the current refresh (concurrent refresh calls
 *      return the same Promise — coalescing within and across consumers)
 *   - `pollerTimer`: shared `setInterval` handle (started when subscribers > 0,
 *      torn down when the last unsubscribes)
 *   - `skipCycles` / `nextBackoff`: shared backoff state — one failure pauses
 *      the poller for every consumer
 */
interface SharedCacheEntry<T> {
  data: T;
  subscribers: Set<(value: T) => void>;
  inFlight: Promise<void> | null;
  pollerTimer: ReturnType<typeof setInterval> | null;
  pollMs: number | undefined;
  fetcher: () => Promise<T>;
  skipCycles: number;
  nextBackoff: number;
  visibleHandler: (() => void) | null;
}
const sharedCache = new Map<string, SharedCacheEntry<unknown>>();

function broadcastSharedUpdate<T>(entry: SharedCacheEntry<T>, value: T): void {
  entry.data = value;
  for (const sub of entry.subscribers) sub(value);
}

/** Visible to tests + the `refresh()` callback below. Runs at most one
 *  in-flight fetch per `cacheKey`; concurrent callers await the same Promise. */
function sharedRefresh<T>(entry: SharedCacheEntry<T>): Promise<void> {
  if (!authService.isAuthenticated()) return Promise.resolve();
  if (entry.inFlight) return entry.inFlight;
  const promise = (async () => {
    try {
      const next = await entry.fetcher();
      broadcastSharedUpdate(entry, next);
      entry.skipCycles = 0;
      entry.nextBackoff = 1;
    } catch (err) {
      if (err instanceof NetworkError || err instanceof RateLimitError) {
        entry.skipCycles = entry.nextBackoff;
        entry.nextBackoff = Math.min(entry.nextBackoff * 2, MAX_BACKOFF_CYCLES);
      }
    } finally {
      entry.inFlight = null;
    }
  })();
  entry.inFlight = promise;
  return promise;
}

/**
 * Refetch a shared resource by `cacheKey` from outside React — e.g. after a
 * write that changes it (redeeming a coupon changes the plan + token budget).
 * Every mounted consumer of the key re-renders with the new value; a no-op
 * when nothing is subscribed (the next mount fetches fresh anyway).
 */
export function refreshSharedResource(cacheKey: string): Promise<void> {
  const entry = sharedCache.get(cacheKey);
  return entry ? sharedRefresh(entry) : Promise.resolve();
}

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
  /** Optional cross-instance cache key (gap #1692). When set, every consumer
   *  of the same key shares one data value, one poller, one in-flight fetch,
   *  and one backoff state. Optimistic `setData` calls broadcast to every
   *  subscriber. Use for resources read by 2+ mounted components on the same
   *  page — `useTokenBudget` (sidebar pill + AI panel + studio chrome),
   *  `useTokenBudget` (pill + settings + chat), `useSubscription` (billing + multiple
   *  upgrade prompts). Without this, each consumer runs an independent poller
   *  offset by mount time and burns N× the steady-state traffic. */
  cacheKey?: string;
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
 * useSubscription, ...) shares the same lifecycle: short-circuit when the user
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
  cacheKey,
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
  // re-render consumers just to throttle our own poll. Unused when the
  // shared-cache path is active (the entry owns these instead).
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
    // Shared-cache path: route through the module-level coalescer. Multiple
    // concurrent refresh calls (this consumer + sibling consumer + poll tick)
    // resolve to the same Promise so they share one round-trip.
    if (cacheKey) {
      const entry = sharedCache.get(cacheKey) as SharedCacheEntry<T> | undefined;
      if (entry) {
        setIsLoading(true);
        try {
          await sharedRefresh(entry);
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }
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
  }, [apiReady, cacheKey, ...deps]);

  // Broadcast-aware setData — when sharing a cacheKey, an optimistic update
  // must propagate to every subscriber on the key, not just this consumer.
  const setDataPublic = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (cacheKey) {
        const entry = sharedCache.get(cacheKey) as SharedCacheEntry<T> | undefined;
        if (entry) {
          const resolved =
            typeof next === "function"
              ? (next as (prev: T) => T)(entry.data)
              : next;
          broadcastSharedUpdate(entry, resolved);
          return;
        }
      }
      setData(next);
    },
    [cacheKey],
  );

  useEffect(() => {
    if (!apiReady) {
      setData(defaults);
      setIsLoading(false);
      return;
    }
    // Seed-skip: if an upstream aggregate already hydrated this resource,
    // adopt the seed and skip the initial fetch. Subsequent poll ticks
    // still fire normally so freshness recovers within `pollMs`. Caller
    // is responsible for TTL'ing the seed (see lib/bootstrap-seed.ts).
    const seed = seedFn?.() ?? null;

    // ---- Shared-cache path (gap #1692) ----
    // First subscriber to a cacheKey owns the entry (fetcher + pollMs +
    // poller). Later subscribers register and adopt the resident value.
    if (cacheKey) {
      let entry = sharedCache.get(cacheKey) as SharedCacheEntry<T> | undefined;
      if (!entry) {
        entry = {
          data: seed ?? defaults,
          subscribers: new Set(),
          inFlight: null,
          pollerTimer: null,
          pollMs,
          fetcher: () => fetcherRef.current(),
          skipCycles: 0,
          nextBackoff: 1,
          visibleHandler: null,
        };
        sharedCache.set(cacheKey, entry as SharedCacheEntry<unknown>);
      } else {
        // Adopt the resident value so we never render the cold default
        // when another consumer has already populated the cache.
        setData(entry.data);
      }
      const sub = (value: T) => setData(value);
      entry.subscribers.add(sub as (value: unknown) => void);

      // Run an initial fetch — coalesced. If the entry already has an
      // in-flight fetch from a sibling, we just await the same Promise.
      if (seed === null) void sharedRefresh(entry);

      // Install the shared poller only once per entry (first subscriber).
      if (entry.subscribers.size === 1 && pollMs && pollMs > 0 && !entry.pollerTimer) {
        const tick = () => {
          if (typeof document !== "undefined" && document.hidden) return;
          if (entry!.skipCycles > 0) {
            entry!.skipCycles -= 1;
            return;
          }
          void sharedRefresh(entry!);
        };
        entry.pollerTimer = setInterval(tick, pollMs);
        const onVisible = () => {
          if (typeof document === "undefined" || document.hidden) return;
          entry!.skipCycles = 0;
          entry!.nextBackoff = 1;
          void sharedRefresh(entry!);
        };
        entry.visibleHandler = onVisible;
        if (typeof document !== "undefined") {
          document.addEventListener("visibilitychange", onVisible);
        }
      }
      return () => {
        entry!.subscribers.delete(sub as (value: unknown) => void);
        // Last subscriber out — tear down the shared poller. Keep the
        // data resident so the next mount adopts it without a cold fetch.
        if (entry!.subscribers.size === 0) {
          if (entry!.pollerTimer) {
            clearInterval(entry!.pollerTimer);
            entry!.pollerTimer = null;
          }
          if (entry!.visibleHandler && typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", entry!.visibleHandler);
            entry!.visibleHandler = null;
          }
        }
      };
    }

    // ---- Per-instance path (no cacheKey) ----
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
  }, [apiReady, refresh, pollMs, cacheKey]);

  return { data, isLoading, isReady: apiReady, refresh, setData: setDataPublic };
}
