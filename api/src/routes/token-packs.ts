/**
 * /api/token-packs — Pro users top up their monthly AI-token allowance.
 *
 *   POST /:packId/checkout  { successUrl?, cancelUrl? } — open a server-priced
 *                            one-off charge in the payment widget
 *   POST /confirm           { packId, transactionId } — record the charge as
 *                            pending, verify it with the payment provider and
 *                            credit the pack; `pending: true` when the
 *                            provider can't confirm yet (the 5-minute cron
 *                            finishes it — tokenPackReconcile.ts, #2352)
 *
 * Thin layer: validate → use case → map TokenPackError to HTTP.
 * Contract: shared/token-packs.ts.
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  ConfirmTokenPackSchema,
  StartTokenPackCheckoutSchema,
  type TokenPackErrorKind,
} from "../../../shared/token-packs.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { buildTokenPackDeps } from "../services/billing/token-packs/tokenPackDeps.js";
import {
  confirmTokenPackPurchase,
  startTokenPackCheckout,
  TokenPackError,
} from "../services/billing/token-packs/tokenPackUseCases.js";

export const tokenPackRoutes = new Hono<AppEnv>();

const STATUS: Record<TokenPackErrorKind, 402 | 403 | 404 | 503> = {
  UNKNOWN_PACK: 404,
  PRO_REQUIRED: 403,
  PAYMENTS_UNAVAILABLE: 503,
  PAYMENT_NOT_VERIFIED: 402,
};

function tokenPackErrorResponse(c: Context<AppEnv>, err: unknown): Response {
  if (err instanceof TokenPackError) return c.json(error(err.kind, err.message), STATUS[err.kind]);
  throw err;
}

function envOf(c: Context<AppEnv>): Record<string, string | undefined> {
  return (c as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

// Confirm hits the payment provider's API; cap it per user so a client can't
// use it to probe transaction ids.
const confirmLimiter = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 20,
  message: "Too many attempts. Please try again in a few minutes.",
  keyOf: (c) => `token-pack:${(c.get("user") as { sub?: string } | undefined)?.sub ?? getClientIp(c)}`,
});

tokenPackRoutes.post("/:packId/checkout", async (c) => {
  const parsed = StartTokenPackCheckoutSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request"), 400);
  const origin = c.req.header("origin") ?? "https://hired.video";
  try {
    const result = await startTokenPackCheckout(buildTokenPackDeps(envOf(c)), {
      userId: c.var.user.sub,
      packId: c.req.param("packId"),
      successUrl: parsed.data.successUrl ?? `${origin}/settings?tab=billing`,
      cancelUrl: parsed.data.cancelUrl ?? `${origin}/settings?tab=billing`,
    });
    return c.json(success(result));
  } catch (err) {
    return tokenPackErrorResponse(c, err);
  }
});

tokenPackRoutes.post("/confirm", confirmLimiter, async (c) => {
  const parsed = ConfirmTokenPackSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request"), 400);
  try {
    const result = await confirmTokenPackPurchase(buildTokenPackDeps(envOf(c)), {
      userId: c.var.user.sub,
      packId: parsed.data.packId,
      transactionId: parsed.data.transactionId,
    });
    return c.json(success(result));
  } catch (err) {
    return tokenPackErrorResponse(c, err);
  }
});
