/**
 * Isolate-local (L1-only) read-through cache — for high-cardinality,
 * per-user reads where a Workers KV layer would cost a KV write per miss.
 *
 * The account runs on Workers Free (≈1,000 KV writes + 1,000 deletes a
 * day), so per-user caches (inbox, unread count, points summary,
 * dashboards, session validity) must never touch KV. This helper keeps
 * everything in the isolate:
 *   - bounded LRU (`MAX_ENTRIES`) with per-entry TTL;
 *   - single-flight: concurrent misses for one key share ONE loader call;
 *   - `invalidateIsolateKey` / `invalidateIsolatePrefix` clear this
 *     isolate only — other warm isolates converge within the TTL, so keep
 *     TTLs short (≤ 120s) for anything a user expects to see change.
 *
 * Use utils/edge-cache.ts (L1 + KV) only for low-cardinality, rarely
 * written keys shared across users (public catalogs, taxonomies).
 */

const MAX_ENTRIES = 5_000;

const _entries = new Map<string, { value: unknown; expiresAt: number }>();
const _inFlight = new Map<string, Promise<unknown>>();

export interface IsolateCacheOptions<T> {
  key: string;
  ttlSeconds: number;
  loader: () => Promise<T>;
  /** Optional: false keeps a loaded value out of the cache (it is still
   *  returned) — for transient answers a write elsewhere flips, e.g. a watch
   *  page's "pending" placeholder. */
  shouldCache?: (value: T) => boolean;
}

export async function getOrSetIsolateCached<T>(opts: IsolateCacheOptions<T>): Promise<T> {
  const now = Date.now();
  const hit = _entries.get(opts.key);
  if (hit && hit.expiresAt > now) {
    _entries.delete(opts.key);
    _entries.set(opts.key, hit); // LRU touch
    return hit.value as T;
  }
  if (hit) _entries.delete(opts.key);

  const pending = _inFlight.get(opts.key);
  if (pending) return pending as Promise<T>;

  let promise!: Promise<T>;
  const isCurrent = () => _inFlight.get(opts.key) === promise;
  promise = opts
    .loader()
    .then((value) => {
      // An invalidation while loading must not be undone by this result.
      if (isCurrent() && (!opts.shouldCache || opts.shouldCache(value))) {
        if (_entries.size >= MAX_ENTRIES) {
          const oldest = _entries.keys().next();
          if (!oldest.done) _entries.delete(oldest.value);
        }
        _entries.set(opts.key, { value, expiresAt: Date.now() + opts.ttlSeconds * 1000 });
      }
      return value;
    })
    .finally(() => {
      if (isCurrent()) _inFlight.delete(opts.key);
    });
  _inFlight.set(opts.key, promise);
  return promise;
}

/** Drop one key from this isolate. */
export function invalidateIsolateKey(key: string): void {
  _entries.delete(key);
  _inFlight.delete(key);
}

/** Drop every key starting with `prefix` from this isolate (e.g. every
 *  cached view of one user). O(entries) — fine at MAX_ENTRIES. */
export function invalidateIsolatePrefix(prefix: string): void {
  for (const key of _entries.keys()) if (key.startsWith(prefix)) _entries.delete(key);
  for (const key of _inFlight.keys()) if (key.startsWith(prefix)) _inFlight.delete(key);
}

/** Test-only: clear the isolate cache so cases don't leak state. */
export function __resetIsolateCacheForTests(): void {
  _entries.clear();
  _inFlight.clear();
}
