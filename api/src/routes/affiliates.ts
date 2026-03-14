import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const affiliateRoutes = new Hono<{ Variables: Variables }>();

const now = () => new Date().toISOString();

function ok<T>(data: T) {
	return { success: true as const, data, timestamp: now() };
}

const profile = {
	id: "stub-affiliate",
	userId: "",
	referralCode: "STUBCODE",
	isActive: true,
	creationDateTime: now(),
	updateDateTime: null,
};

const payoutSummary = {
	payoutId: "stub-payout",
	affiliateUserId: "",
	affiliateUserName: "",
	affiliateEmail: "",
	amountCents: 0,
	status: "pending",
	requestedAt: now(),
	paidAt: null,
	stripeReferenceId: null,
};

affiliateRoutes.get("/profile", (c) => c.json(ok(profile), 200));
affiliateRoutes.get("/dashboard", (c) =>
	c.json(
		ok({
			referrals: [],
			conversions: [],
			payouts: [],
			totals: { pendingCents: 0, paidCents: 0 },
		}),
		200,
	),
);
affiliateRoutes.post("/payout/request", (c) =>
	c.json(ok({ payoutId: "stub-payout", amountCents: 0 }), 200),
);

affiliateRoutes.get("/admin/all", (c) =>
	c.json(
		ok({ affiliates: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 0 }),
		200,
	),
);
affiliateRoutes.get("/admin/:userId/details", (c) =>
	c.json(
		ok({
			userId: c.req.param("userId"),
			email: "",
			firstName: null,
			lastName: null,
			referralCode: "STUBCODE",
			isActive: true,
			isSuspended: false,
			totalReferrals: 0,
			totalConversions: 0,
			totalCommissionCents: 0,
			pendingCommissionCents: 0,
			createdAt: now(),
			recentReferrals: [],
			recentConversions: [],
			recentPayouts: [],
		}),
		200,
	),
);
affiliateRoutes.post("/admin/:userId/activate", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/:userId/deactivate", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/:userId/suspend", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/:userId/unsuspend", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.get("/admin/:userId/referrals", (c) => c.json(ok([]), 200));
affiliateRoutes.get("/admin/:userId/conversions", (c) => c.json(ok([]), 200));
affiliateRoutes.get("/admin/pending-payouts", (c) => c.json(ok([]), 200));
affiliateRoutes.post("/admin/payout/:payoutId/approve", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/payout/:payoutId/reject", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/payout/:payoutId/process", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.get("/admin/payout/:payoutId/status", (c) => c.json(ok(payoutSummary), 200));

affiliateRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "Affiliate routes coming soon" } }, 501),
);
