/**
 * Shared helpers for Neon/Drizzle write surfaces.
 *
 * Two problems this module solves:
 *
 *   1. **Opaque error messages.** Drizzle's `neon-http` driver throws a
 *      `DrizzleQueryError` whose `.message` is just the SQL + params
 *      ("Failed query: update ... params: ..."). The real Postgres or
 *      Neon error (SQLSTATE code, detail, hint) hangs off `.cause` —
 *      sometimes multiple hops deep when Drizzle wraps another wrapper.
 *      `describeDbError` walks the cause chain and produces a single
 *      actionable string instead of the wrapper text.
 *
 *   2. **Transient Neon HTTP hiccups.** Neon's HTTP proxy occasionally
 *      returns 5xx or `fetch failed` on otherwise valid queries. The
 *      client-driven email ingest relies on a final cursor-advance
 *      write; losing it on a transient blip used to 400 the chunk
 *      even though the messages were already persisted.
 *      `runWithNeonRetry` retries once with a short backoff when the
 *      failure looks transient.
 *
 * Tracks gaps #727 (transient Neon writes surfacing only as opaque
 * "Failed query: …" text) and #757 (server-side cron email-sweep
 * removed in favour of the PWA-driven ingest path).
 */

/** Walk `err.cause` up to 5 hops and emit `<sqlstate> — <message> —
 *  detail: ... — hint: ...` when the underlying Neon/PG error carries
 *  those fields. Falls back to the wrapper message when nothing useful
 *  is attached (typical for raw fetch failures inside Neon HTTP). */
export function describeDbError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  let root: Error = err;
  for (let hop = 0; hop < 5; hop++) {
    const next = (root as { cause?: unknown }).cause;
    if (!(next instanceof Error)) break;
    root = next;
  }
  const code = (root as { code?: unknown }).code;
  const detail = (root as { detail?: unknown }).detail;
  const hint = (root as { hint?: unknown }).hint;
  const parts: string[] = [];
  if (typeof code === "string" && code) parts.push(code);
  parts.push(root.message);
  if (typeof detail === "string" && detail) parts.push(`detail: ${detail}`);
  if (typeof hint === "string" && hint) parts.push(`hint: ${hint}`);
  return parts.join(" — ");
}

/** SQLSTATE codes that point at the connection/network layer rather
 *  than a query defect, so retrying is safe and useful:
 *    08*  — connection_exception family
 *    57P03 — cannot_connect_now (Neon waking from idle)
 *    57P01 — admin_shutdown (Neon proxy rotated)
 *    57014 — query_canceled (Neon timed out the slot mid-flight)
 *    53300 — too_many_connections
 *  Anything in 23* (integrity), 22* (data), 42* (syntax/missing column),
 *  etc. is *not* retried — the second attempt would fail identically. */
function isTransientSqlState(code: string): boolean {
  if (code.startsWith("08")) return true;
  return code === "57P03" || code === "57P01" || code === "57014" || code === "53300";
}

function rootCause(err: Error): Error {
  let root: Error = err;
  for (let hop = 0; hop < 5; hop++) {
    const next = (root as { cause?: unknown }).cause;
    if (!(next instanceof Error)) break;
    root = next;
  }
  return root;
}

/** True when the failure looks like a Neon HTTP transport issue rather
 *  than a real query defect. Two heuristics, OR'd together:
 *    1. A recognised transient SQLSTATE on the root cause.
 *    2. No SQLSTATE at all + a message that screams "transport" —
 *       fetch failures, HTTP 5xx from Neon's proxy, abort errors. The
 *       Neon HTTP driver surfaces these as plain `Error` with no `code`,
 *       which is precisely the failure mode we saw in gap #727 (same
 *       millisecond, no SQLSTATE attached). */
function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const root = rootCause(err);
  const code = (root as { code?: unknown }).code;
  if (typeof code === "string" && isTransientSqlState(code)) return true;
  if (typeof code === "string" && code) return false; // real PG error — not transient
  const msg = (root.message ?? "").toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("fetch error") ||
    msg.includes("network") ||
    msg.includes("socket") ||
    msg.includes("connect etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("the operation was aborted") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

export interface NeonRetryOptions {
  /** Label used in console.warn so the line is greppable in logs. */
  label?: string;
  /** Sleep before the retry. Default 150ms — long enough that a stalled
   *  Neon HTTP connection has a chance to close, short enough that a
   *  Worker invocation doesn't blow its CPU budget. */
  retryDelayMs?: number;
}

/** Run `fn` once. If it throws what looks like a transient Neon HTTP
 *  failure, sleep briefly and run it exactly one more time. The retry
 *  is intentionally limited to one attempt — Neon's HTTP proxy
 *  recovers within a few hundred ms or it's a real outage that more
 *  retries won't fix.
 *
 *  Non-transient errors (real SQLSTATE codes, missing columns, FK
 *  violations) throw on the first attempt and aren't retried. */
export async function runWithNeonRetry<T>(
  fn: () => Promise<T>,
  opts: NeonRetryOptions = {},
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransient(err)) throw err;
    const label = opts.label ?? "neon-write";
    console.warn(
      `[${label}] transient Neon failure — retrying once:`,
      describeDbError(err),
    );
    await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 150));
    return await fn();
  }
}
