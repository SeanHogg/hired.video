/**
 * Browser side of Web Push — registers this browser's PushSubscription with
 * `/api/push` (api/src/routes/push.ts). The service worker's `push` /
 * `notificationclick` handlers live in public/push-sw.js; delivery is the
 * server notification dispatcher (api/src/services/push/web-push.ts).
 */
import { apiClient } from "@/lib/api-client";

/** `unsupported` — no SW/PushManager (e.g. iOS Safari outside a home-screen
 *  app) or push isn't configured server-side. */
export type PushDeviceState = "unsupported" | "denied" | "subscribed" | "unsubscribed";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

let vapidKeyPromise: Promise<string | null> | null = null;

/** Server application key; cached for the page lifetime (it only changes
 *  on a key rotation, which also needs a redeploy). */
function getVapidPublicKey(): Promise<string | null> {
  vapidKeyPromise ??= apiClient
    .get<{ publicKey: string | null }>("/api/push/vapid-public-key")
    .then((res) => res.data.publicKey)
    .catch(() => {
      vapidKeyPromise = null;
      return null;
    });
  return vapidKeyPromise;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function getPushDeviceState(): Promise<PushDeviceState> {
  if (!isPushSupported()) return "unsupported";
  if (!(await getVapidPublicKey())) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "subscribed" : "unsubscribed";
}

/** Ask for permission (must run from a user gesture), subscribe, and
 *  register the endpoint server-side. Resolves to the resulting state. */
export async function subscribeThisDevice(): Promise<PushDeviceState> {
  const publicKey = await getVapidPublicKey();
  if (!isPushSupported() || !publicKey) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "unsubscribed";
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));
  const json = subscription.toJSON();
  await apiClient.post("/api/push/subscriptions", {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  });
  return "subscribed";
}

export async function unsubscribeThisDevice(): Promise<PushDeviceState> {
  if (!isPushSupported()) return "unsupported";
  const subscription = await currentSubscription();
  if (subscription) {
    await apiClient.delete(`/api/push/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`);
    await subscription.unsubscribe();
  }
  return "unsubscribed";
}

function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
