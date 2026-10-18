/**
 * SuperAdmin billing console — mounted at /api/admin/billing by the admin
 * composite (routes/admin/index.ts), which applies the SA guard.
 *
 * User refund / cancellation requests live on /api/billing (billing.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { AdminBillingService } from "../../services/admin/AdminBillingService.js";
import { success, error } from "../../types/index.js";

export const adminBillingOpsRoutes = new Hono<AppEnv>();

const BillingSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  status: z.string().optional(),
});

function envOf(c: unknown): Record<string, string | undefined> {
  return (c as { env?: Record<string, string | undefined> }).env ?? {};
}

const notFound = { error: { code: "NOT_FOUND", message: "Subscription not found" } };

adminBillingOpsRoutes.get("/subscriptions", async (c) => {
  const query = BillingSearchSchema.safeParse(c.req.query());
  if (!query.success) return c.json(error("BAD_REQUEST", query.error.issues[0].message), 400);
  return c.json(success(await AdminBillingService.create().listSubscriptions(query.data)), 200);
});

adminBillingOpsRoutes.post("/subscriptions/:subscriptionId/cancel", async (c) => {
  const result = await AdminBillingService.create().cancel(envOf(c), c.req.param("subscriptionId"));
  if (!result) return c.json(notFound, 404);
  return c.json(success(result), 200);
});

adminBillingOpsRoutes.post("/subscriptions/:subscriptionId/refund", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const result = await AdminBillingService.create().refund(envOf(c), c.req.param("subscriptionId"), body.reason);
  if (!result) return c.json(notFound, 404);
  return c.json(success(result), 200);
});
