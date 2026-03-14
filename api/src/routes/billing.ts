import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import * as billingService from "../services/billing.js";

export const billingRoutes = new Hono<{ Variables: Variables }>();

const nowIso = () => new Date().toISOString();

function ok<T>(data: T) {
	return { success: true as const, data, timestamp: nowIso() };
}

billingRoutes.get("/subscription", async (c) =>
	c.json(ok(await billingService.getSubscription()), 200),
);

billingRoutes.get("/payment-methods", async (c) =>
	c.json(ok(await billingService.getPaymentMethods()), 200),
);

billingRoutes.get("/invoices", async (c) =>
	c.json(ok(await billingService.getInvoices()), 200),
);

billingRoutes.get("/ai-usage/month", async (c) =>
	c.json(ok(await billingService.getMonthlyAIUsage()), 200),
);

billingRoutes.post("/refund-request", async (c) => {
	const user = c.var.user;
	const body = await c.req.json().catch(() => ({}));
	return c.json(
		ok({
			id: crypto.randomUUID(),
			userId: user.sub,
			subscriptionId: body?.subscriptionId,
			stripeChargeId: body?.stripeChargeId,
			amountCents: Number(body?.amountCents ?? 0),
			reason: String(body?.reason ?? ""),
			description: body?.description ? String(body.description) : undefined,
			status: "pending",
			requestedAt: nowIso(),
		}),
		201,
	);
});

billingRoutes.get("/refund-requests", (c) => c.json(ok([]), 200));
billingRoutes.get("/refund-requests/:requestId", (c) =>
	c.json(
		ok({
			id: c.req.param("requestId"),
			userId: "",
			amountCents: 0,
			reason: "",
			status: "pending",
			requestedAt: nowIso(),
		}),
		200,
	),
);

billingRoutes.post("/cancel-account", async (c) => {
	const user = c.var.user;
	const body = await c.req.json().catch(() => ({}));
	return c.json(
		ok({
			id: crypto.randomUUID(),
			userId: user.sub,
			reason: String(body?.reason ?? ""),
			feedback: body?.feedback ? String(body.feedback) : undefined,
			requestRefund: Boolean(body?.requestRefund),
			status: "pending",
			requestedAt: nowIso(),
		}),
		201,
	);
});

billingRoutes.get("/cancellation-requests", (c) => c.json(ok([]), 200));

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
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "Billing routes coming soon" } }, 501),
);
