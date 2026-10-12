/**
 * Shared HTTP wrapper for Gmail / Microsoft Graph email-sync calls.
 *
 * #538 — Both providers return 429 on rate-limit with a `Retry-After`
 * header (Gmail: per-user quota guidance; Graph: per-app throttling).
 * The previous behaviour threw on any non-2xx, which marked the entire
 * `email_sync_runs` row as `error` and the account `status=error` —
 * burning the user's reconnect-experience on transient throttling.
 *
 * This wrapper:
 *   1. Single-retries on 429 honouring `Retry-After`, capped at
 *      `MAX_RETRY_DELAY_MS` so a Worker invocation stays under its
 *      30-second CPU budget.
 *   2. Reports a structured `{ status, retryAfterSec, partial }` failure
 *      shape that callers can use to set `sync_runs.status = "partial"`
 *      instead of `"error"`.
 *
 * Callers wrap the raw `fetch` call:
 *
 *   const res = await providerFetch(url, { headers });
 *   if (!res.ok) {
 *     if (res.partial) markRunPartial(...);
 *     else markRunError(...);
 *     return;
 *   }
 *   const body = await res.response.json();
 */

/** Hard ceiling on a Retry-After delay we'll honour inside a single
 *  Worker invocation. Anything beyond this falls through as a partial
 *  failure — the next scheduled sync run picks back up after the
 *  cooldown elapses. */
export const PROVIDER_MAX_RETRY_DELAY_MS = 5_000;

export interface ProviderFetchResult {
  ok: boolean;
  /** When `ok === true`, the parsed `Response` for callers to read body
   *  from. Undefined on failure. */
  response?: Response;
  /** When `ok === false` and `partial === true`, the run is graceful
   *  degradation (rate-limited / transient). Caller marks the
   *  `email_sync_runs` row `partial`; account stays healthy. */
  partial?: boolean;
  status?: number;
  retryAfterSec?: number;
  /** Raw error message — kept terse so it doesn't leak into the row
   *  status. */
  message?: string;
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 0;
  const asNumber = Number(header);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber);
  // HTTP-date form — best effort.
  const asDate = new Date(header).getTime();
  if (Number.isFinite(asDate)) {
    const delta = Math.max(0, asDate - Date.now()) / 1000;
    return Math.floor(delta);
  }
  return 0;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function providerFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<ProviderFetchResult> {
  // First attempt.
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    return {
      ok: false,
      partial: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (res.ok) return { ok: true, response: res };

  if (res.status === 429) {
    const retryAfterSec = parseRetryAfter(res.headers.get("Retry-After"));
    const delayMs = Math.min(retryAfterSec * 1000, PROVIDER_MAX_RETRY_DELAY_MS);

    // If the provider asked for more than our cap, skip the retry and
    // report partial so the next scheduled run picks up after cooldown.
    if (delayMs === 0 || retryAfterSec * 1000 > PROVIDER_MAX_RETRY_DELAY_MS) {
      return {
        ok: false,
        partial: true,
        status: 429,
        retryAfterSec,
        message: `Rate-limited; retry-after ${retryAfterSec || "unknown"}s exceeds our in-call budget`,
      };
    }

    await delay(delayMs);

    let retryRes: Response;
    try {
      retryRes = await fetch(input, init);
    } catch (err) {
      return {
        ok: false,
        partial: true,
        status: 429,
        retryAfterSec,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    if (retryRes.ok) return { ok: true, response: retryRes };
    // Second 429 in a row — bail to partial; don't pile on the
    // provider, the next scheduled run will pick this account up.
    if (retryRes.status === 429) {
      return {
        ok: false,
        partial: true,
        status: 429,
        retryAfterSec: parseRetryAfter(retryRes.headers.get("Retry-After")) || retryAfterSec,
        message: "Rate-limited twice in a row; deferring to next scheduled sync",
      };
    }
    return {
      ok: false,
      partial: false,
      status: retryRes.status,
      message: `Retry returned ${retryRes.status}`,
    };
  }

  return {
    ok: false,
    partial: false,
    status: res.status,
    message: `Provider returned ${res.status}`,
  };
}
