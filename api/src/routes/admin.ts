import { Hono } from "hono";
import { count, eq, gte, sql, sum } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { ok } from "../utils/response.js";

export const adminRoutes = new Hono<{ Variables: Variables }>();

// All admin routes require SuperAdmin
adminRoutes.use("*", superAdminMiddleware);

const refundReasons = {
	reasons: [
		{ value: "accidental_purchase", label: "Accidental purchase" },
		{ value: "technical_issue", label: "Technical issue" },
		{ value: "billing_error", label: "Billing error" },
		{ value: "other", label: "Other" },
	],
};

function daysAgo(n: number) {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// GET /api/admin — full product dashboard with real metrics
// ---------------------------------------------------------------------------
adminRoutes.get("/", async (c) => {
	const db = getDb();
	const now = new Date();
	const thirtyDaysAgo = daysAgo(30);
	const ninetyDaysAgo = daysAgo(90);

	const [
		totalUsersRow,
		activeUsersRow,
		newUsers30Row,
		totalJobsRow,
		activeJobsRow,
		newJobs30Row,
		totalResumesRow,
		newResumes30Row,
		totalCompaniesRow,
		newCompanies30Row,
		activeSubsRow,
		totalSubsRow,
		mrrRow,
		prevMrrRow,
		usersByRoleRows,
	] = await Promise.all([
		db.select({ n: count() }).from(schema.users),
		db.select({ n: count() }).from(schema.users).where(eq(schema.users.isActive, true)),
		db.select({ n: count() }).from(schema.users).where(gte(schema.users.createdAt, thirtyDaysAgo)),
		db.select({ n: count() }).from(schema.jobItems),
		db.select({ n: count() }).from(schema.jobItems).where(eq(schema.jobItems.status, "active")),
		db.select({ n: count() }).from(schema.jobItems).where(gte(schema.jobItems.createdAt, thirtyDaysAgo)),
		db.select({ n: count() }).from(schema.resumeInformation),
		db.select({ n: count() }).from(schema.resumeInformation).where(gte(schema.resumeInformation.createdAt, thirtyDaysAgo)),
		db.select({ n: count() }).from(schema.companyProfiles),
		db.select({ n: count() }).from(schema.companyProfiles).where(gte(schema.companyProfiles.createdAt, thirtyDaysAgo)),
		db.select({ n: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "active")),
		db.select({ n: count() }).from(schema.subscriptions),
		db.select({ total: sum(schema.subscriptionPlans.priceMonthly) })
			.from(schema.subscriptions)
			.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
			.where(eq(schema.subscriptions.status, "active")),
		db.select({ total: sum(schema.subscriptionPlans.priceMonthly) })
			.from(schema.subscriptions)
			.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
			.where(sql`${schema.subscriptions.status} = 'active' AND ${schema.subscriptions.createdAt} < ${thirtyDaysAgo}`),
		db.select({ role: schema.users.role, n: count() }).from(schema.users).groupBy(schema.users.role),
	]);

	const totalUsers = totalUsersRow[0]?.n ?? 0;
	const activeUsers = activeUsersRow[0]?.n ?? 0;
	const mrr = Number(mrrRow[0]?.total ?? 0);
	const prevMrr = Number(prevMrrRow[0]?.total ?? 0);
	const arr = mrr * 12;
	const growthRate = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100 * 10) / 10 : 0;
	const activeSubs = activeSubsRow[0]?.n ?? 0;
	const conversionRate = totalUsers > 0 ? Math.round((activeSubs / totalUsers) * 1000) / 10 : 0;
	const arpu = activeSubs > 0 ? Math.round((mrr / activeSubs) * 100) / 100 : 0;

	const usersByRole: Record<string, number> = {};
	for (const r of usersByRoleRows) usersByRole[r.role] = r.n;

	// 90-day growth series (weekly buckets)
	const growthSeries: Array<{ date: string; count: number }> = [];
	for (let w = 12; w >= 0; w--) {
		const from = new Date(now.getTime() - (w + 1) * 7 * 24 * 60 * 60 * 1000);
		const to = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
		const [row] = await db.select({ n: count() }).from(schema.users)
			.where(sql`${schema.users.createdAt} >= ${from} AND ${schema.users.createdAt} < ${to}`);
		growthSeries.push({ date: to.toISOString().slice(0, 10), count: row?.n ?? 0 });
	}

	return c.json(ok({
		userMetrics: {
			totalUsers,
			activeUsers,
			newUsersLast30Days: newUsers30Row[0]?.n ?? 0,
			usersByRole,
			usersByStatus: { active: activeUsers, inactive: totalUsers - activeUsers },
		},
		jobMetrics: {
			totalJobs: totalJobsRow[0]?.n ?? 0,
			activeJobs: activeJobsRow[0]?.n ?? 0,
			newJobsLast30Days: newJobs30Row[0]?.n ?? 0,
		},
		resumeMetrics: {
			totalResumes: totalResumesRow[0]?.n ?? 0,
			newResumesLast30Days: newResumes30Row[0]?.n ?? 0,
		},
		companyMetrics: {
			totalCompanies: totalCompaniesRow[0]?.n ?? 0,
			newCompaniesLast30Days: newCompanies30Row[0]?.n ?? 0,
		},
		saasMetrics: {
			monthlyRecurringRevenue: mrr,
			annualRecurringRevenue: arr,
			averageRevenuePerUser: arpu,
			growthRate,
			conversionRate,
			totalSubscriptions: totalSubsRow[0]?.n ?? 0,
			activeSubscriptions: activeSubs,
			churnRate: 0, // requires historical cancellation data
			customerLifetimeValue: arpu > 0 ? Math.round(arpu / Math.max(0.01, 0.05) * 100) / 100 : 0, // CLV = ARPU / churn_rate (estimated 5%)
		},
		userGrowthLast90Days: growthSeries,
	}), 200);
});

