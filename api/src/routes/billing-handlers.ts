/**
 * Pure billing handlers — extracted for the write endpoints that had
 * ad-hoc DB logic inline (refund, cancel, trial). Read endpoints
 * (subscription, payment-methods, invoices) already delegate to
 * billingService — those aren't duplicated here.
 *
 * Follows the same DI pattern as auth-handlers.ts / resume-handlers.ts.
 */

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { schema } from "../db/index.js";

const { refundRequests, subscriptions } = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;

export interface BillingDeps {
  db: DbPort;
  now: () => Date;
}

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export interface HandlerResult<T = unknown> {
  status: number;
  body: T;
}

function ok<T>(data: T, status = 200): HandlerResult<{ success: true; data: T; timestamp: string }> {
  return { status, body: { success: true as const, data, timestamp: new Date().toISOString() } };
}

function fail(status: number, code: string, message: string, details?: unknown) {
  return {
    status,
    body: {
      success: false as const,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const RefundRequestSchema = z.object({
  reason: z.string().min(1, "reason is required"),
  invoiceId: z.string().optional().nullable(),
  // Amount in cents — the handler converts to the decimal-dollars string
  // that the refund_requests table expects.
  amountCents: z.number().int().min(0).optional().nullable(),
});

export const CancelAccountSchema = z.object({
  reason: z.string().optional(),
  requestRefund: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// handleRefundRequest
// ═══════════════════════════════════════════════════════════════════════════

export async function handleRefundRequest(
  deps: BillingDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const parsed = RefundRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "reason is required", parsed.error.flatten());
  }

  const [inserted] = await deps.db
    .insert(refundRequests)
    .values({
      userId: viewerId,
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
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const parsed = CancelAccountSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid body", parsed.error.flatten());
  }

  const reason = parsed.data.reason ?? "user_requested";
  const [inserted] = await deps.db
    .insert(refundRequests)
    .values({
      userId: viewerId,
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
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");

  const [existing] = await deps.db
    .select({ id: subscriptions.id, status: subscriptions.status })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.userId, viewerId),
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
      userId: viewerId,
      planId: input.planId,
      status: "trialing",
      trialEnd: trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
    } as any)
    .returning();

  return ok(inserted, 201);
}
