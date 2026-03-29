/**
 * PWA Web Push helper
 *
 * Usage:
 *   const supported = isPushSupported();
 *   const granted = await requestPushPermission();
 *   if (granted) await subscribeToPush();
 */

import { apiClient } from "@/lib/api-client";

// VAPID public key must be set in the env (same key as the backend uses)
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Returns true if the browser supports Web Push */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Current notification permission state */
export function getPushPermission(): NotificationPermission {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
}

/** Request notification permission from the user */
export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Convert a URL-safe base64 string to a Uint8Array (for VAPID key) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Subscribe this browser to push notifications and register with the API */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  if (!VAPID_PUBLIC_KEY) {
    console.warn("[push] VITE_VAPID_PUBLIC_KEY is not set — push notifications disabled");
    return null;
  }

  const reg = await navigator.serviceWorker.ready;
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Persist to backend
    const json = sub.toJSON();
    await apiClient.post("/api/push/subscribe", {
      endpoint: json.endpoint,
      keys: json.keys,
    });

    return sub;
  } catch (err) {
    console.error("[push] Failed to subscribe:", err);
    return null;
  }
}

/** Unsubscribe this browser from push notifications */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const endpoint = sub.endpoint;
  await sub.unsubscribe();

  await apiClient.delete("/api/push/unsubscribe", { endpoint }).catch(() => undefined);
}

/** Get the current push subscription (null if not subscribed) */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
