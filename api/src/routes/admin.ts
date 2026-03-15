import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const adminRoutes = new Hono<{ Variables: Variables }>();

const nowIso = new Date().toISOString();

function ok<T>(data: T) {
	return { success: true as const, data, timestamp: new Date().toISOString() };
}

const productDashboardStub = {
	userMetrics: {
		totalUsers: 0,
		activeUsers: 0,
		newUsersLast30Days: 0,
		usersByRole: {},
		usersByStatus: {},
	},
	jobMetrics: {
		totalJobs: 0,
		activeJobs: 0,
		newJobsLast30Days: 0,
		jobsByStatus: {},
		jobsByOrigin: {},
	},
	profileMetrics: {
		totalProfiles: 0,
		publicProfiles: 0,
		newProfilesLast30Days: 0,
		profilesByStatus: {},
		profilesByPrivacy: {},
	},
	companyMetrics: {
		totalCompanies: 0,
		activeCompanies: 0,
		newCompaniesLast30Days: 0,
		companiesByStatus: {},
		companiesBySize: {},
	},
	resumeMetrics: {
		totalResumes: 0,
		publicResumes: 0,
		newResumesLast30Days: 0,
		resumesByType: {},
		resumesByStatus: {},
	},
	saasMetrics: {
		monthlyRecurringRevenue: 0,
		annualRecurringRevenue: 0,
		averageRevenuePerUser: 0,
		customerLifetimeValue: 0,
		customerAcquisitionCost: 0,
		churnRate: 0,
		growthRate: 0,
		conversionRate: 0,
		totalSubscriptions: 0,
		activeSubscriptions: 0,
		subscriptionsByTier: {},
		revenueByTier: {},
	},
	userGrowthLast90Days: [],
	jobGrowthLast90Days: [],
	profileGrowthLast90Days: [],
	companyGrowthLast90Days: [],
	resumeGrowthLast90Days: [],
};

const refundReasons = {
	reasons: [
		{ value: "accidental_purchase", label: "Accidental purchase" },
		{ value: "technical_issue", label: "Technical issue" },
		{ value: "billing_error", label: "Billing error" },
		{ value: "other", label: "Other" },
	],
};

adminRoutes.get("/productdashboard/affiliate-stats", (c) =>
	c.json(
		ok({
			totalAffiliates: 0,
			activeAffiliates: 0,
			newAffiliatesThisMonth: 0,
			totalCommissionsPaidCents: 0,
			pendingPayoutsCents: 0,
			totalReferrals: 0,
			totalConversions: 0,
			conversionRate: 0,
			pendingPayouts: 0,
			completedPayouts: 0,
			topPerformers: [],
			recentPayouts: [],
		}),
		200,
	),
);

// Alias for when this router is mounted at /api/productdashboard
adminRoutes.get("/affiliate-stats", (c) =>
	c.json(
		ok({
			totalAffiliates: 0,
			activeAffiliates: 0,
			newAffiliatesThisMonth: 0,
			totalCommissionsPaidCents: 0,
			pendingPayoutsCents: 0,
			totalReferrals: 0,
			totalConversions: 0,
			conversionRate: 0,
			pendingPayouts: 0,
			completedPayouts: 0,
			topPerformers: [],
			recentPayouts: [],
		}),
		200,
	),
);

adminRoutes.get("/", (c) => c.json(ok(productDashboardStub), 200));

adminRoutes.get("/export/:format", (c) => {
	const format = c.req.param("format");
	const csv = "metric,value\ntotalUsers,0\nactiveUsers,0\n";
	const filename = `product-dashboard-${nowIso.slice(0, 10)}.${format === "csv" ? "csv" : "txt"}`;
	return new Response(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename=\"${filename}\"`,
		},
	});
});

adminRoutes.get("/refund-requests", (c) => c.json(ok([]), 200));
adminRoutes.post("/refund-requests/:requestId/approve", (c) =>
	c.json(
		ok({
			id: c.req.param("requestId"),
			userId: "",
			amountCents: 0,
			reason: "",
			status: "approved",
			requestedAt: nowIso,
			processedAt: nowIso,
		}),
		200,
	),
);
adminRoutes.post("/refund-requests/:requestId/reject", (c) =>
	c.json(
		ok({
			id: c.req.param("requestId"),
			userId: "",
			amountCents: 0,
			reason: "",
			status: "rejected",
			requestedAt: nowIso,
			processedAt: nowIso,
		}),
		200,
	),
);
adminRoutes.get("/refund-stats", (c) =>
	c.json(
		ok({
			totalRequests: 0,
			pendingRequests: 0,
			approvedRequests: 0,
			rejectedRequests: 0,
			totalRefundedAmount: 0,
			averageProcessingTime: 0,
		}),
		200,
	),
);

adminRoutes.get("/cancellation-requests", (c) => c.json(ok([]), 200));
adminRoutes.post("/cancellation-requests/:requestId/approve", (c) =>
	c.json(
		ok({
			id: c.req.param("requestId"),
			userId: "",
			reason: "",
			requestRefund: false,
			status: "approved",
			requestedAt: nowIso,
			processedAt: nowIso,
		}),
		200,
	),
);
adminRoutes.post("/cancellation-requests/:requestId/reject", (c) =>
	c.json(
		ok({
			id: c.req.param("requestId"),
			userId: "",
			reason: "",
			requestRefund: false,
			status: "rejected",
			requestedAt: nowIso,
			processedAt: nowIso,
		}),
		200,
	),
);
adminRoutes.get("/cancellation-stats", (c) =>
	c.json(
		ok({
			totalRequests: 0,
			pendingRequests: 0,
			approvedRequests: 0,
			rejectedRequests: 0,
			averageProcessingTime: 0,
		}),
		200,
	),
);

adminRoutes.get("/refund-reasons", (c) => c.json(ok(refundReasons), 200));

adminRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "Admin routes coming soon" } }, 501),
);
