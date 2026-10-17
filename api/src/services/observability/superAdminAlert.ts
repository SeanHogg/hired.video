/**
 * Ops alerts to the SuperAdmin inbox — the platform's existing alert path
 * (email to SUPERADMIN_EMAIL via the generic sender, as the model-catalog
 * drift monitor and the client-error reporter do), with deduplication so a
 * failure that repeats on every request raises ONE email per window.
 *
 * Dedupe is an AWAITED Workers KV marker (`KV_CACHE`): read the key — present
 * means an alert already went out, skip; absent → put the marker with
 * `expirationTtl = windowSeconds` (awaited) and only then send. That holds
 * across isolates for the whole window (no per-isolate 30 s L1 re-send loop).
 * Residual race: two locations that both read "absent" before either write
 * propagates can each send once — accepted.
 *
 * A FAILED send doesn't burn the window: the marker is shortened to
 * `SEND_FAILURE_RETRY_SECONDS` so a later hit may retry, and the call
 * returns false. Concurrent calls in one isolate share one attempt
 * (single-flight). Without the KV binding (dev/tests) dedupe falls back to an
 * in-isolate memo, logged once. Best-effort — never throws into its caller.
 */
import { sendGenericEmail } from "../adapters/email.js";
import { getKvNamespace } from "../../utils/edge-cache.js";
import { logger } from "../../lib/logger.js";
import { escapeHtml } from "../../../../shared/html-escape.js";

/** Where ops alerts and approval requests go. Overridable via env. */
export function superAdminEmail(): string {
  return (
    (typeof process !== "undefined" ? process.env?.SUPERADMIN_EMAIL : undefined) ||
    (globalThis as { __ENV?: { SUPERADMIN_EMAIL?: string } }).__ENV?.SUPERADMIN_EMAIL ||
    "seanhogg@gmail.com"
  );
}

export interface SuperAdminAlert {
  /** Stable id of the condition (e.g. `explicit-scan:images-downscale:9432`). */
  key: string;
  /** At most one alert per key per this many seconds. */
  windowSeconds: number;
  subject: string;
  /** Plain-text detail; escaped into the email body. */
  message: string;
}

export type AlertSender = (to: string, subject: string, html: string, fromName?: string) => Promise<boolean>;

/** After a failed send, a retry is allowed after this long. KV's minimum
 *  `expirationTtl` is 60 s. */
export const SEND_FAILURE_RETRY_SECONDS = 10 * 60;

/** The KV slice this module uses (awaited get/put/delete). */
export interface AlertMarkerStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

export function alertCacheKey(key: string): string {
  return `opsalert:${key}`;
}

/** In-isolate fallback when KV_CACHE is absent: key → marker expiry (ms). */
const _memo = new Map<string, number>();
const _inFlight = new Map<string, Promise<boolean>>();
let _warnedNoKv = false;

const memoStore: AlertMarkerStore = {
  async get(key) {
    const until = _memo.get(key);
    if (until === undefined) return null;
    if (Date.now() >= until) {
      _memo.delete(key);
      return null;
    }
    return "1";
  },
  async put(key, _value, { expirationTtl }) {
    _memo.set(key, Date.now() + expirationTtl * 1000);
  },
};

function defaultStore(): AlertMarkerStore {
  const kv = getKvNamespace();
  if (kv) return kv as unknown as AlertMarkerStore;
  if (!_warnedNoKv) {
    _warnedNoKv = true;
    logger.warn("[ops-alert] KV_CACHE binding absent — alert dedupe is per-isolate only");
  }
  return memoStore;
}

/** Test seam: forget the in-isolate fallback marker for a key. */
export function clearAlertMarker(key: string): void {
  _memo.delete(alertCacheKey(key));
}

function renderHtml(alert: SuperAdminAlert): string {
  return (
    `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;">` +
    `<h2 style="font-size:18px;">${escapeHtml(alert.subject)}</h2>` +
    `<p style="white-space:pre-wrap;">${escapeHtml(alert.message)}</p>` +
    `<p style="color:#666;font-size:12px;">Alert key: ${escapeHtml(alert.key)} — ` +
    `repeats are suppressed for ${Math.round(alert.windowSeconds / 60)} min.</p></div>`
  );
}

async function attempt(alert: SuperAdminAlert, send: AlertSender, store: AlertMarkerStore): Promise<boolean> {
  const markerKey = alertCacheKey(alert.key);
  try {
    if ((await store.get(markerKey)) !== null) return false;
    await store.put(markerKey, new Date().toISOString(), { expirationTtl: Math.max(60, alert.windowSeconds) });
  } catch (err) {
    // Can't dedupe → don't send: an unguarded alert on a hot failure path is
    // exactly the spam this module exists to stop.
    logger.error("[ops-alert] dedupe failed", { key: alert.key, error: err });
    return false;
  }

  const ok = await send(superAdminEmail(), `[hired.video] ${alert.subject}`, renderHtml(alert), "hired.video ops monitor")
    .catch((err) => {
      logger.error("[ops-alert] send failed", { key: alert.key, error: err });
      return false;
    });
  if (ok) return true;

  // Failed send: keep a short marker so a persistent failure retries at most
  // every SEND_FAILURE_RETRY_SECONDS, not on every hit — nor never.
  await store
    .put(markerKey, "send-failed", { expirationTtl: Math.min(SEND_FAILURE_RETRY_SECONDS, Math.max(60, alert.windowSeconds)) })
    .catch((err) => logger.error("[ops-alert] marker shorten failed", { key: alert.key, error: err }));
  return false;
}

/** Raise an alert unless one with the same key went out inside its window.
 *  Resolves true only when this call sent it successfully. */
export async function raiseSuperAdminAlert(
  alert: SuperAdminAlert,
  send: AlertSender = sendGenericEmail,
  store: AlertMarkerStore = defaultStore(),
): Promise<boolean> {
  const flightKey = alertCacheKey(alert.key);
  const pending = _inFlight.get(flightKey);
  if (pending) return pending.then(() => false);
  const run = attempt(alert, send, store).finally(() => _inFlight.delete(flightKey));
  _inFlight.set(flightKey, run);
  return run;
}
