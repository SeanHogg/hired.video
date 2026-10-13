// use-service-worker-update.ts — "is a newer deployed build waiting?" for
// the PWA, and the one way to apply it.
//
// Detection reads `registration.waiting` directly instead of trusting
// workbox-window's `onNeedRefresh`, which misses updates in two cases:
//   • found during page load: the browser's navigation update check finds
//     the new SW before `wb.register()` (deferred to `load`) attaches its
//     `updatefound` listener, so it installs to `waiting` unseen — and later
//     polls compare against that waiting worker, so nothing fires again;
//   • found by polling: workbox treats an update discovered >60s after
//     registration as "external" and REMOVES its `updatefound` listener, so
//     at most one in-session update is ever reported.
// Together these made the prompt appear only on fresh loads of `/` (the PWA
// start_url) and never on a long-lived tab on any other page.
//
// A waiting build is APPLIED automatically when nothing is unsaved: with
// registerType "prompt" the old precached app otherwise kept loading on every
// refresh until someone clicked the prompt (2026-10-13: a deployed fix stayed
// invisible after "refresh"). With unsaved work the prompt still asks first.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { hasUnsavedWork } from "@/hooks/use-unsaved-work";

// How often an already-open tab polls the server for a freshly-deployed
// service worker. A poll is a cheap conditional GET on the SW script; if the
// bytes changed the browser installs the new SW, which then waits
// (registerType: "prompt") until the user applies it.
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;

// Focus, visibility, reconnect and in-app navigation also check; they can
// fire together, so checks closer than this collapse into one.
const MIN_CHECK_GAP_MS = 15 * 1000;

export interface ServiceWorkerUpdate {
  /** The newer SW waiting to take over, or null when the tab is current.
   *  A new deploy yields a new object, so consumers can key on identity. */
  waiting: ServiceWorker | null;
  registration: ServiceWorkerRegistration | undefined;
  /** Activate the waiting SW and reload onto the new build. */
  applyUpdate: () => void;
}

export function useServiceWorkerUpdate(): ServiceWorkerUpdate {
  const { pathname } = useLocation();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const lastCheckRef = useRef(0);

  // Only an update when something is already active; the very first install
  // has no prior build to replace.
  const syncWaiting = useCallback(() => {
    const registration = registrationRef.current;
    const next = registration?.active ? (registration.waiting ?? null) : null;
    setWaiting(next);
  }, []);

  const watchInstalling = useCallback(
    (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" || worker.state === "redundant") syncWaiting();
      });
    },
    [syncWaiting],
  );

  // The one update check every trigger goes through (poll, focus,
  // visibility, reconnect, navigation): throttled, skipped offline.
  const checkForUpdate = useCallback(() => {
    const registration = registrationRef.current;
    if (!registration || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastCheckRef.current < MIN_CHECK_GAP_MS) return;
    lastCheckRef.current = now;
    registration
      .update()
      .then(syncWaiting)
      .catch(() => {
        /* transient network failure; the next trigger retries */
      });
  }, [syncWaiting]);

  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      // A persistent listener (workbox's own is one-shot), plus whatever
      // was already installing / waiting before registration resolved.
      registration.addEventListener("updatefound", () =>
        watchInstalling(registration.installing),
      );
      watchInstalling(registration.installing);
      syncWaiting();
      lastCheckRef.current = Date.now();
      if (intervalRef.current !== undefined) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    },
    onNeedRefresh: syncWaiting,
  });

  // Moving to another page in the app is a natural moment to pick up a deploy.
  useEffect(() => {
    checkForUpdate();
  }, [pathname, checkForUpdate]);

  // Check the moment the user comes back to the app or reconnects,
  // independent of the polling interval above.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      if (intervalRef.current !== undefined) clearInterval(intervalRef.current);
    };
  }, [checkForUpdate]);

  const applyUpdate = useCallback(() => {
    const worker = registrationRef.current?.waiting;
    if (!worker) return;
    // workbox-build's generated SW (skipWaiting unset) listens for this
    // message; once it takes control, reload onto the new build.
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    worker.postMessage({ type: "SKIP_WAITING" });
  }, []);

  // Nothing to lose: take the new build now instead of waiting on a click.
  useEffect(() => {
    if (waiting && !hasUnsavedWork()) applyUpdate();
  }, [waiting, applyUpdate]);

  return { waiting, registration: registrationRef.current, applyUpdate };
}
