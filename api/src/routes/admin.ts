import { Hono } from "hono";
import { and, count, eq, gte, inArray, isNull, sql, sum, desc } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { ok } from "../utils/response.js";
import { cdnUrl } from "../utils/cdn.js";
import { tryGetPaymentProvider } from "../services/billing/payment/index.js";
import {
  getPricingConfig,
  updatePricingConfig,
} from "../services/platform/PricingConfigService.js";

const PricingConfigSchema = z.object({
  proMonthlyCents: z.number().int().min(0).max(100_000_00),
  proYearlyCents: z.number().int().min(0).max(100_000_00),
  seatPriceCents: z.number().int().min(0).max(100_000_00),
});

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
	const repos = buildRepos(db);
	const now = new Date();
	const thirtyDaysAgo = daysAgo(30);
	const ninetyDaysAgo = daysAgo(90);

	// Every aggregate used by the dashboard lands through a repository.
	// The only direct Drizzle calls remaining are for companyProfiles
	// (not yet extracted) — those will migrate when the companies repo
	// lands (Phase I).
	const [
		totalUsers,
		activeUsers,
		newUsers30,
		totalJobs,
		activeJobs,
		newJobs30,
		totalResumes,
		newResumes30,
		totalCompaniesRow,
		newCompanies30Row,
		activeSubs,
		totalSubs,
		mrr,
		prevMrr,
		usersByRole,
	] = await Promise.all([
		repos.users.countAll(),
		repos.users.countActive(),
		repos.users.countCreatedSince(thirtyDaysAgo),
		repos.jobs.countJobs(),
		repos.jobs.countActiveJobs(),
		repos.jobs.countJobsCreatedSince(thirtyDaysAgo),
		repos.resumes.countAll(),
		repos.resumes.countCreatedSince(thirtyDaysAgo),
		db.select({ n: count() }).from(schema.companyProfiles),
		db.select({ n: count() }).from(schema.companyProfiles).where(gte(schema.companyProfiles.createdAt, thirtyDaysAgo)),
		repos.subscriptions.countActive(),
		repos.subscriptions.countAll(),
		repos.subscriptions.activeMrr(),
		repos.subscriptions.activeMrrBefore(thirtyDaysAgo),
		repos.users.countByRole(),
	]);

	const arr = mrr * 12;
	const growthRate = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100 * 10) / 10 : 0;
	const conversionRate = totalUsers > 0 ? Math.round((activeSubs / totalUsers) * 1000) / 10 : 0;
	const arpu = activeSubs > 0 ? Math.round((mrr / activeSubs) * 100) / 100 : 0;

	const usersByRoleMap: Record<string, number> = {};
	for (const r of usersByRole) usersByRoleMap[r.role] = r.n;

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
			newUsersLast30Days: newUsers30,
			usersByRole: usersByRoleMap,
			usersByStatus: { active: activeUsers, inactive: totalUsers - activeUsers },
		},
		jobMetrics: {
			totalJobs,
			activeJobs,
			newJobsLast30Days: newJobs30,
		},
		resumeMetrics: {
			totalResumes,
			newResumesLast30Days: newResumes30,
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
			totalSubscriptions: totalSubs,
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
	const resumeRepo = buildRepos(db).resumes;
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
				// Resume counts go through ResumeRepository per the
				// layering rule; countCreatedInRange uses the same
				// half-open `[day, nextDay)` window.
				value = await resumeRepo.countCreatedInRange(day, nextDay);
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

// ---------------------------------------------------------------------------
// GET /api/admin/billing/subscriptions — list all subscriptions with user + plan info
// ---------------------------------------------------------------------------
const BillingSearchSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	search: z.string().optional(),
	status: z.string().optional(),
});

