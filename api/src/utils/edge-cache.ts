/**
 * Two-layer edge cache helper.
 *
 *   L1: in-process LRU Map — survives within a Worker isolate only, but
 *       covers the common case of repeated calls in the same request
 *       lifecycle and bursts of requests landing on the same warm isolate.
 *       Bounded (`L1_MAX_ENTRIES`) so a long-lived isolate serving many
 *       distinct keys (per-user, per-search) can't grow without limit.
 *   L2: Cloudflare Workers KV (binding `KV_CACHE`) — survives across
 *       isolates and instances, 60–600s TTLs. KV stores Date fields as
 *       ISO strings, so callers that round-trip Date-bearing payloads
 *       must supply a `revive` function.
 *
 * Concurrent misses for the same key within an isolate share ONE loader
 * call (single-flight) so a burst on a cold key costs one DB round-trip,
 * not N.
 *
 * Both layers are best-effort; a cache miss or KV outage falls through
 * to the loader. Invalidation should be called by every mutation that
 * could change the cached value — there is no automatic dependency
 * tracking. `invalidateCachedKey` clears this isolate's L1 + KV; other
 * warm isolates keep their L1 copy until it expires, which is why the L1
 * TTL is capped at `L1_MAX_TTL_SECONDS` regardless of the caller's TTL.
 *
 * For unbounded keyspaces (search, per-host slot windows) use the
 * version-token pair `getCacheVersion` / `bumpCacheVersion`: embed the
 * version in the key and bump it on write to orphan every old entry.
 *
 * This is the canonical pattern; do not inline Map+KV+TTL in service
 * files.
 */

/** Hard cap on L1 entries per isolate (LRU eviction past this). */
const L1_MAX_ENTRIES = 5_000;
/** L1 never holds a value longer than this — bounds cross-isolate
 *  staleness after an invalidation in a different isolate. L2 (KV) keeps
 *  the caller's full TTL. */
const L1_MAX_TTL_SECONDS = 30;

const _memoryCache = new Map<string, { value: unknown; expiresAt: number }>();
const _inFlight = new Map<string, Promise<unknown>>();

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

function l1Get(key: string, now: number): { hit: true; value: unknown } | { hit: false } {
  const entry = _memoryCache.get(key);
  if (!entry) return { hit: false };
  if (now >= entry.expiresAt) {
    _memoryCache.delete(key);
    return { hit: false };
  }
  // Touch — re-insert so the key moves to the LRU tail.
  _memoryCache.delete(key);
  _memoryCache.set(key, entry);
  return { hit: true, value: entry.value };
}

function l1Set(key: string, value: unknown, ttlSeconds: number, now: number): void {
  const ttl = Math.min(ttlSeconds, L1_MAX_TTL_SECONDS);
  _memoryCache.delete(key);
  if (_memoryCache.size >= L1_MAX_ENTRIES) {
    const oldest = _memoryCache.keys().next();
    if (!oldest.done) _memoryCache.delete(oldest.value);
  }
  _memoryCache.set(key, { value, expiresAt: now + ttl * 1000 });
}

export interface EdgeCacheOptions<T> {
  /** Stable, namespaced key. Prefix per use case (e.g. `plan:`, `seat:`). */
  key: string;
  /** Cache TTL in seconds. Applies to L2; L1 is capped at
   *  `L1_MAX_TTL_SECONDS`. */
  ttlSeconds: number;
  /** Loader run on miss. Throws are NOT cached. */
  loader: () => Promise<T>;
  /** Optional reviver — runs after KV deserialisation. Use to coerce
   *  ISO strings back into Date objects, etc. */
  revive?: (raw: unknown) => T | null;
}

/** `isCurrent()` turns false once `invalidateCachedKey` ran for this key
 *  while the load was in flight — the (possibly pre-mutation) result is
 *  then returned to its waiters but NOT written back to L1/KV, so an
 *  invalidation (e.g. a session revoke) can't be undone by a racing read. */
async function loadThrough<T>(opts: EdgeCacheOptions<T>, isCurrent: () => boolean): Promise<T> {
  const kv = getKv();
  if (kv) {
    const raw = await kv.get(opts.key, "json").catch(() => null);
    if (raw != null) {
      const revived = opts.revive ? opts.revive(raw) : (raw as T);
      if (revived != null) {
        if (isCurrent()) l1Set(opts.key, revived, opts.ttlSeconds, Date.now());
        return revived;
      }
    }
  }

  const value = await opts.loader();
  if (!isCurrent()) return value;
  l1Set(opts.key, value, opts.ttlSeconds, Date.now());
  if (kv) {
    kv.put(opts.key, JSON.stringify(value), { expirationTtl: Math.max(60, opts.ttlSeconds) })
      .catch(() => undefined);
  }
  return value;
}

export async function getOrSetCached<T>(opts: EdgeCacheOptions<T>): Promise<T> {
  const mem = l1Get(opts.key, Date.now());
  if (mem.hit) return mem.value as T;

  const pending = _inFlight.get(opts.key);
  if (pending) return pending as Promise<T>;

  // Identity token for THIS load: invalidation (or a newer load) replaces
  // the map entry, so `isCurrent` / the cleanup only act on their own entry.
  let promise!: Promise<T>;
  const isCurrent = () => _inFlight.get(opts.key) === promise;
  promise = loadThrough(opts, isCurrent).finally(() => {
    if (isCurrent()) _inFlight.delete(opts.key);
  });
  _inFlight.set(opts.key, promise);
  return promise;
}

/** Drop a single key from both layers. Mutations that affect a cached
 *  value MUST call this — there's no TTL short enough to make stale
 *  entitlement reads acceptable. */
export function invalidateCachedKey(key: string): void {
  _memoryCache.delete(key);
  _inFlight.delete(key);
  const kv = getKv();
  if (kv) kv.delete(key).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Version tokens — invalidation for unbounded keyspaces
// ---------------------------------------------------------------------------

function versionKey(namespace: string): string {
  return `cachever:${namespace}`;
}

/**
 * Current version token for a cache namespace (e.g. `search`,
 * `bookings:<hostId>`). Embed it in the payload key; `bumpCacheVersion`
 * orphans every key built from the previous token.
 *
 * Read straight from KV — never L1 — so a bump in another isolate is
 * honoured on the very next request rather than after an isolate-local
 * TTL. Defaults to "0" when KV is unbound (dev / tests / outage); the
 * payload cache then degrades to a pure TTL cache, still correct.
 */
export async function getCacheVersion(namespace: string): Promise<string> {
  const kv = getKv();
  if (!kv) return "0";
  const raw = await kv.get(versionKey(namespace)).catch(() => null);
  return raw ?? "0";
}

/** Rotate a namespace's version token. Fire-and-forget; never throws
 *  into the caller's write path. The token only has to DIFFER from the
 *  previous one, so a timestamp + random suffix is enough. */
export function bumpCacheVersion(namespace: string): void {
  const kv = getKv();
  if (!kv) return;
  kv.put(versionKey(namespace), `${Date.now()}-${Math.floor(Math.random() * 1e9)}`)
    .catch(() => undefined);
}

/** Test-only: clear both in-process maps so cases don't leak state. */
export function __resetEdgeCacheForTests(): void {
  _memoryCache.clear();
  _inFlight.clear();
}
