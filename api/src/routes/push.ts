/**
 * Browser Web Push registration (mounted at /api/push, authenticated).
 *
 *   GET    /api/push/vapid-public-key  — application server key (null when push is off)
 *   POST   /api/push/subscriptions     — register / refresh this browser's endpoint
 *   DELETE /api/push/subscriptions?endpoint=…  — remove this browser's endpoint
 *
 * Delivery itself is `services/push/web-push.ts` (notification dispatcher).
 */

import { Hono } from "hono";
import { requireUser } from "./helpers/routerHelpers.js";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { getVapidPublicKey } from "../services/push/web-push.js";

export const pushRoutes = new Hono<AppEnv>();

const Base64UrlSchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+=*$/);

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2048).startsWith("https://"),
  keys: z.object({ p256dh: Base64UrlSchema, auth: Base64UrlSchema }),
});

const UnsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

// Env read only (no DB / network) — nothing worth caching.
pushRoutes.get("/vapid-public-key", (c) =>
  c.json(success({ publicKey: getVapidPublicKey() }), 200),
);

pushRoutes.post("/subscriptions", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  const parsed = SubscribeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid push subscription"), 400);
  await buildRepos(getDb()).pushSubscriptions.upsert({
    userId,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });
  return c.json(success({ subscribed: true }), 201);
});

pushRoutes.delete("/subscriptions", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  const parsed = UnsubscribeSchema.safeParse({ endpoint: c.req.query("endpoint") });
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "endpoint is required"), 400);
  await buildRepos(getDb()).pushSubscriptions.deleteForUser(userId, parsed.data.endpoint);
  return c.json(success({ subscribed: false }), 200);
});
