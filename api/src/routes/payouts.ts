/**
 * Payouts routes — outbound rail onboarding + balance read.
 *
 *   GET    /api/payouts/me/balance              — ledger-derived balance breakdown
 *   GET    /api/payouts/me/onboarding/status    — current rail + masked account hint
 *   POST   /api/payouts/me/onboarding/start     — open a provider session (HelcimPay token | tremendous email | manual)
 *   POST   /api/payouts/me/onboarding/complete  — persist the recipient account; flips payouts_enabled
 *   POST   /api/payouts/webhook/tremendous      — Tremendous reward lifecycle events
 *
 * Helcim ACH events arrive on the existing /api/payment/webhook URL (Helcim
 * shares its webhook URL across acquiring + ACH). The dispatcher in
 * routes/payment.ts hands raw events to HelcimAchPayoutProvider via
 * applyPayoutWebhook (services/payout/payoutWebhook.ts) — adding a separate URL would force two webhook
 * configs in the Helcim dashboard for a single signing secret.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { payoutOnboardingService } from "../services/payout/PayoutOnboardingService.js";
import { payoutLedgerService } from "../services/payout/PayoutLedgerService.js";
import { applyPayoutWebhook } from "../services/payout/payoutWebhook.js";
import { tryGetPayoutProvider } from "../services/payout/index.js";
import type { NormalizedPayoutWebhookPayload } from "../services/payout/types.js";
import { requestEnv } from "../utils/env.js";
import { requireUser } from "./helpers/routerHelpers.js";
import {
  ACTIVE_PAYOUT_PROVIDERS,
  isActivePayoutProvider,
  type ActivePayoutProvider,
  type PayoutOnboardingCompleteInput,
} from "../../../shared/payout-profile.js";

export const payoutRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /me/balance — ledger-derived balance breakdown
// ---------------------------------------------------------------------------
payoutRoutes.get("/me/balance", async (c) => {
  const userId = requireUser(c);
  const balance = await payoutLedgerService.getBalance(userId);
  return c.json(success(balance), 200);
});

// ---------------------------------------------------------------------------
// GET /me/onboarding/status — current rail + masked hint + enabled flag
// ---------------------------------------------------------------------------
payoutRoutes.get("/me/onboarding/status", async (c) => {
  const userId = requireUser(c);
  const status = await payoutOnboardingService.getStatus(userId);
  return c.json(success(status), 200);
});

// ---------------------------------------------------------------------------
// POST /me/onboarding/start — body: { provider, successUrl?, cancelUrl? }
// ---------------------------------------------------------------------------
payoutRoutes.post("/me/onboarding/start", async (c) => {
  const userId = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    provider?: string;
    successUrl?: string;
    cancelUrl?: string;
  };
  if (!isActivePayoutProvider(body.provider)) {
    return c.json(
      error(
        "VALIDATION_ERROR",
        `provider must be one of ${ACTIVE_PAYOUT_PROVIDERS.join(", ")}`,
      ),
      400,
    );
  }

  // The hosted Helcim widget needs a return URL. Default to the Settings
  // page route the embed lives on — the frontend can override per surface
  // (CreatorWorkspace embeds the same component but lives at /services).
  const successUrl = body.successUrl?.trim() || `${getOrigin(c)}/settings/payouts?onboarded=1`;
  const cancelUrl = body.cancelUrl?.trim() || `${getOrigin(c)}/settings/payouts?onboarded=0`;

  try {
    const session = await payoutOnboardingService.startSession(
      userId,
      body.provider as ActivePayoutProvider,
      successUrl,
      cancelUrl,
      requestEnv(c),
    );
    return c.json(success(session), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start onboarding session";
    return c.json(error("PROVIDER_ERROR", msg), 502);
  }
});

// ---------------------------------------------------------------------------
// POST /me/onboarding/complete — body: PayoutOnboardingCompleteInput
// ---------------------------------------------------------------------------
payoutRoutes.post("/me/onboarding/complete", async (c) => {
  const userId = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as Partial<PayoutOnboardingCompleteInput>;
  if (!isActivePayoutProvider(body.provider)) {
    return c.json(
      error(
        "VALIDATION_ERROR",
        `provider must be one of ${ACTIVE_PAYOUT_PROVIDERS.join(", ")}`,
      ),
      400,
    );
  }
  if (typeof body.providerAccountId !== "string" || !body.providerAccountId.trim()) {
    return c.json(error("VALIDATION_ERROR", "providerAccountId is required"), 400);
  }

  try {
    const status = await payoutOnboardingService.completeSession(userId, {
      provider: body.provider,
      providerAccountId: body.providerAccountId,
      hint: body.hint,
    });
    return c.json(success(status), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to complete onboarding";
    return c.json(error("ONBOARDING_FAILED", msg), 400);
  }
});

// ---------------------------------------------------------------------------
// POST /webhook/tremendous — REWARDS.* events
// ---------------------------------------------------------------------------
payoutRoutes.post("/webhook/tremendous", async (c) => {
  const provider = tryGetPayoutProvider("tremendous", requestEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Tremendous provider not configured"), 503);

  const rawBody = await c.req.text();
  let payload: NormalizedPayoutWebhookPayload | null;
  try {
    payload = await provider.verifyAndNormalizeWebhook(rawBody, c.req.raw.headers);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook signature verification failed";
    return c.json(error("WEBHOOK_ERROR", msg), 400);
  }
  if (!payload) return c.json({ received: true }, 200);

  await applyPayoutWebhook(payload, "tremendous");
  return c.json({ received: true }, 200);
});

// Cloudflare Workers don't expose Request.url's origin directly through
// Hono's context shorthand — read the Host header + protocol off the raw
// request. Falls back to APP_ORIGIN env so the value is sane even when the
// origin header is missing (e.g. local script invocation).
function getOrigin(c: any): string {
  const env = requestEnv(c);
  if (env.APP_ORIGIN) return env.APP_ORIGIN;
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}
