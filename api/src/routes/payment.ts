import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { error } from "../types/index.js";
import * as billingService from "../services/billing.js";

export const paymentRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

paymentRoutes.post("/create-setup-session", async (c) => {
  const body = await c.req.json().catch(() => null) as { successUrl?: string; cancelUrl?: string } | null;
  const url = await billingService.createSetupSession(body?.successUrl ?? "", body?.cancelUrl ?? "");
  // Frontend expects PascalCase key: { Url: string }
  return c.json(ok({ Url: url }), 200);
});

paymentRoutes.delete("/payment-methods/:id", async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json(error("VALIDATION_ERROR", "Missing payment method id"), 400);

  const message = await billingService.deletePaymentMethod(id);
  // requestRaw caller expects top-level { message: string }
  return c.json({ message }, 200);
});

paymentRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Payment routes coming soon" } }, 501),
);
