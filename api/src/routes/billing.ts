import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import * as billingService from "../services/billing/BillingService.js";
import * as subscriptionLifecycle from "../services/billing/subscriptionLifecycleService.js";
import * as companySeatBilling from "../services/billing/companySeatBillingService.js";
import { getPricingConfig } from "../services/platform/PricingConfigService.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { inboxSeatAddonService } from "../services/billing/InboxSeatAddonService.js";
import { handleRefundRequest, handleCancelAccount, liveBillingDeps } from "../services/billing/handlers.js";
import { RefundRequestsRepository } from "../repositories/refundRequestsRepository.js";
import { requirePro } from "../middleware/auth-gates.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const billingRoutes = new Hono<AppEnv>();

const nowIso = () => new Date().toISOString();

billingRoutes.get("/subscription", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await billingService.getSubscription(userId)), 200);
});

// Public read of the runtime-editable pricing config. Powers the /pricing
// page and any caller that needs the current Pro / per-seat prices instead
// of the shared/pricing.ts compile-time defaults.
billingRoutes.get("/pricing-config", async (c) => {
  return c.json(success(await getPricingConfig()), 200);
});

billingRoutes.get("/payment-methods", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await billingService.getPaymentMethods(userId)), 200);
});

billingRoutes.get("/invoices", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await billingService.getInvoices(userId)), 200);
});

billingRoutes.get("/ai-usage/month", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await billingService.getAIUsageForUser(userId)), 200);
});

/**
 * GET /api/Billing/token-budget — full token-budget summary for the current
 * user. Used by the sidebar AITokenPill, the AIUsageLimitBanner, and the
 * "buy more tokens" sheet. Replaces the request-count `/ai-usage/month`
 * shape with true token metering.
 */
billingRoutes.get("/token-budget", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await billingService.buildTokenBudgetDTO(userId)), 200);
});

/**
 * GET /api/Billing/usage-statement[?month=YYYY-MM]
 *
 * Live or closed Usage Statement for the caller. The current month is
 * computed from the ledger on the fly; closed months return the frozen
 * `usage_statements` row written by the monthly close cron.
 *
 * Every Free user sees a $0 statement so the "Free Invoice" surface is
 * uniform across plans — see [month-close.ts](../domains/services-processing/month-close.ts).
 */
billingRoutes.get("/usage-statement", async (c) => {
  const userId = requireUser(c);
  const monthParam = c.req.query("month");
  let periodStart: Date | undefined;
  if (monthParam) {
    const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
    if (!match) {
      return c.json(error("VALIDATION_ERROR", "month must be YYYY-MM"), 400);
    }
    periodStart = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  }
  return c.json(success(await servicesProcessor.getStatement(userId, periodStart)), 200);
});

/**
 * GET /api/Billing/usage-invoices — list all closed invoices for the caller
 * (paid + Free $0). Newest first.
 */
billingRoutes.get("/usage-invoices", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await subscriptionLifecycle.listUsageInvoices(userId)), 200);
});

billingRoutes.post("/refund-request", async (c) => {
  // Delegates to the pure, fully-tested handler (billing/handlers.ts) so the
  // refund-row shape + validation (incl. rejecting negative amountCents via
  // RefundRequestSchema) lives in ONE place instead of a divergent inline copy.
  const body = await c.req.json().catch(() => ({}));
  const result = await handleRefundRequest(liveBillingDeps(), c.var.userId, body);
  return c.json(result.body as any, result.status as any);
});

billingRoutes.get("/refund-requests", async (c) => {
  const rows = await new RefundRequestsRepository().listForUser(requireUser(c));
  return c.json(success(rows), 200);
});

billingRoutes.get("/refund-requests/:requestId", async (c) => {
  const userId = requireUser(c);
  const row = await new RefundRequestsRepository().findById(c.req.param("requestId"));
  if (!row || row.userId !== userId) return c.json(error("NOT_FOUND", "Refund request not found"), 404);
  return c.json(success(row), 200);
});

billingRoutes.post("/cancel-account", async (c) => {
  // Delegates to the pure handler — same CANCELLATION: marker + requestRefund
  // carry-through, but defined once (handlers.ts) and covered by its tests.
  const body = await c.req.json().catch(() => ({}));
  const result = await handleCancelAccount(liveBillingDeps(), c.var.userId, body);
  return c.json(result.body as any, result.status as any);
});

billingRoutes.get("/cancellation-requests", async (c) => {
  const rows = await new RefundRequestsRepository().listForUser(requireUser(c));
  const cancellations = rows.filter((r) => r.reason.startsWith("CANCELLATION:"));
  return c.json(success(cancellations), 200);
});

billingRoutes.get("/refund-policy", (c) =>
  c.json(
    success({
      refundPeriodDays: 14,
      eligiblePlans: ["monthly", "annual"],
      excludedReasons: [],
      policyText: "Refunds are reviewed case-by-case within the eligible period.",
      lastUpdated: nowIso(),
    }),
    200,
  ),
);

