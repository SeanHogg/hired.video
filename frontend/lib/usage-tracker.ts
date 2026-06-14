/**
 * Usage tracker (#2044) — a tiny client singleton that batches page/intent
 * events and beacons them to /api/usage/track. Used by useUsageTracker (page
 * views) and any component that wants to record intent (e.g. search).
 *
 * Privacy: tracking is gated on stored ANALYTICS consent (consent-mode). With
 * no consent we neither assign a visitor id nor send anything. The server also
 * drops batches whose `consent` flag is false (defence in depth).
 *
 * Transport: navigator.sendBeacon when available (survives page unload), else
 * fetch with keepalive. Fire-and-forget — failures are swallowed.
 */
import { hasStoredConsentFor } from "@/lib/legal/consent-mode";
import type {
  TrackUsageInput,
  UsageEventInput,
  UsageEventType,
  UsageContextInput,
} from "@shared/usage";

const VISITOR_KEY = "hv_visitor_id";
const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE = 50;

let queue: UsageEventInput[] = [];
let context: UsageContextInput | undefined;
let timer: ReturnType<typeof setInterval> | null = null;

function consented(): boolean {
  try {
    return hasStoredConsentFor("analytics");
  } catch {
    return false;
  }
}

function visitorId(): string | null {
  if (!consented()) return null;
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`).replace(/-/g, "");
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function captureContext(): void {
  if (context) return;
  try {
    const params = new URLSearchParams(window.location.search);
    context = {
      entryPath: window.location.pathname,
      referrer: document.referrer || undefined,
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
    };
  } catch {
    context = {};
  }
}

/** Queue an event. No-op without analytics consent. */
export function trackUsageEvent(
  type: UsageEventType,
  opts?: { path?: string; featureKey?: string; payload?: Record<string, unknown> },
): void {
  if (!consented()) return;
  captureContext();
  queue.push({
    type,
    path: opts?.path ?? safePath(),
    featureKey: opts?.featureKey,
    payload: opts?.payload,
    occurredAt: new Date().toISOString(),
  });
  if (queue.length >= MAX_QUEUE) void flushUsage();
}

function safePath(): string {
  try {
    return window.location.pathname;
  } catch {
    return "";
  }
}

/** Flush the queue to the ingestion endpoint. Fire-and-forget. */
export function flushUsage(): void {
  const id = visitorId();
  if (!id || queue.length === 0) return;
  const body: TrackUsageInput = {
    visitorId: id,
    consent: true,
    context,
    events: queue.splice(0, MAX_QUEUE),
  };
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/usage/track", new Blob([json], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch("/api/usage/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: json,
    keepalive: true,
    credentials: "include",
  }).catch(() => undefined);
}

/** Start periodic + unload flushing. Idempotent. */
export function startUsageTracker(): () => void {
  if (timer) return () => undefined;
  timer = setInterval(flushUsage, FLUSH_INTERVAL_MS);
  const onHide = () => flushUsage();
  window.addEventListener("pagehide", onHide);
  window.addEventListener("visibilitychange", onHide);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("visibilitychange", onHide);
  };
}
