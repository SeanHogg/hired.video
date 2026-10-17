/**
 * Drives Communication Hub refreshes from signals instead of a fixed poll.
 *
 * The hub used to re-fetch /api/inbox every 120s on EVERY page, alongside the
 * SSE notifications hub that already pushes the same events. Now:
 *   1. Push — a notification id the hub hasn't seen yet arrives over SSE.
 *   2. Attention — the tab regains focus / becomes visible (throttled).
 *   3. Fallback — ONLY while the SSE hub is disconnected, a 10-minute
 *      safety-net refresh keeps the feed from going stale.
 */

import { useCallback, useEffect, useRef } from "react";

const FALLBACK_POLL_MS = 10 * 60 * 1000;
const FALLBACK_CHECK_MS = 60 * 1000;
/** Focus / visibility refreshes at most this often (alt-tab spam). */
const ATTENTION_MIN_GAP_MS = 60 * 1000;
/** A push burst right after a refresh is already covered by it. */
const PUSH_MIN_GAP_MS = 5 * 1000;

export interface InboxRefreshDriverOptions {
  /** False while the viewer isn't api-ready (signed out / verifying). */
  enabled: boolean;
  /** SSE notifications hub state. */
  isPushConnected: boolean;
  /** Notification ids the hub already renders (persisted rows). */
  knownNotificationIds: readonly string[];
  /** Notification ids delivered over SSE. */
  liveNotificationIds: readonly string[];
  refresh: () => Promise<void> | void;
}

export function useInboxRefreshDriver({
  enabled,
  isPushConnected,
  knownNotificationIds,
  liveNotificationIds,
  refresh,
}: InboxRefreshDriverOptions): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const connectedRef = useRef(isPushConnected);
  connectedRef.current = isPushConnected;
  // Mount counts as a refresh — the hub's own initial fetch / bootstrap seed.
  const lastRefreshAt = useRef(Date.now());
  const known = useRef(new Set<string>());

  const run = useCallback(() => {
    lastRefreshAt.current = Date.now();
    void refreshRef.current();
  }, []);

  useEffect(() => {
    for (const id of knownNotificationIds) known.current.add(id);
  }, [knownNotificationIds]);

  // 1. Push
  useEffect(() => {
    if (!enabled) return;
    let fresh = false;
    for (const id of liveNotificationIds) {
      if (known.current.has(id)) continue;
      known.current.add(id);
      fresh = true;
    }
    if (fresh && Date.now() - lastRefreshAt.current >= PUSH_MIN_GAP_MS) run();
  }, [enabled, liveNotificationIds, run]);

  // 2. Attention
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const onAttention = () => {
      if (document.hidden) return;
      if (Date.now() - lastRefreshAt.current < ATTENTION_MIN_GAP_MS) return;
      run();
    };
    window.addEventListener("focus", onAttention);
    document.addEventListener("visibilitychange", onAttention);
    return () => {
      window.removeEventListener("focus", onAttention);
      document.removeEventListener("visibilitychange", onAttention);
    };
  }, [enabled, run]);

  // 3. Fallback — only while the push channel is down.
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => {
      if (connectedRef.current || document.hidden) return;
      if (Date.now() - lastRefreshAt.current < FALLBACK_POLL_MS) return;
      run();
    }, FALLBACK_CHECK_MS);
    return () => clearInterval(timer);
  }, [enabled, run]);
}
