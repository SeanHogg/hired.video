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
 * Every L2 miss is a KV PUT, and the account is on Workers Free (~1,000
 * KV writes/day, reserved for scheduler work markers). So this helper is
 * ONLY for shared, slow-changing, bounded keys with long TTLs (≥ 300s,
 * ideally ≥ 3600s + explicit invalidation). Per-user, per-entity or
 * free-text keys go through utils/isolate-cache.ts (zero KV writes).
 *
 * For unbounded keyspaces (search, per-host slot windows) use the
 * version-token pair `getCacheVersion` / `bumpCacheVersion`: embed the
 * version in the key (payload in the isolate cache) and bump it on write
 * to orphan every old entry.
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
/** Negative caching: a null/undefined loader result (a crawler 404 on an
 *  OG/meta lookup, an unknown id) is held in L1 only — never written to KV
 *  (that would be a KV write per miss on Workers Free) — for up to this
 *  long, so repeat misses don't each hit Neon. Invalidation clears it. */
export const NEGATIVE_TTL_SECONDS = 300;

const _memoryCache = new Map<string, { value: unknown; expiresAt: number }>();
const _inFlight = new Map<string, Promise<unknown>>();

function getKv(): KVNamespace | undefined {
  return (globalThis as any).__ENV?.KV_CACHE as KVNamespace | undefined;
}

/** The shared Workers KV binding (`KV_CACHE`). Exported so other primitives
 *  that legitimately need raw KV — e.g. the scheduler work markers
 *  (services/scheduling/work-signals.ts) — reach it through ONE accessor instead
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
  // Null results get the (longer) negative TTL; positive values the L1 cap.
  const ttl = value == null
    ? Math.min(ttlSeconds, NEGATIVE_TTL_SECONDS)
    : Math.min(ttlSeconds, L1_MAX_TTL_SECONDS);
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
  /** Optional: false keeps a loaded value out of L1/KV (it is still
   *  returned). For transient answers that a write elsewhere flips and that
   *  are cheap to recompute — e.g. a watch page's "pending" placeholder. */
  shouldCache?: (value: T) => boolean;
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
  if (!isCurrent() || (opts.shouldCache && !opts.shouldCache(value))) return value;
  l1Set(opts.key, value, opts.ttlSeconds, Date.now());
  // Null is negative-cached in L1 only (see NEGATIVE_TTL_SECONDS): KV can't
  // serve it back anyway (a JSON null reads as a miss), so a put is pure cost.
  if (kv && value != null) {
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

/** How long this isolate trusts its copy of a version token before
 *  re-reading KV. KV itself is eventually consistent (~60s across colos),
 *  so 30s adds little cross-isolate staleness while sparing a KV GET on
 *  every request. */
const VERSION_L1_TTL_MS = 30_000;
/** A namespace's token is written to KV at most once per this window per
 *  isolate; bumps inside the window rotate the LOCAL token immediately and
 *  leave a pending write that the next read/bump after the window flushes. */
const VERSION_BUMP_COALESCE_MS = 30_000;
/** Bound on tracked namespaces (per-entity namespaces are unbounded). */
const VERSION_MAX_ENTRIES = 5_000;

interface VersionState {
  token: string;
  /** When `token` was last read from KV or set locally. */
  readAt: number;
  /** When this isolate last wrote this namespace's token to KV. */
  lastPutAt: number;
  /** A local bump not yet written to KV (coalesced). */
  pending: boolean;
}

const _versions = new Map<string, VersionState>();

function versionKey(namespace: string): string {
  return `cachever:${namespace}`;
}

function newVersionToken(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function setVersionState(namespace: string, state: VersionState): void {
  _versions.delete(namespace);
  if (_versions.size >= VERSION_MAX_ENTRIES) {
    // Prefer evicting the oldest SETTLED entry over a pending bump.
    for (const [ns, st] of _versions) {
      if (!st.pending) {
        _versions.delete(ns);
        break;
      }
    }
  }
  _versions.set(namespace, state);
}

function putVersion(kv: KVNamespace, namespace: string, token: string): void {
  kv.put(versionKey(namespace), token).catch(() => undefined);
}

/**
 * Current version token for a cache namespace (e.g. `search`,
 * `bookings:<hostId>`). Embed it in the payload key; `bumpCacheVersion`
 * orphans every key built from the previous token.
 *
 * A bump in THIS isolate is visible to the very next read here. A bump in
 * another isolate is honoured once this isolate's copy ages out
 * (`VERSION_L1_TTL_MS`). Defaults to "0" when nothing is known (dev /
 * tests / KV outage); the payload cache then degrades to a TTL cache.
 */
export async function getCacheVersion(namespace: string): Promise<string> {
  const now = Date.now();
  const kv = getKv();
  const local = _versions.get(namespace);
  if (local?.pending) {
    if (kv && now - local.lastPutAt >= VERSION_BUMP_COALESCE_MS) {
      putVersion(kv, namespace, local.token);
      setVersionState(namespace, { token: local.token, readAt: now, lastPutAt: now, pending: false });
    }
    return local.token;
  }
  if (local && (!kv || now - local.readAt < VERSION_L1_TTL_MS)) return local.token;
  if (!kv) return "0";

  const raw = await kv.get(versionKey(namespace)).catch(() => null);
  const current = _versions.get(namespace);
  // A local bump landed while the KV read was in flight — it wins.
  if (current && current.readAt > now) return current.token;
  const token = raw ?? "0";
  setVersionState(namespace, { token, readAt: now, lastPutAt: current?.lastPutAt ?? 0, pending: false });
  return token;
}

/** Rotate a namespace's version token. Fire-and-forget; never throws
 *  into the caller's write path. The token only has to DIFFER from the
 *  previous one, so a timestamp + random suffix is enough.
 *
 *  Coalesced: the local token rotates immediately (reads in this isolate
 *  see the write at once), but KV is written at most once per
 *  `VERSION_BUMP_COALESCE_MS` per namespace per isolate — a burst of
 *  writes (the many search bump sites, autosaves) costs one KV PUT, not
 *  one per write. A pending bump flushes on the next read or bump after
 *  the window; if the isolate dies first, other isolates converge on the
 *  payload TTL instead. */
export function bumpCacheVersion(namespace: string): void {
  const now = Date.now();
  const kv = getKv();
  const token = newVersionToken();
  const prev = _versions.get(namespace);
  const canPut = !!kv && (!prev || now - prev.lastPutAt >= VERSION_BUMP_COALESCE_MS);
  if (kv && canPut) putVersion(kv, namespace, token);
  setVersionState(namespace, {
    token,
    // +1 so a getCacheVersion KV read started in this same millisecond
    // still treats the bump as newer than its own start.
    readAt: now + 1,
    lastPutAt: canPut ? now : (prev?.lastPutAt ?? 0),
    pending: !!kv && !canPut,
  });
}

/** Test-only: clear every in-process map so cases don't leak state. */
export function __resetEdgeCacheForTests(): void {
  _memoryCache.clear();
  _inFlight.clear();
  _versions.clear();
}
