/**
 * /api/checkout — the ONE start → pay → confirm surface for server-priced
 * one-off purchases (boosts, paid courses, token packs). Contract:
 * shared/checkout.ts. Thin layer: validate → registry handler
 * (services/billing/checkout) → map CheckoutError to HTTP.
 *
 *   POST /                { kind, ... }                 start (server-priced)
 *   GET  /mine[?kind=]                                  completed purchases
 *   GET  /:id                                           one checkout
 *   POST /:id/pay         { successUrl?, cancelUrl? }   open the payment widget
 *   POST /:id/confirm     { transactionId }             provider-verified fulfil
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  CHECKOUT_KINDS,
  ConfirmCheckoutSchema,
  isCheckoutKind,
  parseCheckoutId,
  PayCheckoutSchema,
  StartCheckoutSchema,
  type CheckoutKind,
} from "../../../shared/checkout.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { oneOffPaymentsFromEnv } from "../services/billing/payment/oneOffPayments.js";
import { checkoutHandler } from "../services/billing/checkout/registry.js";
import { type CheckoutContext } from "../services/billing/checkout/types.js";
import { validateJson } from "./helpers/validate.js";

export const checkoutRoutes = new Hono<AppEnv>();

function envOf(c: Context<AppEnv>): Record<string, string | undefined> {
  return (c as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

function contextOf(c: Context<AppEnv>): CheckoutContext | null {
  const userId = c.var.userId ?? null;
  if (!userId) return null;
  const env = envOf(c);
  return { userId, env, payments: oneOffPaymentsFromEnv(env) };
}

/** Run a handler call; typed refusals (CheckoutError) render via the global error handler. */
async function respond<T>(c: Context<AppEnv>, fn: () => Promise<T>, status: 200 | 201 = 200): Promise<Response> {
  return c.json(success(await fn()), status);
}

const unauthorized = (c: Context<AppEnv>) => c.json(error("UNAUTHORIZED", "Authentication required"), 401);
const notFound = (c: Context<AppEnv>) => c.json(error("NOT_FOUND", "Checkout not found"), 404);

// Confirm hits the payment provider's API; cap it per user so a client can't
// use it to probe transaction ids.
const confirmLimiter = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 20,
  message: "Too many attempts. Please try again in a few minutes.",
  keyOf: (c) => `checkout-confirm:${(c.get("user") as { sub?: string } | undefined)?.sub ?? getClientIp(c)}`,
});

checkoutRoutes.post("/", validateJson(StartCheckoutSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid checkout payload")), async (c) => {
  const ctx = contextOf(c);
  if (!ctx) return unauthorized(c);
  const body = c.req.valid("json");
  const input = body;
  return respond(c, () => checkoutHandler(input.kind).start(ctx, input), 201);
});

// Registered before /:id so "mine" isn't captured as a checkout id.
checkoutRoutes.get("/mine", async (c) => {
  const ctx = contextOf(c);
  if (!ctx) return unauthorized(c);
  const kindParam = c.req.query("kind");
  if (kindParam !== undefined && !isCheckoutKind(kindParam)) {
    return c.json(error("VALIDATION_ERROR", "Unknown checkout kind"), 400);
  }
  const kinds: CheckoutKind[] = kindParam ? [kindParam as CheckoutKind] : [...CHECKOUT_KINDS];
  return respond(c, async () => {
    const lists = await Promise.all(kinds.map((k) => checkoutHandler(k).listMine?.(ctx) ?? Promise.resolve([])));
    return lists.flat();
  });
});

checkoutRoutes.get("/:id", async (c) => {
  const ctx = contextOf(c);
  if (!ctx) return unauthorized(c);
  const ref = parseCheckoutId(c.req.param("id"));
  if (!ref) return notFound(c);
  return respond(c, () => checkoutHandler(ref.kind).get(ctx, ref.key));
});

checkoutRoutes.post("/:id/pay", validateJson(PayCheckoutSchema, () => error("VALIDATION_ERROR", "Invalid successUrl / cancelUrl")), async (c) => {
  const ctx = contextOf(c);
  if (!ctx) return unauthorized(c);
  const ref = parseCheckoutId(c.req.param("id"));
  if (!ref) return notFound(c);
  const body = c.req.valid("json");
  const fallback = `${c.req.header("origin") ?? "https://hired.video"}/settings?tab=billing`;
  const urls = {
    successUrl: body.successUrl ?? fallback,
    cancelUrl: body.cancelUrl ?? fallback,
  };
  return respond(c, () => checkoutHandler(ref.kind).pay(ctx, ref.key, urls));
});

checkoutRoutes.post("/:id/confirm", confirmLimiter, validateJson(ConfirmCheckoutSchema, () => error("VALIDATION_ERROR", "transactionId required"), { emptyBody: null }), async (c) => {
  const ctx = contextOf(c);
  if (!ctx) return unauthorized(c);
  const ref = parseCheckoutId(c.req.param("id"));
  if (!ref) return notFound(c);
  const body = c.req.valid("json");
  return respond(c, () => checkoutHandler(ref.kind).confirm(ctx, ref.key, body.transactionId));
});
