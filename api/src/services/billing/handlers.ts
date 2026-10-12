/**
 * Pure billing handlers — extracted for the write endpoints that had
 * ad-hoc DB logic inline (refund, cancel, trial). Read endpoints
 * (subscription, payment-methods, invoices) already delegate to
 * billingService — those aren't duplicated here.
 *
 * Follows the same DI pattern as auth-handlers.ts / resume-handlers.ts.
 */

import { and, eq, inArray } from "drizzle-orm";
import { schema } from "../../db/index.js";

const { refundRequests, subscriptions } = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;

export interface BillingDeps {
  db: DbPort;
  now: () => Date;
}

// Result envelope + auth guard live in the shared handler module so every
// handler speaks the same wire format and applies the same auth rule.
import { ok, fail, requireAuth, type HandlerResult } from "../../handlers/shared.js";
export { ok, fail };
export type { HandlerResult };

// ---------------------------------------------------------------------------
// Schemas — canonical source is shared/billing.ts.
// ---------------------------------------------------------------------------

import { RefundRequestSchema, CancelAccountSchema } from "../../../../shared/billing.js";
export { RefundRequestSchema, CancelAccountSchema };

// ═══════════════════════════════════════════════════════════════════════════
// handleRefundRequest
// ═══════════════════════════════════════════════════════════════════════════

export async function handleRefundRequest(
  deps: BillingDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const parsed = RefundRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "reason is required", parsed.error.flatten());
  }

  const [inserted] = await deps.db
    .insert(refundRequests)
    .values({
      userId: auth.userId,
      invoiceId: parsed.data.invoiceId ?? null,
      reason: parsed.data.reason,
      amount: parsed.data.amountCents != null
        ? String(parsed.data.amountCents / 100)
        : null,
      status: "pending",
    } as any)
    .returning();

  return ok(inserted, 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCancelAccount
//   • Records a cancellation request (prefixed with "CANCELLATION:" so
//     we can distinguish cancellations from pure refund requests in the
//     same table until a dedicated table lands).
//   • Preserves the `requestRefund` boolean so customer support can
//     handle the refund side of the request separately.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCancelAccount(
  deps: BillingDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const parsed = CancelAccountSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid body", parsed.error.flatten());
  }

  const reason = parsed.data.reason ?? "user_requested";
  const [inserted] = await deps.db
    .insert(refundRequests)
    .values({
      userId: auth.userId,
      reason: `CANCELLATION: ${reason}`,
      status: "pending",
    } as any)
    .returning();

  return ok(
    {
      ...inserted,
      type: "cancellation",
      requestRefund: Boolean(parsed.data.requestRefund),
    },
    201,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// handleStartTrial
//   • 409 CONFLICT if user already has an active or trialing subscription
//     (one trial per user enforced at the handler, not the DB, since
//     subscriptions can exist at multiple statuses).
//   • Creates a 14-day trialing subscription for the target plan.
// ═══════════════════════════════════════════════════════════════════════════

export interface StartTrialInput {
  planId: string;
  durationDays?: number;
}

export async function handleStartTrial(
  deps: BillingDeps,
  viewerId: string | null,
  input: StartTrialInput,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const [existing] = await deps.db
    .select({ id: subscriptions.id, status: subscriptions.status })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.userId, auth.userId),
      inArray(subscriptions.status, ["active", "trialing"]),
    ))
    .limit(1);

  if (existing) {
    return fail(409, "CONFLICT", "You already have an active subscription or trial");
  }

  const now = deps.now();
  const durationDays = input.durationDays ?? 14;
  const trialEndsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const [inserted] = await deps.db
    .insert(subscriptions)
    .values({
      userId: auth.userId,
      planId: input.planId,
      status: "trialing",
      trialEnd: trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
    } as any)
    .returning();

  return ok(inserted, 201);
}
