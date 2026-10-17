/**
 * Shared Web Push delivery — RFC 8030 transport, RFC 8291 `aes128gcm`
 * payload encryption and RFC 8292 VAPID, Cloudflare-Workers compatible
 * (Web Crypto only). The wire format lives in `web-push-crypto.ts`.
 *
 * Single source of truth for every server-side push fanout. Call sites:
 *
 *   - notification dispatcher (notificationService.emitNotification)
 *   - game peer-joined / room events (routes/games.ts via the signaling DO)
 *
 * Browsers register their endpoint through `/api/push/subscriptions`
 * (routes/push.ts); the service worker's `push` handler lives in
 * frontend/public/push-sw.js.
 *
 * VAPID keys resolve from `process.env` first, then the Worker `__ENV`
 * binding. When they are missing every helper no-ops (dev default).
 */

import { getDb } from "../../db/index.js";
import {
  PushSubscriptionsRepository,
  type IPushSubscriptionsRepository,
  type PushSubscriptionRow,
} from "../../repositories/pushSubscriptionsRepository.js";
import {
  buildVapidAuthorization,
  encryptPushPayload,
  type VapidKeys,
} from "./web-push-crypto.js";
import { logger } from "../../lib/logger.js";

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Push services answer 404/410 once a subscription has expired or the
 *  user revoked permission — the endpoint will never work again. */
const GONE_STATUSES = new Set([404, 410]);
const PUSH_TTL_SECONDS = 24 * 60 * 60;

function readEnv(key: string): string | undefined {
  const workerEnv = (globalThis as { __ENV?: Record<string, string | undefined> }).__ENV;
  return process.env[key] ?? workerEnv?.[key];
}

function readVapid(): VapidKeys | null {
  const publicKey = readEnv("VAPID_PUBLIC_KEY");
  const privateKey = readEnv("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: readEnv("VAPID_SUBJECT") ?? "mailto:noreply@hired.video" };
}

/** The application server key browsers subscribe with, or null when push
 *  isn't configured (the client then hides its device toggle). */
export function getVapidPublicKey(): string | null {
  return readVapid()?.publicKey ?? null;
}

/** Best-effort fanout to every push subscription a user has on file.
 *  Gone endpoints (404/410) are pruned; transient failures keep the row.
 *  Returns `false` when VAPID isn't configured, `true` once the loop ran. */
export async function sendPushToUser(
  userId: string,
  payload: WebPushPayload,
  repo: IPushSubscriptionsRepository = new PushSubscriptionsRepository(getDb()),
): Promise<boolean> {
  if (!readVapid()) return false;
  const subs = await repo.listForUser(userId);
  return sendPushToSubscriptions(subs, payload, repo);
}

/** True when VAPID keys are configured (push can actually be delivered).
 *  Lets multi-recipient callers skip the subscription batch-load entirely
 *  in dev / unconfigured environments. */
export function isPushConfigured(): boolean {
  return readVapid() !== null;
}

/** Fan-out callers (the notification dispatcher) batch-load every
 *  recipient's subscriptions in ONE query via
 *  `IPushSubscriptionsRepository.listForUsers`, then deliver per user with
 *  `sendPushToSubscriptions` — no per-recipient subscription query. */
export async function sendPushToSubscriptions(
  subs: readonly PushSubscriptionRow[],
  payload: WebPushPayload,
  repo: IPushSubscriptionsRepository = new PushSubscriptionsRepository(getDb()),
): Promise<boolean> {
  const vapid = readVapid();
  if (!vapid) return false;
  if (subs.length === 0) return true;
  const body = new TextEncoder().encode(JSON.stringify(payload));
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const res = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Encoding": "aes128gcm",
            Authorization: await buildVapidAuthorization(sub.endpoint, vapid),
            TTL: String(PUSH_TTL_SECONDS),
          },
          body: await encryptPushPayload(body, { p256dh: sub.p256dh, auth: sub.auth }),
        });
        if (GONE_STATUSES.has(res.status)) {
          await repo.deleteByEndpoint(sub.endpoint);
        } else if (!res.ok) {
          logger.warn("[web-push] delivery rejected", { status: res.status, host: new URL(sub.endpoint).host });
        }
      } catch (err) {
        logger.warn("[web-push] delivery failed", err);
      }
    }),
  );
  return true;
}