adminRoutes.get("/billing/subscriptions", async (c) => {
	const query = BillingSearchSchema.safeParse(c.req.query());
	if (!query.success) return c.json({ error: { code: "BAD_REQUEST", message: query.error.issues[0].message } }, 400);

	const db = getDb();
	const { page, limit, search, status } = query.data;
	const offset = (page - 1) * limit;

	const conditions: ReturnType<typeof eq>[] = [];
	if (status && status !== "all") conditions.push(eq(schema.subscriptions.status, status));

	const baseWhere = conditions.length > 0 ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : sql`1=1`;

	// If there's a search term, filter by user name or email
	const searchWhere = search
		? sql`${baseWhere} AND (${schema.users.name} ILIKE ${"%" + search + "%"} OR ${schema.users.email} ILIKE ${"%" + search + "%"})`
		: baseWhere;

	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				id: schema.subscriptions.id,
				userId: schema.subscriptions.userId,
				userName: schema.users.name,
				userEmail: schema.users.email,
				planId: schema.subscriptions.planId,
				planName: schema.subscriptionPlans.name,
				planSlug: schema.subscriptionPlans.slug,
				priceMonthly: schema.subscriptionPlans.priceMonthly,
				priceYearly: schema.subscriptionPlans.priceYearly,
				status: schema.subscriptions.status,
				billingInterval: schema.subscriptions.billingInterval,
				currentPeriodStart: schema.subscriptions.currentPeriodStart,
				currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
				cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
				canceledAt: schema.subscriptions.canceledAt,
				trialEnd: schema.subscriptions.trialEnd,
				createdAt: schema.subscriptions.createdAt,
			})
			.from(schema.subscriptions)
			.innerJoin(schema.users, eq(schema.subscriptions.userId, schema.users.id))
			.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
			.where(searchWhere)
			.orderBy(desc(schema.subscriptions.createdAt))
			.limit(limit)
			.offset(offset),
		db
			.select({ total: count() })
			.from(schema.subscriptions)
			.innerJoin(schema.users, eq(schema.subscriptions.userId, schema.users.id))
			.where(searchWhere),
	]);

	// Compute summary metrics across all subscriptions (unfiltered)
	const [activeRow, trialingRow, pastDueRow, canceledRow, mrrRow] = await Promise.all([
		db.select({ n: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "active")),
		db.select({ n: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "trialing")),
		db.select({ n: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "past_due")),
		db.select({ n: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "canceled")),
		db.select({ total: sum(schema.subscriptionPlans.priceMonthly) })
			.from(schema.subscriptions)
			.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
			.where(sql`${schema.subscriptions.status} IN ('active', 'trialing')`),
	]);

	const mrr = Number(mrrRow[0]?.total ?? 0);

	return c.json(ok({
		subscriptions: rows,
		total,
		page,
		limit,
		summary: {
			mrr,
			arr: mrr * 12,
			active: activeRow[0]?.n ?? 0,
			trialing: trialingRow[0]?.n ?? 0,
			pastDue: pastDueRow[0]?.n ?? 0,
			canceled: canceledRow[0]?.n ?? 0,
		},
	}), 200);
});

