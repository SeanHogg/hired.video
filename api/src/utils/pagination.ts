/**
 * parsePagination — the one reader for `?limit=&page=&offset=` query params.
 *
 * Every list endpoint used to hand-parse these with slightly different
 * NaN handling. This helper keeps each endpoint's own default / bounds
 * (pass them in) and always yields finite integers:
 *
 *   const { limit, offset, page } = parsePagination(c, { defaultLimit: 20, maxLimit: 100 });
 *
 * - `limit`  = clamp(int(?limit) || defaultLimit, minLimit, maxLimit)
 * - `page`   = max(1, int(?page) || 1)
 * - `offset` = explicit `?offset` (>= 0) when present, else (page - 1) * limit
 */

interface QueryReader {
  req: { query: (key: string) => string | undefined };
}

export interface PaginationOptions {
  /** Used when `?limit` is absent or not a number. */
  defaultLimit: number;
  /** Upper bound for `limit`. */
  maxLimit: number;
  /** Lower bound for `limit` (default 1). */
  minLimit?: number;
  /** Query key names, for endpoints that use e.g. `pageSize`. */
  limitKey?: string;
  pageKey?: string;
  offsetKey?: string;
}

export interface Pagination {
  limit: number;
  page: number;
  offset: number;
}

function toInt(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Clamp a raw limit string into `[minLimit, maxLimit]`, falling back to `defaultLimit`. */
export function clampLimit(
  raw: string | undefined,
  defaultLimit: number,
  maxLimit: number,
  minLimit = 1,
): number {
  const n = toInt(raw);
  return Math.min(maxLimit, Math.max(minLimit, n == null || n === 0 ? defaultLimit : n));
}

export function parsePagination(c: QueryReader, opts: PaginationOptions): Pagination {
  const limit = clampLimit(
    c.req.query(opts.limitKey ?? "limit"),
    opts.defaultLimit,
    opts.maxLimit,
    opts.minLimit ?? 1,
  );
  const page = Math.max(1, toInt(c.req.query(opts.pageKey ?? "page")) ?? 1);
  const rawOffset = toInt(c.req.query(opts.offsetKey ?? "offset"));
  const offset = rawOffset != null ? Math.max(0, rawOffset) : (page - 1) * limit;
  return { limit, page, offset };
}