// ---------------------------------------------------------------------------
// GET /api/admin/saas-metrics — standalone SaaS metrics endpoint
// ---------------------------------------------------------------------------
adminRoutes.get("/saas-metrics", async (c) => {
	const db = getDb();
	const thirtyDaysAgo = daysAgo(30);
	const sixtyDaysAgo = daysAgo(60);

	const [mrrRow, prevMrrRow, activeSubsRow, totalUsersRow] = await Promise.all([
		db.select({ total: sum(schema.subscriptionPlans.priceMonthly) })
			.from(schema.subscriptions)
			.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
			.where(eq(schema.subscriptions.status, "active")),
		db.select({ total: sum(schema.subscriptionPlans.priceMonthly) })
			.from(schema.subscriptions)
			.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
			.where(sql`${schema.subscriptions.status} = 'active' AND ${schema.subscriptions.createdAt} < ${thirtyDaysAgo}`),
		db.select({ n: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "active")),
		db.select({ n: count() }).from(schema.users),
	]);

	const mrr = Number(mrrRow[0]?.total ?? 0);
	const prevMrr = Number(prevMrrRow[0]?.total ?? 0);
	const activeSubs = activeSubsRow[0]?.n ?? 0;
	const totalUsers = totalUsersRow[0]?.n ?? 0;

	// Monthly time-series (last 6 months)
	const timeSeries: Array<{ month: string; mrr: number; subscribers: number }> = [];
	for (let m = 5; m >= 0; m--) {
		const d = new Date();
		d.setMonth(d.getMonth() - m, 1);
		d.setHours(0, 0, 0, 0);
		const monthLabel = d.toISOString().slice(0, 7);
		const [mrrM] = await db.select({ total: sum(schema.subscriptionPlans.priceMonthly) })
			.from(schema.subscriptions)
			.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
			.where(sql`${schema.subscriptions.status} = 'active' AND ${schema.subscriptions.createdAt} <= ${new Date(d.getFullYear(), d.getMonth() + 1, 0)}`);
		const [subsM] = await db.select({ n: count() })
			.from(schema.subscriptions)
			.where(sql`${schema.subscriptions.status} = 'active' AND ${schema.subscriptions.createdAt} <= ${new Date(d.getFullYear(), d.getMonth() + 1, 0)}`);
		timeSeries.push({ month: monthLabel, mrr: Number(mrrM?.total ?? 0), subscribers: subsM?.n ?? 0 });
	}

	return c.json(ok({
		mrr,
		arr: mrr * 12,
		growthRate: prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 1000) / 10 : 0,
		activeSubscriptions: activeSubs,
		conversionRate: totalUsers > 0 ? Math.round((activeSubs / totalUsers) * 1000) / 10 : 0,
		arpu: activeSubs > 0 ? Math.round((mrr / activeSubs) * 100) / 100 : 0,
		timeSeries,
	}), 200);
});