billingRoutes.get("/refund-reasons", (c) =>
  c.json(
    success({
      reasons: [
        { value: "accidental_purchase", label: "Accidental purchase" },
        { value: "technical_issue", label: "Technical issue" },
        { value: "billing_error", label: "Billing error" },
        { value: "other", label: "Other" },
      ],
    }),
    200,
  ),
);

// ---------------------------------------------------------------------------
// GET /api/billing/usage-summary — paywall meter data for frontend (#55)
// Returns current plan limits vs. actual usage so the UI can show
// "X of 10 AI requests used" and gated feature availability.
// ---------------------------------------------------------------------------
billingRoutes.get("/usage-summary", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await subscriptionLifecycle.getUsageSummary(userId)), 200);
});

// ---------------------------------------------------------------------------
// POST /api/billing/trial/start — start a 14-day free trial (#57)
// Creates a trialing subscription for the lowest-cost pro plan.
// One trial per user enforced via existing subscription check.
// ---------------------------------------------------------------------------
billingRoutes.post("/trial/start", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await subscriptionLifecycle.startTrial(userId)), 201);
});

// ---------------------------------------------------------------------------
// POST /api/billing/subscribe — create or upgrade a subscription (#56)
// Body: { planSlug: string, interval: "monthly" | "yearly" }
// Yearly billing applies a 20% discount (uses priceYearly from plan).
// ---------------------------------------------------------------------------
const SubscribeSchema = z.object({
  planSlug: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

billingRoutes.post("/subscribe", validateJson(SubscribeSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const { planSlug, interval } = c.req.valid("json");
  return c.json(success(await subscriptionLifecycle.subscribeToPlan(userId, planSlug, interval)), 201);
});

// ---------------------------------------------------------------------------
// POST /api/billing/pause — pause billing for 30 days (#58 churn flow)
// Sets subscription status to paused; cron will need to resume it.
// ---------------------------------------------------------------------------
billingRoutes.post("/pause", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await subscriptionLifecycle.pauseSubscription(userId)), 200);
});

// ---------------------------------------------------------------------------
// POST /api/billing/downgrade — downgrade to free tier (#58 churn flow)
// ---------------------------------------------------------------------------
billingRoutes.post("/downgrade", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await subscriptionLifecycle.downgradeToFree(userId)), 200);
});

// ---------------------------------------------------------------------------
// GET /api/billing/notifications — in-app billing event alerts (#62)
// Returns pending alerts: trial ending, payment failed, usage warnings.
// ---------------------------------------------------------------------------
billingRoutes.get("/notifications", async (c) => {
  const userId = requireUser(c);
  return c.json(success({ alerts: await subscriptionLifecycle.getBillingAlerts(userId) }), 200);
});

// ---------------------------------------------------------------------------
// Company / employer seat-based billing (#67)
// Separate from individual user subscriptions — charged per recruiter seat.
// ---------------------------------------------------------------------------

const SeatUpdateSchema = z.object({
  seatCount: z.number().int().min(1).max(500),
  planTier: z.enum(["starter", "team", "enterprise"]).optional(),
  billingInterval: z.enum(["monthly", "yearly"]).optional(),
});

/** GET /api/billing/company/:companyId — get current company plan + seat usage */
billingRoutes.get("/company/:companyId", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await companySeatBilling.getCompanyBilling(userId, c.req.param("companyId"))), 200);
});

/** PATCH /api/billing/company/:companyId/seats — add/remove seats */
billingRoutes.patch("/company/:companyId/seats", validateJson(SeatUpdateSchema, (e) => error("VALIDATION_ERROR", "Invalid seat update", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const result = await companySeatBilling.updateCompanySeats(userId, c.req.param("companyId"), c.req.valid("json"));
  return c.json(success(result), 200);
});

// ---------------------------------------------------------------------------
// #809 — Inbox-seat addons (extra connected mailboxes above the 3 included).
//
//   GET   /api/billing/inbox-seats             current quantity + monthly $
//   PATCH /api/billing/inbox-seats { quantity } set new quantity (0-50)
//
// Pro-gated — the add-on only stacks on top of the Pro-included mailboxes,
// so a Free caller has nothing to manage here (the connect-time gate would
// block them anyway). `requirePro` keeps a non-Pro user from writing a
// dangling `inbox_seat_addons` row that the cap-check would never honour.
// ---------------------------------------------------------------------------
billingRoutes.get("/inbox-seats", requirePro("Inbox Sync"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await inboxSeatAddonService.getState(userId)), 200);
});

const inboxSeatsPatchSchema = z.object({
  quantity: z.number().int().min(0).max(50),
});

billingRoutes.patch("/inbox-seats", requirePro("Inbox Sync"), validateJson(inboxSeatsPatchSchema, () => error("VALIDATION_ERROR", "quantity must be an integer 0-50")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  try {
    const state = await inboxSeatAddonService.setQuantity(userId, body.quantity);
    return c.json(success(state), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update inbox seats";
    return c.json(error("INVALID_QUANTITY", msg), 400);
  }
});
