/**
 * Inbound social platform webhooks (#2048) — PUBLIC (no JWT): every
 * delivery is authenticated by the network's own signature instead.
 *
 *   GET  /api/social/webhooks/:platform   subscription handshake (Meta /
 *                                         WebSub challenge echo, X CRC,
 *                                         LinkedIn challengeCode)
 *   POST /api/social/webhooks/:platform   a signed delivery: 401 on a bad
 *                                         signature; otherwise 200 at once
 *                                         and the ingest (publish
 *                                         confirmations + a metrics refresh
 *                                         for the posts it names) runs after
 *                                         the response (waitUntil) — networks
 *                                         retry slow acknowledgements
 *
 * Thin HTTP layer over services/distribution/metrics/ingest-webhook.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { isVideoPublishPlatform } from "../../../shared/social-platforms.js";
import { checkDelivery, ingestDelivery, subscriptionReply } from "../services/distribution/metrics/ingest-webhook.js";

export const socialWebhookRoutes = new Hono<AppEnv>();

/** Deliveries are small JSON / Atom documents; anything larger is refused. */
const MAX_BODY_BYTES = 256 * 1024;

socialWebhookRoutes.get("/:platform", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isVideoPublishPlatform(platform)) return c.json(error("NOT_FOUND", "Unknown platform"), 404);
  const reply = await subscriptionReply(platform, (name) => c.req.query(name));
  if (!reply) return c.json(error("FORBIDDEN", "Invalid subscription check"), 403);
  return reply.kind === "text" ? c.text(reply.body, 200) : c.json(reply.body, 200);
});

socialWebhookRoutes.post("/:platform", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  if (!isVideoPublishPlatform(platform)) return c.json(error("NOT_FOUND", "Unknown platform"), 404);
  const length = Number(c.req.header("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return c.json(error("PAYLOAD_TOO_LARGE", "Delivery too large"), 413);
  const body = await c.req.text();
  if (body.length > MAX_BODY_BYTES) return c.json(error("PAYLOAD_TOO_LARGE", "Delivery too large"), 413);

  const valid = await checkDelivery(platform, { header: (name) => c.req.header(name), body });
  if (!valid) return c.json(error("INVALID_SIGNATURE", "Signature check failed"), 401);

  const work = ingestDelivery(platform, body, c.env).catch((err) =>
    console.error(`[social-webhooks] ${platform} ingest failed:`, err instanceof Error ? err.message : err),
  );
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // No execution context (tests / Node): finish before answering.
    await work;
  }
  return c.json(success({ received: true }));
});
