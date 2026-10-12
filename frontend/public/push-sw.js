/* hired.video Web Push handlers — imported into the Workbox-generated
 * service worker via `workbox.importScripts` (vite.config.ts). Same-origin
 * so it survives the COEP isolation the studio needs.
 *
 * Payload contract = api/src/services/push/web-push.ts `WebPushPayload`:
 *   { title: string, body: string, url?: string }
 */
/* eslint-disable no-restricted-globals */

// The SW used to cache API responses ("api-cache", NetworkFirst) — per-user
// data keyed by URL only. That route is gone (vite.config.ts); drop the
// leftover cache so no stale cross-account response can be served.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("api-cache").catch(() => false));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "hired.video";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  // Only ever navigate within our own origin.
  const href = target.origin === self.location.origin ? target.href : self.location.origin + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.navigate(href).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
