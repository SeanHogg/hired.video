/**
 * useExtensionBridge — listen + send across the auth-bridge.js extension/web bridge.
 *
 * The extension (jobseeker + recruiter) injects auth-bridge.js on every
 * hired.video page. It relays messages in both directions:
 *
 *   web → ext  : `window.dispatchEvent(new CustomEvent('hired.video:notify-extension', { detail }))`
 *   ext → web  : `window.dispatchEvent(new CustomEvent('hired.video:extension-event', { detail }))`
 *
 * This hook wraps both sides so feature components don't have to repeat
 * the (event, listener, cleanup) dance. Multiple hook instances can
 * subscribe to the same `eventType` — each one only fires for its own.
 *
 * Why this hook exists: the Vendor Sync tool page, the resume page, and
 * (eventually) other tools all need the same listen/send shape. Putting
 * the wiring here keeps the boilerplate in one place and lets future
 * features add a new event type without touching auth-bridge.js.
 */

import { useCallback, useEffect, useRef } from "react";

export interface ExtensionEvent<T = unknown> {
  type: string;
  payload: T | null;
}

export function useExtensionBridge<T = unknown>(opts: {
  /** Event type to listen for. Compared exactly against `detail.type`
   *  on the `hired.video:extension-event` CustomEvent. */
  listenFor?: string;
  /** Called with the payload whenever a matching event arrives. */
  onEvent?: (payload: T | null) => void;
}) {
  const handlerRef = useRef(opts.onEvent);
  handlerRef.current = opts.onEvent;

  useEffect(() => {
    if (!opts.listenFor) return;
    const filter = opts.listenFor;
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<ExtensionEvent<T>>).detail;
      if (!detail || detail.type !== filter) return;
      handlerRef.current?.(detail.payload);
    };
    window.addEventListener("hired.video:extension-event", onEvent as EventListener);
    return () => window.removeEventListener("hired.video:extension-event", onEvent as EventListener);
  }, [opts.listenFor]);

  /** Fire a `hired.video:notify-extension` CustomEvent that auth-bridge
   *  forwards into the extension's service worker. */
  const send = useCallback((type: string, payload?: unknown) => {
    try {
      window.dispatchEvent(new CustomEvent("hired.video:notify-extension", {
        detail: { type, payload: payload ?? null },
      }));
    } catch {
      // Sandboxed iframe / unsupported environment — soft-fail.
    }
  }, []);

  return { send };
}

/** True when the Chrome extension's auth-bridge is injected on this
 *  page. The bridge advertises itself by mirroring the auth token via
 *  chrome.runtime.sendMessage; we detect it indirectly by checking
 *  whether `chrome.runtime` is reachable from the page (it isn't from
 *  vanilla web pages, but content scripts inject it).
 *
 *  Used by `<VendorCard>` to gate the "Sync from this tab" CTA — when
 *  the extension isn't installed the manual flow is the only path. */
export function isExtensionAvailable(): boolean {
  try {
    // The auth-bridge exposes a runtime hint by setting a window flag
    // shortly after load. Until that lands, fall back to feature
    // detection: chrome.runtime.id is undefined on plain pages, set on
    // pages where any extension content script has run.
    return typeof (globalThis as any).chrome?.runtime?.id === "string";
  } catch {
    return false;
  }
}
