import { Hono } from "hono";
import { eq, and, desc, count, sum, sql, inArray } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const recruiterRoutes = new Hono<{ Variables: Variables }>();

const responseEnvelope = <T>(data: T) => ({
	success: true,
	data,
	errorMessage: null,
	errorCode: null,
});

type TalentPoolRow = typeof schema.talentPoolCandidates.$inferSelect;
type InteractionRow = typeof schema.candidateInteractions.$inferSelect;
type PlacementRow = typeof schema.placements.$inferSelect;
type SubmissionRow = typeof schema.candidateSubmissions.$inferSelect;

function rowToTalentPoolEntry(row: TalentPoolRow) {
	return {
		id: row.id,
		recruiterUserId: row.recruiterId ?? "",
		candidateUserId: row.candidateId,
		candidateName: row.candidateName,
		candidateEmail: row.candidateEmail ?? undefined,
		candidateTitle: row.candidateTitle ?? undefined,
		candidateProfilePicture: row.candidateProfilePicture ?? undefined,
		relationshipStrength: row.relationshipStrength,
		tags: (row.tags as string[]) ?? [],
		poolName: row.poolName ?? undefined,
		status: row.status,
		notes: row.notes ?? undefined,
		currentCompany: row.currentCompany ?? undefined,
		currentTitle: row.currentTitle ?? undefined,
		desiredSalary: row.desiredSalary != null ? Number(row.desiredSalary) : undefined,
		preferredLocations: row.preferredLocations ?? undefined,
		lastContactedAt: row.lastContactedAt?.toISOString() ?? undefined,
		nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? undefined,
		contactFrequency: row.contactFrequency ?? undefined,
		createdAt: row.addedAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function rowToInteraction(row: InteractionRow) {
	return {
		id: row.id,
		talentPoolId: row.talentPoolId ?? "",
		interactionType: row.type,
		subject: row.subject ?? undefined,
		notes: row.notes ?? undefined,
		outcome: row.outcome ?? undefined,
		interactionDate: row.interactionDate.toISOString(),
		durationMinutes: row.durationMinutes ?? undefined,
		requiresFollowUp: row.requiresFollowUp,
		followUpDate: row.followUpDate?.toISOString() ?? undefined,
		createdAt: row.createdAt.toISOString(),
	};
}

function rowToPlacement(row: PlacementRow) {
	return {
		id: row.id,
		submissionId: row.submissionId ?? null,
		recruiterUserId: row.recruiterId,
		recruiterName: row.recruiterName,
		candidateUserId: row.candidateId,
		candidateName: row.candidateName,
		jobId: row.jobId ?? "",
		jobTitle: row.jobTitle ?? "",
		companyName: row.companyName ?? "",
		startDate: row.startDate?.toISOString() ?? null,
		annualSalary: row.annualSalary != null ? Number(row.annualSalary) : (row.salary != null ? Number(row.salary) : 0),
		commissionPercentage: Number(row.commissionPercentage) || 0,
		commissionAmount: Number(row.commissionAmount) || 0,
		commissionStatus: row.commissionStatus,
		commissionPaidDate: row.commissionPaidDate?.toISOString() ?? null,
		paymentReference: row.paymentReference ?? null,
		guaranteePeriodDays: row.guaranteePeriodDays ?? null,
		guaranteeEndDate: row.guaranteeEndDate?.toISOString() ?? null,
		guaranteeMetStatus: row.guaranteeMetStatus ?? null,
		notes: row.notes ?? null,
		placedAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function rowToSubmission(row: SubmissionRow) {
	return {
		id: row.id,
		recruiterUserId: row.recruiterId,
		recruiterName: "",
		candidateUserId: row.candidateId,
		candidateName: row.candidateName,
		candidateEmail: row.candidateEmail ?? null,
		jobId: row.jobId ?? "",
		jobTitle: row.jobTitle ?? "",
		companyName: row.companyName ?? "",
		resumeId: row.resumeId ?? null,
		coverLetter: row.coverLetter ?? null,
		recruiterNotes: row.recruiterNotes ?? null,
		proposedSalary: row.proposedSalary != null ? Number(row.proposedSalary) : null,
		availableStartDate: row.availableStartDate?.toISOString() ?? null,
		status: row.status,
		statusNotes: row.statusNotes ?? null,
		interviewDate: row.interviewDate?.toISOString() ?? null,
		withdrawalReason: row.withdrawalReason ?? null,
		withdrawalNotes: row.withdrawalNotes ?? null,
		withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
		submittedAt: row.submittedAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ─── Talent Pool ──────────────────────────────────────────────────────────────

// POST /talent-pool — add a candidate to the calling recruiter's talent pool
recruiterRoutes.post("/talent-pool", async (c) => {
	const user = c.get("user");
	const body = await c.req.json();
	const db = getDb();
	const [entry] = await db.insert(schema.talentPoolCandidates).values({
		recruiterId: user.sub,
		candidateId: body.candidateUserId,
		candidateName: body.candidateName ?? "",
		candidateEmail: body.candidateEmail ?? null,
		candidateTitle: body.candidateTitle ?? null,
		candidateProfilePicture: body.candidateProfilePicture ?? null,
		poolName: body.poolName ?? null,
		relationshipStrength: body.relationshipStrength ?? "warm",
		tags: body.tags ?? [],
		status: body.status ?? "active",
		notes: body.notes ?? null,
		currentCompany: body.currentCompany ?? null,
		currentTitle: body.currentTitle ?? null,
		desiredSalary: body.desiredSalary ?? null,
		preferredLocations: body.preferredLocations ?? null,
		lastContactedAt: body.lastContactedAt ? new Date(body.lastContactedAt) : null,
		nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
		contactFrequency: body.contactFrequency ?? null,
	} as any).returning();
	return c.json(success(rowToTalentPoolEntry(entry)), 201);
});

// GET /talent-pool — list all talent pool entries for current recruiter
recruiterRoutes.get("/talent-pool", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const entries = await db
		.select()
		.from(schema.talentPoolCandidates)
		.where(eq(schema.talentPoolCandidates.recruiterId, user.sub))
		.orderBy(desc(schema.talentPoolCandidates.addedAt));
	return c.json(success(entries.map(rowToTalentPoolEntry)));
});

// GET /talent-pool/export — download pool as CSV (must be before /:id)
recruiterRoutes.get("/talent-pool/export", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const entries = await db
		.select()
		.from(schema.talentPoolCandidates)
		.where(eq(schema.talentPoolCandidates.recruiterId, user.sub))
		.orderBy(desc(schema.talentPoolCandidates.addedAt));

	const header = ["id", "candidateName", "candidateEmail", "candidateTitle", "currentCompany", "currentTitle", "status", "relationshipStrength", "tags", "notes", "lastContactedAt", "addedAt"];
	const escape = (v: unknown) => {
		const s = v == null ? "" : String(v);
		return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const rows = entries.map((e) => [
		e.id, e.candidateName, e.candidateEmail ?? "", e.candidateTitle ?? "",
		e.currentCompany ?? "", e.currentTitle ?? "", e.status, e.relationshipStrength,
		Array.isArray(e.tags) ? (e.tags as string[]).join("; ") : "",
		e.notes ?? "", e.lastContactedAt?.toISOString() ?? "", e.addedAt.toISOString(),
	].map(escape).join(","));

	const csv = [header.join(","), ...rows].join("\n");
	const date = new Date().toISOString().slice(0, 10);
	return new Response(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="talent-pool-${date}.csv"`,
		},
	});
});

// GET /talent-pool/check/:candidateUserId — check if candidate is in pool (static before /:id)
recruiterRoutes.get("/talent-pool/check/:candidateUserId", async (c) => {
	const user = c.get("user");
	const candidateUserId = c.req.param("candidateUserId");
	const db = getDb();
	const [existing] = await db
		.select({ id: schema.talentPoolCandidates.id })
		.from(schema.talentPoolCandidates)
		.where(
			and(
				eq(schema.talentPoolCandidates.recruiterId, user.sub),
				eq(schema.talentPoolCandidates.candidateId, candidateUserId),
			),
		)
		.limit(1);
	return c.json(success(Boolean(existing)));
});

// GET /talent-pool/:id — get single entry
recruiterRoutes.get("/talent-pool/:id", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const db = getDb();
	const [entry] = await db
		.select()
		.from(schema.talentPoolCandidates)
		.where(
			and(
				eq(schema.talentPoolCandidates.id, id),
				eq(schema.talentPoolCandidates.recruiterId, user.sub),
			),
		)
		.limit(1);
	if (!entry) return c.json({ error: { code: "NOT_FOUND", message: "Entry not found" } }, 404);
	return c.json(success(rowToTalentPoolEntry(entry)));
});

// PUT /talent-pool/:id — update entry
recruiterRoutes.put("/talent-pool/:id", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const body = await c.req.json();
	const db = getDb();
	const [updated] = await db
		.update(schema.talentPoolCandidates)
		.set({
			candidateName: body.candidateName !== undefined ? body.candidateName : undefined,
			candidateEmail: body.candidateEmail !== undefined ? body.candidateEmail : undefined,
			candidateTitle: body.candidateTitle !== undefined ? body.candidateTitle : undefined,
			candidateProfilePicture: body.candidateProfilePicture !== undefined ? body.candidateProfilePicture : undefined,
			poolName: body.poolName !== undefined ? body.poolName : undefined,
			relationshipStrength: body.relationshipStrength !== undefined ? body.relationshipStrength : undefined,
			tags: body.tags !== undefined ? body.tags : undefined,
			status: body.status !== undefined ? body.status : undefined,
			notes: body.notes !== undefined ? body.notes : undefined,
			currentCompany: body.currentCompany !== undefined ? body.currentCompany : undefined,
			currentTitle: body.currentTitle !== undefined ? body.currentTitle : undefined,
			desiredSalary: body.desiredSalary !== undefined ? body.desiredSalary : undefined,
			preferredLocations: body.preferredLocations !== undefined ? body.preferredLocations : undefined,
			lastContactedAt: body.lastContactedAt ? new Date(body.lastContactedAt) : undefined,
			nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : undefined,
			contactFrequency: body.contactFrequency !== undefined ? body.contactFrequency : undefined,
			updatedAt: new Date(),
		} as any)
		.where(
			and(
				eq(schema.talentPoolCandidates.id, id),
				eq(schema.talentPoolCandidates.recruiterId, user.sub),
			),
		)
		.returning();
	if (!updated) return c.json({ error: { code: "NOT_FOUND", message: "Entry not found" } }, 404);
	return c.json(success(rowToTalentPoolEntry(updated)));
});

// DELETE /talent-pool/:id — remove from pool
recruiterRoutes.delete("/talent-pool/:id", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const db = getDb();
	await db
		.delete(schema.talentPoolCandidates)
		.where(
			and(
				eq(schema.talentPoolCandidates.id, id),
				eq(schema.talentPoolCandidates.recruiterId, user.sub),
			),
		);
	return c.json(success({ success: true }));
});

// ─── Interactions ─────────────────────────────────────────────────────────────

// POST /interactions — record an interaction
recruiterRoutes.post("/interactions", async (c) => {
	const user = c.get("user");
	const body = await c.req.json();
	const db = getDb();

	// Resolve candidateId: from talentPoolId or direct
	let candidateId = body.candidateUserId ?? body.candidateId;
	if (!candidateId && body.talentPoolId) {
		const [entry] = await db
			.select({ candidateId: schema.talentPoolCandidates.candidateId })
			.from(schema.talentPoolCandidates)
			.where(eq(schema.talentPoolCandidates.id, body.talentPoolId))
			.limit(1);
		candidateId = entry?.candidateId ?? user.sub;
	}
	if (!candidateId) candidateId = user.sub;

	const [interaction] = await db.insert(schema.candidateInteractions).values({
		recruiterId: user.sub,
		candidateId,
		talentPoolId: body.talentPoolId ?? null,
		type: body.interactionType ?? body.type ?? "note",
		subject: body.subject ?? null,
		notes: body.notes ?? null,
		outcome: body.outcome ?? null,
		interactionDate: body.interactionDate ? new Date(body.interactionDate) : new Date(),
		durationMinutes: body.durationMinutes ?? null,
		requiresFollowUp: body.requiresFollowUp ?? false,
		followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
	} as any).returning();
	return c.json(success(rowToInteraction(interaction)), 201);
});

// GET /interactions/:talentPoolId — list interactions for a talent pool entry
recruiterRoutes.get("/interactions/:talentPoolId", async (c) => {
	const user = c.get("user");
	const talentPoolId = c.req.param("talentPoolId");
	const db = getDb();
	const interactions = await db
		.select()
		.from(schema.candidateInteractions)
		.where(
			and(
				eq(schema.candidateInteractions.talentPoolId, talentPoolId),
				eq(schema.candidateInteractions.recruiterId, user.sub),
			),
		)
		.orderBy(desc(schema.candidateInteractions.interactionDate));
	return c.json(success(interactions.map(rowToInteraction)));
});

// ─── Placements ───────────────────────────────────────────────────────────────

// GET /placements/summary/commission — must be before /:id to avoid conflict
recruiterRoutes.get("/placements/summary/commission", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const rows = await db
		.select({
			commissionAmount: schema.placements.commissionAmount,
			commissionStatus: schema.placements.commissionStatus,
			createdAt: schema.placements.createdAt,
		})
		.from(schema.placements)
		.where(eq(schema.placements.recruiterId, user.sub));

	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfYear = new Date(now.getFullYear(), 0, 1);

	let totalEarned = 0, totalPending = 0, totalPaid = 0;
	let placementsThisMonth = 0, placementsThisYear = 0;
	for (const r of rows) {
		const amt = Number(r.commissionAmount) || 0;
		totalEarned += amt;
		if (r.commissionStatus === "Paid") totalPaid += amt;
		else totalPending += amt;
		if (r.createdAt >= startOfMonth) placementsThisMonth++;
		if (r.createdAt >= startOfYear) placementsThisYear++;
	}
	return c.json(responseEnvelope({
		totalEarned,
		totalPending,
		totalPaid,
		totalPlacements: rows.length,
		placementsThisMonth,
		placementsThisYear,
		averagePlacementValue: rows.length > 0 ? totalEarned / rows.length : 0,
	}));
});

// POST /placements — record a placement
recruiterRoutes.post("/placements", async (c) => {
	const user = c.get("user");
	const body = await c.req.json();
	const db = getDb();

	// Look up recruiter name
	const [recruiterUser] = await db
		.select({ name: schema.users.name })
		.from(schema.users)
		.where(eq(schema.users.id, user.sub))
		.limit(1);

	// Look up submission if provided, to get candidateId + names
	let candidateId = body.candidateUserId ?? user.sub;
	let candidateName = body.candidateName ?? "";
	let jobId = body.jobId ?? null;
	let jobTitle = body.jobTitle ?? "";
	let companyName = body.companyName ?? "";

	if (body.submissionId) {
		const [sub] = await db
			.select()
			.from(schema.candidateSubmissions)
			.where(eq(schema.candidateSubmissions.id, body.submissionId))
			.limit(1);
		if (sub) {
			candidateId = sub.candidateId;
			candidateName = sub.candidateName || candidateName;
			jobId = sub.jobId ?? jobId;
			jobTitle = sub.jobTitle ?? jobTitle;
			companyName = sub.companyName ?? companyName;
		}
	}

	const commissionPct = Number(body.commissionPercentage ?? 0);
	const annualSalary = Number(body.annualSalary ?? 0);
	const commissionAmount = Number(((annualSalary * commissionPct) / 100).toFixed(2));

	let guaranteeEndDate: Date | null = null;
	if (body.startDate && body.guaranteePeriodDays) {
		guaranteeEndDate = new Date(body.startDate);
		guaranteeEndDate.setDate(guaranteeEndDate.getDate() + Number(body.guaranteePeriodDays));
	}

	const [placement] = await db.insert(schema.placements).values({
		recruiterId: user.sub,
		recruiterName: recruiterUser?.name ?? "",
		candidateId,
		candidateName,
		jobId: jobId ?? null,
		jobTitle,
		companyName,
		submissionId: body.submissionId ?? null,
		startDate: body.startDate ? new Date(body.startDate) : null,
		annualSalary: annualSalary || null,
		commissionPercentage: String(commissionPct),
		commissionAmount: String(commissionAmount),
		commissionStatus: "Pending",
		guaranteePeriodDays: body.guaranteePeriodDays ?? null,
		guaranteeEndDate,
		notes: body.notes ?? null,
	} as any).returning();
	return c.json(responseEnvelope(rowToPlacement(placement)));
});

// GET /placements — list all placements for current recruiter
recruiterRoutes.get("/placements", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const rows = await db
		.select()
		.from(schema.placements)
		.where(eq(schema.placements.recruiterId, user.sub))
		.orderBy(desc(schema.placements.createdAt));
	return c.json(responseEnvelope(rows.map(rowToPlacement)));
});

// GET /placements/:id — single placement
recruiterRoutes.get("/placements/:id", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const db = getDb();
	const [row] = await db
		.select()
		.from(schema.placements)
		.where(
			and(
				eq(schema.placements.id, id),
				eq(schema.placements.recruiterId, user.sub),
			),
		)
		.limit(1);
	if (!row) return c.json(responseEnvelope(null), 404);
	return c.json(responseEnvelope(rowToPlacement(row)));
});

// PUT /placements/:id/commission — update commission status
recruiterRoutes.put("/placements/:id/commission", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const body = await c.req.json();
	const db = getDb();
	const [updated] = await db
		.update(schema.placements)
		.set({
			commissionStatus: body.status ?? "Pending",
			commissionPaidDate: body.paidDate ? new Date(body.paidDate) : null,
			paymentReference: body.paymentReference ?? null,
			updatedAt: new Date(),
		} as any)
		.where(
			and(
				eq(schema.placements.id, id),
				eq(schema.placements.recruiterId, user.sub),
			),
		)
		.returning();
	if (!updated) return c.json(responseEnvelope(null), 404);
	return c.json(responseEnvelope(rowToPlacement(updated)));
});

// PUT /placements/:id/guarantee — update guarantee status
recruiterRoutes.put("/placements/:id/guarantee", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const body = await c.req.json();
	const db = getDb();
	const [updated] = await db
		.update(schema.placements)
		.set({
			guaranteeMetStatus: body.guaranteeMet ?? null,
			notes: body.notes ?? undefined,
			updatedAt: new Date(),
		} as any)
		.where(
			and(
				eq(schema.placements.id, id),
				eq(schema.placements.recruiterId, user.sub),
			),
		)
		.returning();
	if (!updated) return c.json(responseEnvelope(null), 404);
	return c.json(responseEnvelope(rowToPlacement(updated)));
});

// ─── Submissions ──────────────────────────────────────────────────────────────

// GET /submissions/job/:jobId — must be before /:id
recruiterRoutes.get("/submissions/job/:jobId", async (c) => {
	const user = c.get("user");
	const jobId = c.req.param("jobId");
	const db = getDb();
	const rows = await db
		.select()
		.from(schema.candidateSubmissions)
		.where(
			and(
				eq(schema.candidateSubmissions.recruiterId, user.sub),
				eq(schema.candidateSubmissions.jobId, jobId as unknown as string),
			),
		)
		.orderBy(desc(schema.candidateSubmissions.submittedAt));
	return c.json(responseEnvelope(rows.map(rowToSubmission)));
});

// POST /submissions — create a submission
recruiterRoutes.post("/submissions", async (c) => {
	const user = c.get("user");
	const body = await c.req.json();
	const db = getDb();
	const [sub] = await db.insert(schema.candidateSubmissions).values({
		recruiterId: user.sub,
		candidateId: body.candidateUserId ?? body.candidateId,
		candidateName: body.candidateName ?? "",
		candidateEmail: body.candidateEmail ?? null,
		jobId: body.jobId ?? null,
		jobTitle: body.jobTitle ?? null,
		companyName: body.companyName ?? null,
		resumeId: body.resumeId ?? null,
		coverLetter: body.coverLetter ?? null,
		recruiterNotes: body.recruiterNotes ?? null,
		proposedSalary: body.proposedSalary ?? null,
		availableStartDate: body.availableStartDate ? new Date(body.availableStartDate) : null,
		status: "Submitted",
		notes: body.notes ?? null,
	} as any).returning();
	return c.json(responseEnvelope(rowToSubmission(sub)));
});

// GET /submissions — list all submissions for current recruiter
recruiterRoutes.get("/submissions", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const rows = await db
		.select()
		.from(schema.candidateSubmissions)
		.where(eq(schema.candidateSubmissions.recruiterId, user.sub))
		.orderBy(desc(schema.candidateSubmissions.submittedAt));
	return c.json(responseEnvelope(rows.map(rowToSubmission)));
});

// GET /submissions/:id — single submission
recruiterRoutes.get("/submissions/:id", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const db = getDb();
	const [row] = await db
		.select()
		.from(schema.candidateSubmissions)
		.where(
			and(
				eq(schema.candidateSubmissions.id, id),
				eq(schema.candidateSubmissions.recruiterId, user.sub),
			),
		)
		.limit(1);
	if (!row) return c.json(responseEnvelope(null), 404);
	return c.json(responseEnvelope(rowToSubmission(row)));
});

// PUT /submissions/:id/status — update status
recruiterRoutes.put("/submissions/:id/status", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const body = await c.req.json();
	const db = getDb();
	const [updated] = await db
		.update(schema.candidateSubmissions)
		.set({
			status: body.status ?? "Submitted",
			statusNotes: body.statusNotes ?? null,
			interviewDate: body.interviewDate ? new Date(body.interviewDate) : undefined,
			updatedAt: new Date(),
		} as any)
		.where(
			and(
				eq(schema.candidateSubmissions.id, id),
				eq(schema.candidateSubmissions.recruiterId, user.sub),
			),
		)
		.returning();
	if (!updated) return c.json(responseEnvelope(null), 404);
	return c.json(responseEnvelope(rowToSubmission(updated)));
});

// POST /submissions/:id/withdraw — withdraw a submission
recruiterRoutes.post("/submissions/:id/withdraw", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const body = await c.req.json();
	const db = getDb();
	const [updated] = await db
		.update(schema.candidateSubmissions)
		.set({
			status: "Withdrawn",
			withdrawalReason: body.reason ?? null,
			withdrawalNotes: body.notes ?? null,
			withdrawnAt: new Date(),
			updatedAt: new Date(),
		} as any)
		.where(
			and(
				eq(schema.candidateSubmissions.id, id),
				eq(schema.candidateSubmissions.recruiterId, user.sub),
			),
		)
		.returning();
	if (!updated) return c.json(responseEnvelope(null), 404);
	return c.json(responseEnvelope(rowToSubmission(updated)));
});

// ─── Bulk Operations ──────────────────────────────────────────────────────────

// POST /bulk/tags — add/remove tags on multiple talent pool entries
// Body: { ids: string[], addTags?: string[], removeTags?: string[] }
recruiterRoutes.post("/bulk/tags", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => ({}));
	const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
	const addTags: string[] = Array.isArray(body.addTags) ? body.addTags : [];
	const removeTags: string[] = Array.isArray(body.removeTags) ? body.removeTags : [];
	if (!ids.length) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "ids is required" } }, 400);

	const db = getDb();
	const entries = await db
		.select({ id: schema.talentPoolCandidates.id, tags: schema.talentPoolCandidates.tags })
		.from(schema.talentPoolCandidates)
		.where(and(inArray(schema.talentPoolCandidates.id, ids), eq(schema.talentPoolCandidates.recruiterId, user.sub)));

	let updatedCount = 0;
	for (const entry of entries) {
		let tags: string[] = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
		if (addTags.length) tags = Array.from(new Set([...tags, ...addTags]));
		if (removeTags.length) tags = tags.filter((t) => !removeTags.includes(t));
		await db.update(schema.talentPoolCandidates).set({ tags, updatedAt: new Date() } as any).where(eq(schema.talentPoolCandidates.id, entry.id));
		updatedCount++;
	}

	return c.json(responseEnvelope({ updated: updatedCount }), 200);
});

// POST /bulk/status — update status on multiple talent pool entries
// Body: { ids: string[], status: string }
recruiterRoutes.post("/bulk/status", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => ({}));
	const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
	const newStatus = typeof body.status === "string" ? body.status : null;
	if (!ids.length || !newStatus) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "ids and status are required" } }, 400);

	const db = getDb();
	const result = await db
		.update(schema.talentPoolCandidates)
		.set({ status: newStatus, updatedAt: new Date() } as any)
		.where(and(inArray(schema.talentPoolCandidates.id, ids), eq(schema.talentPoolCandidates.recruiterId, user.sub)))
		.returning({ id: schema.talentPoolCandidates.id });

	return c.json(responseEnvelope({ updated: result.length }), 200);
});

// DELETE /bulk/delete — remove multiple talent pool entries
// Body: { ids: string[] }
recruiterRoutes.delete("/bulk/delete", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => ({}));
	const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
	if (!ids.length) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "ids is required" } }, 400);

	const db = getDb();
	const result = await db
		.delete(schema.talentPoolCandidates)
		.where(and(inArray(schema.talentPoolCandidates.id, ids), eq(schema.talentPoolCandidates.recruiterId, user.sub)))
		.returning({ id: schema.talentPoolCandidates.id });

	return c.json(responseEnvelope({ deleted: result.length }), 200);
});