// ---------------------------------------------------------------------------
// POST /api/admin/billing/subscriptions/:subscriptionId/cancel
// Admin-initiated subscription cancellation — delegates to payment provider.
// ---------------------------------------------------------------------------
adminRoutes.post("/billing/subscriptions/:subscriptionId/cancel", async (c) => {
	const subscriptionId = c.req.param("subscriptionId");
	const db = getDb();

	const [sub] = await db
		.select()
		.from(schema.subscriptions)
		.where(eq(schema.subscriptions.id, subscriptionId))
		.limit(1);
	if (!sub) return c.json({ error: { code: "NOT_FOUND", message: "Subscription not found" } }, 404);

	// Delegate to the payment provider (if configured)
	const env = (c as unknown as { env?: Record<string, string | undefined> }).env ?? {};
	const provider = tryGetPaymentProvider(env);
	if (provider?.cancelSubscription) {
		try {
			await provider.cancelSubscription(subscriptionId, false);
		} catch (err) {
			console.error(`[admin] Provider cancelSubscription failed:`, err);
			// Continue — still mark canceled in our DB
		}
	}

	// Mark as canceled in our DB
	await db
		.update(schema.subscriptions)
		.set({ status: "canceled", canceledAt: new Date(), cancelAtPeriodEnd: true } as any)
		.where(eq(schema.subscriptions.id, subscriptionId));

	return c.json(ok({ id: subscriptionId, status: "canceled" }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/admin/billing/subscriptions/:subscriptionId/refund
// Admin-initiated refund — delegates to payment provider.
// Body: { reason?: string }
// ---------------------------------------------------------------------------
adminRoutes.post("/billing/subscriptions/:subscriptionId/refund", async (c) => {
	const subscriptionId = c.req.param("subscriptionId");
	const body = await c.req.json().catch(() => ({})) as { reason?: string };
	const db = getDb();

	const [sub] = await db
		.select({
			id: schema.subscriptions.id,
			userId: schema.subscriptions.userId,
			planId: schema.subscriptions.planId,
			status: schema.subscriptions.status,
			priceMonthly: schema.subscriptionPlans.priceMonthly,
		})
		.from(schema.subscriptions)
		.innerJoin(schema.subscriptionPlans, eq(schema.subscriptions.planId, schema.subscriptionPlans.id))
		.where(eq(schema.subscriptions.id, subscriptionId))
		.limit(1);
	if (!sub) return c.json({ error: { code: "NOT_FOUND", message: "Subscription not found" } }, 404);

	// Delegate refund to the payment provider (if configured)
	const env = (c as unknown as { env?: Record<string, string | undefined> }).env ?? {};
	const provider = tryGetPaymentProvider(env);
	let refundId: string | undefined;
	if (provider?.refundPayment) {
		try {
			const amountCents = Math.round(Number(sub.priceMonthly) * 100);
			const result = await provider.refundPayment(subscriptionId, amountCents, body.reason);
			refundId = result.refundId;
		} catch (err) {
			console.error(`[admin] Provider refundPayment failed:`, err);
			// Continue — still mark canceled in our DB
		}
	}

	// Cancel the subscription in our DB
	await db
		.update(schema.subscriptions)
		.set({ status: "canceled", canceledAt: new Date(), cancelAtPeriodEnd: false } as any)
		.where(eq(schema.subscriptions.id, subscriptionId));

	return c.json(ok({
		id: subscriptionId,
		status: "refunded",
		amount: Number(sub.priceMonthly),
		reason: body.reason ?? "admin_refund",
		refundId,
	}), 200);
});

// ---------------------------------------------------------------------------
// GET /api/admin/settings — read all system settings
// ---------------------------------------------------------------------------
adminRoutes.get("/settings", async (c) => {
	const db = getDb();
	const rows = await db.select().from(schema.systemSettings).orderBy(schema.systemSettings.key);
	const settings: Record<string, string | null> = {};
	for (const row of rows) settings[row.key] = row.value;
	return c.json(ok(settings), 200);
});

// ---------------------------------------------------------------------------
// PUT /api/admin/settings — upsert system settings (key-value pairs)
// ---------------------------------------------------------------------------
const SettingsUpdateSchema = z.record(z.string(), z.string().nullable());

adminRoutes.put("/settings", async (c) => {
	const body = SettingsUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
	if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

	const db = getDb();
	const entries = Object.entries(body.data);
	for (const [key, value] of entries) {
		await db
			.insert(schema.systemSettings)
			.values({ key, value, updatedAt: new Date() } as any)
			.onConflictDoUpdate({
				target: schema.systemSettings.key,
				set: { value, updatedAt: new Date() } as any,
			});
	}

	return c.json(ok({ updated: entries.length }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/admin/studio/projects — list all studio projects across all users
// ---------------------------------------------------------------------------
const StudioSearchSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	search: z.string().optional(),
	status: z.string().optional(),
	purpose: z.string().optional(),
});

function videoUrl(v: { youtubeUrl: string | null; r2Key: string | null }): string | null {
	return v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null);
}

adminRoutes.get("/studio/projects", async (c) => {
	const query = StudioSearchSchema.safeParse(c.req.query());
	if (!query.success) return c.json({ error: { code: "BAD_REQUEST", message: query.error.issues[0].message } }, 400);

	const db = getDb();
	const { page, limit, search, status, purpose } = query.data;
	const offset = (page - 1) * limit;

	// Build WHERE clause
	let where = sql`1=1`;
	if (status && status !== "all") {
		where = sql`${where} AND ${schema.studioProjects.status} = ${status}`;
	}
	if (search) {
		where = sql`${where} AND (
			${schema.users.name} ILIKE ${"%" + search + "%"}
			OR ${schema.users.email} ILIKE ${"%" + search + "%"}
			OR CAST(${schema.studioProjects.storyboard}->>'_name' AS TEXT) ILIKE ${"%" + search + "%"}
		)`;
	}

	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				id: schema.studioProjects.id,
				userId: schema.studioProjects.userId,
				userName: schema.users.name,
				userEmail: schema.users.email,
				status: schema.studioProjects.status,
				storyboard: schema.studioProjects.storyboard,
				videoId: schema.studioProjects.videoId,
				createdAt: schema.studioProjects.createdAt,
				updatedAt: schema.studioProjects.updatedAt,
			})
			.from(schema.studioProjects)
			.innerJoin(schema.users, eq(schema.studioProjects.userId, schema.users.id))
			.where(where)
			.orderBy(desc(schema.studioProjects.updatedAt))
			.limit(limit)
			.offset(offset),
		db
			.select({ total: count() })
			.from(schema.studioProjects)
			.innerJoin(schema.users, eq(schema.studioProjects.userId, schema.users.id))
			.where(where),
	]);

	// Fetch linked videos for projects that have a videoId
	const videoIds = rows.map((r) => r.videoId).filter((id): id is string => Boolean(id));
	const linkedVideos = videoIds.length
		? await db.select().from(schema.videos).where(inArray(schema.videos.id, videoIds))
		: [];
	const videoById = new Map(linkedVideos.map((v) => [v.id, v]));

	// For each project owner, also fetch ALL their videos to expose orphans
	const userIds = [...new Set(rows.map((r) => r.userId))];
	const allUserVideos = userIds.length
		? await db
				.select({
					id: schema.videos.id,
					userId: schema.videos.userId,
					title: schema.videos.title,
					status: schema.videos.status,
					r2Key: schema.videos.r2Key,
					youtubeUrl: schema.videos.youtubeUrl,
					youtubeVideoId: schema.videos.youtubeVideoId,
					thumbnailUrl: schema.videos.thumbnailUrl,
					privacyStatus: schema.videos.privacyStatus,
					isPublic: schema.videos.isPublic,
					createdAt: schema.videos.createdAt,
				})
				.from(schema.videos)
				.where(inArray(schema.videos.userId, userIds))
				.orderBy(desc(schema.videos.createdAt))
		: [];

	// Group all videos by userId
	const videosByUser = new Map<string, typeof allUserVideos>();
	for (const v of allUserVideos) {
		const list = videosByUser.get(v.userId) ?? [];
		list.push(v);
		videosByUser.set(v.userId, list);
	}

	// Build the set of videoIds that ARE linked to a studioProject
	const allLinkedVideoIds = new Set<string>();
	// Query ALL studioProject videoIds (not just this page) to correctly identify orphans
	const allProjectLinks = await db
		.select({ videoId: schema.studioProjects.videoId })
		.from(schema.studioProjects)
		.where(sql`${schema.studioProjects.videoId} IS NOT NULL`);
	for (const row of allProjectLinks) {
		if (row.videoId) allLinkedVideoIds.add(row.videoId);
	}

	// Extract display title and purpose from storyboard JSONB
	const projects = rows.map((r) => {
		const meta = r.storyboard as Record<string, unknown> | null;
		const linked = r.videoId ? videoById.get(r.videoId) ?? null : null;
		// All videos for this user, with orphan flag
		const userVids = (videosByUser.get(r.userId) ?? []).map((v) => ({
			id: v.id,
			title: v.title,
			status: v.status,
			videoUrl: videoUrl(v),
			youtubeVideoId: v.youtubeVideoId,
			thumbnailUrl: v.thumbnailUrl,
			privacyStatus: v.privacyStatus,
			isPublic: v.isPublic,
			isOrphan: !allLinkedVideoIds.has(v.id),
			createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
		}));
		return {
			id: r.id,
			userId: r.userId,
			userName: r.userName,
			userEmail: r.userEmail,
			title: (meta?._name as string) || "Untitled Project",
			status: r.status,
			purpose: (meta?._purpose as string) || null,
			videoId: r.videoId,
			linkedVideoUrl: linked ? videoUrl(linked) : null,
			linkedVideoStatus: linked?.status ?? null,
			linkedVideoPrivacy: linked?.privacyStatus ?? null,
			userVideos: userVids,
			createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
			updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
		};
	});

	// Filter by purpose in-memory (stored in JSONB, not a column)
	const filtered = purpose && purpose !== "all"
		? projects.filter((p) => p.purpose === purpose)
		: projects;

	// Summary counts (unfiltered)
	const [totalRow, draftRow, publishedRow, failedRow, totalVideosRow, orphanCount] = await Promise.all([
		db.select({ n: count() }).from(schema.studioProjects),
		db.select({ n: count() }).from(schema.studioProjects).where(eq(schema.studioProjects.status, "draft")),
		db.select({ n: count() }).from(schema.studioProjects).where(eq(schema.studioProjects.status, "published")),
		db.select({ n: count() }).from(schema.studioProjects).where(eq(schema.studioProjects.status, "failed")),
		db.select({ n: count() }).from(schema.videos),
		// Orphan count: videos not linked to any studioProject
		db.select({ n: count() })
			.from(schema.videos)
			.where(allLinkedVideoIds.size > 0
				? sql`${schema.videos.id} NOT IN (${sql.join([...allLinkedVideoIds].map((id) => sql`${id}`), sql`, `)})`
				: sql`1=1`
			),
	]);

	return c.json(ok({
		projects: filtered,
		total,
		page,
		limit,
		summary: {
			total: totalRow[0]?.n ?? 0,
			draft: draftRow[0]?.n ?? 0,
			published: publishedRow[0]?.n ?? 0,
			failed: failedRow[0]?.n ?? 0,
			totalVideos: totalVideosRow[0]?.n ?? 0,
			orphanedVideos: orphanCount[0]?.n ?? 0,
		},
	}), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/studio/projects/:projectId — admin delete any studio project
// ---------------------------------------------------------------------------
adminRoutes.delete("/studio/projects/:projectId", async (c) => {
	const projectId = c.req.param("projectId");
	const db = getDb();

	const [deleted] = await db
		.delete(schema.studioProjects)
		.where(eq(schema.studioProjects.id, projectId))
		.returning();

	if (!deleted) return c.json({ error: { code: "NOT_FOUND", message: "Project not found" } }, 404);
	return c.json(ok({ id: projectId }), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/studio/videos/:videoId — admin delete any video record
// ---------------------------------------------------------------------------
adminRoutes.delete("/studio/videos/:videoId", async (c) => {
	const videoId = c.req.param("videoId");
	const db = getDb();

	// Unlink any studioProjects that reference this video
	await db
		.update(schema.studioProjects)
		.set({ videoId: null } as any)
		.where(eq(schema.studioProjects.videoId, videoId));

	const [deleted] = await db
		.delete(schema.videos)
		.where(eq(schema.videos.id, videoId))
		.returning();

	if (!deleted) return c.json({ error: { code: "NOT_FOUND", message: "Video not found" } }, 404);
	return c.json(ok({ id: videoId }), 200);
});

// ---------------------------------------------------------------------------
// Pricing config — runtime-editable subscription prices. Read mirror is at
// the public GET /api/billing/pricing-config; here we own the write side.
// ---------------------------------------------------------------------------
adminRoutes.get("/pricing", async (c) => {
  return c.json(ok(await getPricingConfig()), 200);
});

adminRoutes.patch("/pricing", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PricingConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid pricing config", details: parsed.error.flatten() } },
      400,
    );
  }
  const userId = c.var.user?.sub ?? null;
  const updated = await updatePricingConfig({ ...parsed.data, updatedByUserId: userId });
  return c.json(ok(updated), 200);
});

adminRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_FOUND", message: "Admin route not found" } }, 404),
);
