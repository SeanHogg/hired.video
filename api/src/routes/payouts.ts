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
 * applyPayoutWebhook below — adding a separate URL would force two webhook
 * configs in the Helcim dashboard for a single signing secret.
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { payoutOnboardingService } from "../services/payout/PayoutOnboardingService.js";
import { payoutLedgerService } from "../services/payout/PayoutLedgerService.js";
import { invalidateTaxYearReports } from "../services/payout/TaxReportingService.js";
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

const { payouts: payoutsTable, payoutProfiles, billingEvents } = schema;

// ---------------------------------------------------------------------------
// GET /me/balance — ledger-derived balance breakdown
// ---------------------------------------------------------------------------
payoutRoutes.get("/me/balance", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  const balance = await payoutLedgerService.getBalance(userId);
  return c.json(success(balance), 200);
});

// ---------------------------------------------------------------------------
// GET /me/onboarding/status — current rail + masked hint + enabled flag
// ---------------------------------------------------------------------------
payoutRoutes.get("/me/onboarding/status", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  const status = await payoutOnboardingService.getStatus(userId);
  return c.json(success(status), 200);
});

// ---------------------------------------------------------------------------
// POST /me/onboarding/start — body: { provider, successUrl?, cancelUrl? }
// ---------------------------------------------------------------------------
payoutRoutes.post("/me/onboarding/start", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const { userId } = auth;
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
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const { userId } = auth;
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

// ---------------------------------------------------------------------------
// Shared webhook applier — called from this file's Tremendous handler AND
// from routes/payment.ts when a Helcim webhook turns out to be a payout
// event. The single function keeps the payout-state-machine logic in ONE
// place (DRY) regardless of how the event arrived.
// ---------------------------------------------------------------------------
export async function applyPayoutWebhook(
  payload: NormalizedPayoutWebhookPayload,
  providerKey: ActivePayoutProvider,
): Promise<void> {
  const db = getDb();

  // Idempotency — billing_events stores both inbound and outbound provider
  // events keyed by stripeEventId (column name is legacy / provider-agnostic).
  const [already] = await db
    .select({ id: billingEvents.id })
    .from(billingEvents)
    .where(eq(billingEvents.stripeEventId, payload.eventId))
    .limit(1);
  if (already) return;

  await db.insert(billingEvents).values({
    stripeEventId: payload.eventId,
    eventType: payload.eventType,
    payload: payload.raw as Record<string, unknown>,
  } as any);

  if (!payload.providerPayoutId) {
    // Event arrived but we can't reconcile to a payouts row — record it
    // and move on; admins can audit billing_events directly.
    return;
  }

  const [row] = await db
    .select()
    .from(payoutsTable)
    .where(
      and(
        eq(payoutsTable.providerPayoutId, payload.providerPayoutId),
        eq(payoutsTable.provider, providerKey),
      ),
    )
    .limit(1);
  if (!row) return;

  const now = new Date();
  const patch: Record<string, unknown> = { updatedAt: now, providerStatus: payload.providerStatus };
  switch (payload.eventType) {
    case "payout.sent":
      patch.status = "sent";
      patch.sentAt = row.sentAt ?? now;
      break;
    case "payout.settled":
      patch.status = "settled";
      patch.settledAt = row.settledAt ?? now;
      break;
    case "payout.failed":
      patch.status = "failed";
      patch.failedAt = row.failedAt ?? now;
      patch.failureReason = payload.failureReason ?? null;
      await payoutLedgerService.recordReversal({
        userId: row.userId,
        amountCents: row.amountCents,
        currency: row.currency,
        payoutId: row.id,
        note: `payout failed: ${payload.failureReason ?? "unknown"}`,
      });
      break;
    case "payout.reversed":
      patch.status = "reversed";
      patch.reversedAt = row.reversedAt ?? now;
      patch.failureReason = payload.failureReason ?? null;
      await payoutLedgerService.recordReversal({
        userId: row.userId,
        amountCents: row.amountCents,
        currency: row.currency,
        payoutId: row.id,
        note: `payout reversed: ${payload.failureReason ?? "unknown"}`,
      });
      break;
    case "unknown":
    default:
      break;
  }

  await db.update(payoutsTable).set(patch as any).where(eq(payoutsTable.id, row.id));
  // Settlement / reversal can move a payout in or out of a (possibly
  // closed) tax year — orphan the cached annual reports.
  invalidateTaxYearReports();
  await db
    .update(billingEvents)
    .set({ processedAt: new Date() } as any)
    .where(eq(billingEvents.stripeEventId, payload.eventId));
}

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

// payout_profiles re-exported for routes that need to peek at onboarding
// state from outside the service layer (kept tight — no broad re-export).
export { payoutProfiles };
