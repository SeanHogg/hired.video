import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import * as billingService from "../services/billing.js";

export const billingRoutes = new Hono<{ Variables: Variables }>();

const nowIso = () => new Date().toISOString();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: nowIso() };
}

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

billingRoutes.get("/subscription", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await billingService.getSubscription(userId)), 200);
});

billingRoutes.get("/payment-methods", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await billingService.getPaymentMethods(userId)), 200);
});

billingRoutes.get("/invoices", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await billingService.getInvoices(userId)), 200);
});

billingRoutes.get("/ai-usage/month", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await billingService.getAIUsageForUser(userId)), 200);
});

billingRoutes.post("/refund-request", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body?.reason ?? "");
  if (!reason) return c.json(error("VALIDATION_ERROR", "reason is required"), 400);

  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inserted] = await (db.insert(schema.refundRequests) as any)
    .values({
      userId,
      invoiceId: body?.invoiceId ?? null,
      reason,
      amount: body?.amountCents ? String(Number(body.amountCents) / 100) : null,
      status: "pending",
    })
    .returning();

  return c.json(ok(inserted), 201);
});

billingRoutes.get("/refund-requests", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.userId, userId))
    .orderBy(schema.refundRequests.createdAt);
  return c.json(ok(rows), 200);
});

billingRoutes.get("/refund-requests/:requestId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.id, c.req.param("requestId")))
    .limit(1);
  if (!row || row.userId !== userId) return c.json(error("NOT_FOUND", "Refund request not found"), 404);
  return c.json(ok(row), 200);
});

billingRoutes.post("/cancel-account", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  // Record a refund request as the cancellation marker (no dedicated table yet)
  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inserted] = await (db.insert(schema.refundRequests) as any)
    .values({
      userId,
      reason: `CANCELLATION: ${String(body?.reason ?? "user_requested")}`,
      status: "pending",
    })
    .returning();
  return c.json(ok({ ...inserted, type: "cancellation", requestRefund: Boolean(body?.requestRefund) }), 201);
});

billingRoutes.get("/cancellation-requests", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.userId, userId))
    .orderBy(schema.refundRequests.createdAt);
  const cancellations = rows.filter((r) => r.reason.startsWith("CANCELLATION:"));
  return c.json(ok(cancellations), 200);
});

billingRoutes.get("/refund-policy", (c) =>
  c.json(
    ok({
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
    ok({
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

billingRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Billing route not found" } }, 404),
);