// ---------------------------------------------------------------------------
// GET /api/admin/time-series/:metric
// ---------------------------------------------------------------------------
adminRoutes.get("/time-series/:metric", async (c) => {
	const metric = c.req.param("metric");
	const db = getDb();
	const points: Array<{ date: string; value: number }> = [];

	for (let d = 29; d >= 0; d--) {
		const day = daysAgo(d);
		const nextDay = daysAgo(d - 1);
		let value = 0;
		try {
			if (metric === "users") {
				const [r] = await db.select({ n: count() }).from(schema.users)
					.where(sql`${schema.users.createdAt} >= ${day} AND ${schema.users.createdAt} < ${nextDay}`);
				value = r?.n ?? 0;
			} else if (metric === "jobs") {
				const [r] = await db.select({ n: count() }).from(schema.jobItems)
					.where(sql`${schema.jobItems.createdAt} >= ${day} AND ${schema.jobItems.createdAt} < ${nextDay}`);
				value = r?.n ?? 0;
			} else if (metric === "resumes") {
				const [r] = await db.select({ n: count() }).from(schema.resumeInformation)
					.where(sql`${schema.resumeInformation.createdAt} >= ${day} AND ${schema.resumeInformation.createdAt} < ${nextDay}`);
				value = r?.n ?? 0;
			} else if (metric === "subscriptions") {
				const [r] = await db.select({ n: count() }).from(schema.subscriptions)
					.where(sql`${schema.subscriptions.createdAt} >= ${day} AND ${schema.subscriptions.createdAt} < ${nextDay}`);
				value = r?.n ?? 0;
			}
		} catch { value = 0; }
		points.push({ date: day.toISOString().slice(0, 10), value });
	}

	return c.json(ok({ metric, points }), 200);
});

adminRoutes.get("/productdashboard/affiliate-stats", (c) =>
	c.json(ok({ totalAffiliates: 0, activeAffiliates: 0, newAffiliatesThisMonth: 0, totalCommissionsPaidCents: 0, pendingPayoutsCents: 0, totalReferrals: 0, totalConversions: 0, conversionRate: 0, pendingPayouts: 0, completedPayouts: 0, topPerformers: [], recentPayouts: [] }), 200),
);

adminRoutes.get("/affiliate-stats", (c) =>
	c.json(ok({ totalAffiliates: 0, activeAffiliates: 0, newAffiliatesThisMonth: 0, totalCommissionsPaidCents: 0, pendingPayoutsCents: 0, totalReferrals: 0, totalConversions: 0, conversionRate: 0, pendingPayouts: 0, completedPayouts: 0, topPerformers: [], recentPayouts: [] }), 200),
);

adminRoutes.get("/export/:format", async (c) => {
	const format = c.req.param("format");
	const db = getDb();
	const [usersCount] = await db.select({ n: count() }).from(schema.users);
	const [jobsCount] = await db.select({ n: count() }).from(schema.jobItems);
	const [mrrRow] = await db.select({ total: sum(schema.subscriptionPlans.priceMonthly) })
		.from(schema.subscriptions)
		.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
		.where(eq(schema.subscriptions.status, "active"));

	const csv = `metric,value\ntotalUsers,${usersCount?.n ?? 0}\ntotalJobs,${jobsCount?.n ?? 0}\nmrr,${Number(mrrRow?.total ?? 0)}\narr,${Number(mrrRow?.total ?? 0) * 12}\nexportedAt,${new Date().toISOString()}`;
	const filename = `product-dashboard-${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : "txt"}`;
	return new Response(csv, {
		status: 200,
		headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
	});
});

adminRoutes.get("/refund-requests", (c) => c.json(ok([]), 200));
adminRoutes.post("/refund-requests/:requestId/approve", (c) => {
	const nowIso = new Date().toISOString();
	return c.json(ok({ id: c.req.param("requestId"), userId: "", amountCents: 0, reason: "", status: "approved", requestedAt: nowIso, processedAt: nowIso }), 200);
});
adminRoutes.post("/refund-requests/:requestId/reject", (c) => {
	const nowIso = new Date().toISOString();
	return c.json(ok({ id: c.req.param("requestId"), userId: "", amountCents: 0, reason: "", status: "rejected", requestedAt: nowIso, processedAt: nowIso }), 200);
});
adminRoutes.get("/refund-stats", (c) => c.json(ok({ totalRequests: 0, pendingRequests: 0, approvedRequests: 0, rejectedRequests: 0, totalRefundedAmount: 0, averageProcessingTime: 0 }), 200));
adminRoutes.get("/cancellation-requests", (c) => c.json(ok([]), 200));
adminRoutes.post("/cancellation-requests/:requestId/approve", (c) => {
	const nowIso = new Date().toISOString();
	return c.json(ok({ id: c.req.param("requestId"), userId: "", reason: "", requestRefund: false, status: "approved", requestedAt: nowIso, processedAt: nowIso }), 200);
});
adminRoutes.post("/cancellation-requests/:requestId/reject", (c) => {
	const nowIso = new Date().toISOString();
	return c.json(ok({ id: c.req.param("requestId"), userId: "", reason: "", requestRefund: false, status: "rejected", requestedAt: nowIso, processedAt: nowIso }), 200);
});
adminRoutes.get("/cancellation-stats", (c) => c.json(ok({ totalRequests: 0, pendingRequests: 0, approvedRequests: 0, rejectedRequests: 0, averageProcessingTime: 0 }), 200));
adminRoutes.get("/refund-reasons", (c) => c.json(ok(refundReasons), 200));

adminRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_FOUND", message: "Admin route not found" } }, 404),
);
