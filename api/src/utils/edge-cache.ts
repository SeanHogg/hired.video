/**
 * Two-layer edge cache helper.
 *
 *   L1: in-process Map — survives within a Worker isolate only, but covers
 *       the common case of repeated calls in the same request lifecycle
 *       and bursts of requests landing on the same warm isolate.
 *   L2: Cloudflare Workers KV (binding `KV_CACHE`) — survives across
 *       isolates and instances, 60–600s TTLs. KV stores Date fields as
 *       ISO strings, so callers that round-trip Date-bearing payloads
 *       must supply a `revive` function.
 *
 * Both layers are best-effort; a cache miss or KV outage falls through
 * to the loader. Invalidation should be called by every mutation that
 * could change the cached value — there is no automatic dependency
 * tracking.
 *
 * This is the canonical pattern; do not inline Map+KV+TTL in service
 * files. The existing BillingService implementation was the model and
 * has been refactored onto this helper.
 */

const _memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

function getKv(): KVNamespace | undefined {
  return (globalThis as any).__ENV?.KV_CACHE as KVNamespace | undefined;
}

/** The shared Workers KV binding (`KV_CACHE`). Exported so other primitives
 *  that legitimately need raw KV — e.g. the best-effort rate limiter
 *  ([rate-limit.ts](./rate-limit.ts)) — reach it through ONE accessor instead
 *  of re-reading `globalThis.__ENV` (DRY). Returns undefined in dev/tests
 *  where the binding isn't present. */
export function getKvNamespace(): KVNamespace | undefined {
  return getKv();
}

export interface EdgeCacheOptions<T> {
  /** Stable, namespaced key. Prefix per use case (e.g. `plan:`, `seat:`). */
  key: string;
  /** Cache TTL in seconds. Applies to both layers. */
  ttlSeconds: number;
  /** Loader run on miss. Throws are NOT cached. */
  loader: () => Promise<T>;
  /** Optional reviver — runs after KV deserialisation. Use to coerce
   *  ISO strings back into Date objects, etc. */
  revive?: (raw: unknown) => T | null;
}

export async function getOrSetCached<T>(opts: EdgeCacheOptions<T>): Promise<T> {
  const now = Date.now();

  const mem = _memoryCache.get(opts.key);
  if (mem && now < mem.expiresAt) return mem.value as T;
  if (mem) _memoryCache.delete(opts.key);

  const kv = getKv();
  if (kv) {
    const raw = await kv.get(opts.key, "json").catch(() => null);
    if (raw != null) {
      const revived = opts.revive ? opts.revive(raw) : (raw as T);
      if (revived != null) {
        _memoryCache.set(opts.key, {
          value: revived,
          expiresAt: now + opts.ttlSeconds * 1000,
        });
        return revived;
      }
    }
  }

  const value = await opts.loader();
  _memoryCache.set(opts.key, {
    value,
    expiresAt: now + opts.ttlSeconds * 1000,
  });
  if (kv) {
    kv.put(opts.key, JSON.stringify(value), { expirationTtl: opts.ttlSeconds })
      .catch(() => undefined);
  }
  return value;
}

/** Drop a single key from both layers. Mutations that affect a cached
 *  value MUST call this — there's no TTL short enough to make stale
 *  entitlement reads acceptable. */
export function invalidateCachedKey(key: string): void {
  _memoryCache.delete(key);
  const kv = getKv();
  if (kv) kv.delete(key).catch(() => undefined);
}
