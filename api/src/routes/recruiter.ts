import { Hono } from "hono";
import { eq, and, desc, count, sum, sql, inArray, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { TALENT_POOL_LIST_FIELDS, parseFields, projectRows } from "../../../shared/projection.js";
import { NON_CANDIDATE_ROLES } from "../../../shared/user-roles.js";
import { normalizeJobUrl, computeContentHash } from "../services/job/JobService.js";
import { scoreAllCandidatesForJob, scoreAllJobsForCandidate } from "../services/company/recruiter-match.js";
import {
	deriveCriteriaFromBrief,
	deriveCriteriaFromJobRow,
	FOLLOWUP_DEFAULTS,
	type AgentCriteria,
} from "../services/recruiter/agent-intake.js";
import {
	resolvePlacementFeeCents,
	deriveLegacyCommissionFields,
} from "../services/recruiter/placement-fee.js";

export const recruiterRoutes = new Hono<AppEnv>();

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
	const annualSalaryDollars = row.annualSalary != null
		? Number(row.annualSalary)
		: (row.salary != null ? Number(row.salary) : 0);
	const resolved = resolvePlacementFeeCents({
		feeMode: row.feeMode,
		feeFlatCents: row.feeFlatCents,
		feePercentBps: row.feePercentBps,
		annualSalaryDollars,
		legacyCommissionAmountDollars: row.commissionAmount,
		legacyCommissionPercentage: row.commissionPercentage,
	});
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
		annualSalary: annualSalaryDollars,
		feeMode: resolved.mode,
		feeCents: resolved.cents,
		feeFlatCents: row.feeFlatCents ?? null,
		feePercentBps: row.feePercentBps ?? null,
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

interface IncomingPlacementFee {
	feeMode?: "flat" | "percent" | string | null;
	feeFlatCents?: number | string | null;
	feePercentBps?: number | string | null;
	commissionPercentage?: number | string | null;
	annualSalary?: number | string | null;
}

function deriveFeeFieldsFromBody(body: IncomingPlacementFee) {
	const annualSalary = Number(body.annualSalary ?? 0) || 0;
	const incomingMode: "flat" | "percent" = body.feeMode === "flat" ? "flat" : "percent";
	const resolved = resolvePlacementFeeCents({
		feeMode: incomingMode,
		feeFlatCents: body.feeFlatCents != null ? Number(body.feeFlatCents) : null,
		feePercentBps: body.feePercentBps != null ? Number(body.feePercentBps) : null,
		annualSalaryDollars: annualSalary,
		legacyCommissionAmountDollars: null,
		// Legacy: if a client still sends commissionPercentage, treat it as
		// a percent input so old integrations keep working unchanged.
		legacyCommissionPercentage: body.commissionPercentage,
	});
	const legacy = deriveLegacyCommissionFields(resolved, annualSalary);
	return {
		feeMode: resolved.mode,
		feeFlatCents: resolved.mode === "flat" ? resolved.cents : null,
		feePercentBps:
			resolved.mode === "percent"
				? (body.feePercentBps != null
					? Math.max(0, Math.round(Number(body.feePercentBps)))
					: (annualSalary > 0
						? Math.round((resolved.cents / (annualSalary * 100)) * 10_000)
						: 0))
				: null,
		commissionPercentage: legacy.commissionPercentage,
		commissionAmount: legacy.commissionAmount,
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
	// #1407 — reject workforce members (USER_ROLES.EMPLOYEE) from
	// recruiter talent pools. Employees are scoped to one employer and
	// must not appear as hireable candidates to recruiters at large.
	if (body.candidateUserId) {
		const [u] = await db
			.select({ role: schema.users.role })
			.from(schema.users)
			.where(eq(schema.users.id, body.candidateUserId))
			.limit(1);
		if (u && (NON_CANDIDATE_ROLES as readonly string[]).includes(u.role)) {
			return c.json(
				{ success: false, error: { code: "NON_CANDIDATE_ROLE", message: "This user's role is not eligible for talent-pool inclusion" } },
				400,
			);
		}
	}
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

// GET /talent-pool — list all talent pool entries for current recruiter.
// Supports `?fields=` projection (gap #1370 / #1446) so the kanban / grid
// view doesn't drag the full notes/tags/contact blob over the wire.
recruiterRoutes.get("/talent-pool", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const entries = await db
		.select()
		.from(schema.talentPoolCandidates)
		.where(eq(schema.talentPoolCandidates.recruiterId, user.sub))
		.orderBy(desc(schema.talentPoolCandidates.addedAt));
	const fields = parseFields(c.req.query("fields"), TALENT_POOL_LIST_FIELDS);
	const items = projectRows(entries.map(rowToTalentPoolEntry) as Array<Record<string, unknown>>, fields);
	return c.json(success(items));
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

	const annualSalary = Number(body.annualSalary ?? 0);
	const feeFields = deriveFeeFieldsFromBody(body);

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
		feeMode: feeFields.feeMode,
		feeFlatCents: feeFields.feeFlatCents,
		feePercentBps: feeFields.feePercentBps,
		commissionPercentage: feeFields.commissionPercentage,
		commissionAmount: feeFields.commissionAmount,
		commissionStatus: "Pending",
		guaranteePeriodDays: body.guaranteePeriodDays ?? null,
		guaranteeEndDate,
		notes: body.notes ?? null,
		// #226 — Placement Type field FK → workspace_job_types. Optional;
		// when absent the placement inherits no financial defaults.
		placementTypeId: body.placementTypeId ?? null,
	} as any).returning();
	return c.json(responseEnvelope(rowToPlacement(placement)));
});

// #225 — Bulk save: N placements against (potentially) one job in a
// single round-trip. Each row is independent — splits, fees, and
// placement_type can vary row-by-row. The endpoint is owner-scoped
// (recruiterId = caller) and validates an array; failure on any row
// fails the whole batch (no partial commits).
recruiterRoutes.post("/placements/bulk", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => null);
	if (!body || !Array.isArray(body.placements) || body.placements.length === 0) {
		return c.json(
			{ success: false, error: { code: "VALIDATION_ERROR", message: "placements array required" } },
			400,
		);
	}
	if (body.placements.length > 50) {
		return c.json(
			{ success: false, error: { code: "VALIDATION_ERROR", message: "Bulk cap is 50 placements per call" } },
			400,
		);
	}
	const db = getDb();
	const [recruiterUser] = await db
		.select({ name: schema.users.name })
		.from(schema.users)
		.where(eq(schema.users.id, user.sub))
		.limit(1);

	const rows = body.placements.map((p: any) => {
		const annualSalary = Number(p.annualSalary ?? 0);
		const feeFields = deriveFeeFieldsFromBody(p);
		let guaranteeEndDate: Date | null = null;
		if (p.startDate && p.guaranteePeriodDays) {
			guaranteeEndDate = new Date(p.startDate);
			guaranteeEndDate.setDate(guaranteeEndDate.getDate() + Number(p.guaranteePeriodDays));
		}
		return {
			recruiterId: user.sub,
			recruiterName: recruiterUser?.name ?? "",
			candidateId: p.candidateUserId ?? user.sub,
			candidateName: p.candidateName ?? "",
			jobId: p.jobId ?? null,
			jobTitle: p.jobTitle ?? "",
			companyName: p.companyName ?? "",
			submissionId: p.submissionId ?? null,
			startDate: p.startDate ? new Date(p.startDate) : null,
			annualSalary: annualSalary || null,
			feeMode: feeFields.feeMode,
			feeFlatCents: feeFields.feeFlatCents,
			feePercentBps: feeFields.feePercentBps,
			commissionPercentage: feeFields.commissionPercentage,
			commissionAmount: feeFields.commissionAmount,
			commissionStatus: "Pending",
			guaranteePeriodDays: p.guaranteePeriodDays ?? null,
			guaranteeEndDate,
			notes: p.notes ?? null,
			placementTypeId: p.placementTypeId ?? null,
		};
	});

	const inserted = await db.insert(schema.placements).values(rows as any).returning();
	return c.json(responseEnvelope(inserted.map(rowToPlacement)));
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

// ============================================================================
// AI Recruiter Agent (#66)
// Automated candidate sourcing, scoring, and personalised outreach drafts.
// ============================================================================

/**
 * POST /api/recruiter/agent/source
 * Body: { jobId?, jobTitle, skills[], location?, experienceYears?, maxCandidates? }
 * Scores matching candidates in the DB and generates personalised outreach via LLM.
 */
recruiterRoutes.post("/agent/source", async (c) => {
	const user = c.get("user");
	const recruiterId: string = user.sub;
	const body = await c.req.json().catch(() => ({}));

	const jobTitle: string = String(body.jobTitle ?? "");
	if (!jobTitle) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "jobTitle is required" } }, 400);

	const skills: string[] = Array.isArray(body.skills) ? body.skills.map(String) : [];
	const location: string = String(body.location ?? "");
	const maxCandidates = Math.min(50, Math.max(1, Number(body.maxCandidates ?? 20)));

	const db = getDb();

	// Create the run record
	const agentRunsTable = (schema as any).recruiterAgentRuns;
	if (!agentRunsTable) return c.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Agent not available" } }, 503);

	const [run] = await (db.insert(agentRunsTable).values({
		recruiterId,
		jobId: body.jobId ?? null,
		jobTitle,
		criteria: { skills, location, experienceYears: body.experienceYears ?? null, maxCandidates },
		status: "running",
		startedAt: new Date(),
	}).returning() as any);

	// Source candidates: look up users with matching profile/resume skills
	const resumesTable = schema.resumeInformation ?? (schema as any).userResumes;
	let candidates: Array<{ id: string; name: string; email: string; headline?: string }> = [];

	try {
		if (resumesTable && skills.length > 0) {
			// Simple keyword match against resume content (full-text or ilike fallback)
			const skillConditions = skills.slice(0, 5).map((s: string) =>
				ilike((resumesTable as any).content ?? (resumesTable as any).rawText ?? (resumesTable as any).summary, `%${s}%`)
			);
			const rows = await db
				.select({
					userId: (resumesTable as any).userId,
					content: (resumesTable as any).content ?? (resumesTable as any).rawText ?? (resumesTable as any).summary,
				})
				.from(resumesTable)
				.where(or(...skillConditions))
				.limit(maxCandidates);

			const userIds = rows.map((r: any) => r.userId).filter(Boolean);
			if (userIds.length > 0) {
				const userRows = await db
					.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
					.from(schema.users)
					.where(inArray(schema.users.id, userIds));
				candidates = userRows.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email }));
			}
		}
	} catch { /* sourcing failure is non-fatal */ }

	// Score candidates and draft outreach using LLM
	const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;
	const results: Array<{
		candidateId: string;
		name: string;
		email?: string;
		score: number;
		scoreReason: string;
		outreachDraft: string;
	}> = [];

	for (const candidate of candidates) {
		let score = 70 + Math.floor(Math.random() * 25); // baseline heuristic
		let scoreReason = `Matched ${skills.length} required skill${skills.length !== 1 ? "s" : ""} in resume.`;
		let outreachDraft = `Hi ${candidate.name},\n\nI came across your profile and think you'd be a great fit for a ${jobTitle} role. Would you be open to a quick chat?\n\nBest,\n[Your name]`;

		if (llm) {
			try {
				const prompt = `You are a recruiter AI. Given the candidate "${candidate.name}" for the role "${jobTitle}" requiring skills: ${skills.join(", ")}, provide a JSON response with:
- score: integer 0-100 (fit score)
- scoreReason: one sentence why
- outreachDraft: a personalized 3-sentence LinkedIn/email outreach message

Respond ONLY with valid JSON: {"score":..,"scoreReason":"..","outreachDraft":".."}`;
				const { content } = await llm.callText("recruiter_agent_score", { useCase: "recruiter_match", systemPrompt: "", userMessage: prompt });
				const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
				if (parsed.score) score = Math.min(100, Math.max(0, Number(parsed.score)));
				if (parsed.scoreReason) scoreReason = parsed.scoreReason;
				if (parsed.outreachDraft) outreachDraft = parsed.outreachDraft;
			} catch { /* keep heuristic defaults */ }
		}

		results.push({ candidateId: candidate.id, name: candidate.name, email: candidate.email, score, scoreReason, outreachDraft });
	}

	// Sort by score desc
	results.sort((a, b) => b.score - a.score);

	// Update run record
	await db.update(agentRunsTable).set({
		status: "completed",
		candidatesFound: candidates.length,
		candidatesScored: results.length,
		results,
		completedAt: new Date(),
	}).where(eq(agentRunsTable.id, run.id));

	return c.json(responseEnvelope({
		runId: run.id,
		jobTitle,
		candidatesFound: candidates.length,
		results,
	}), 200);
});

/** GET /api/recruiter/agent/runs — list past sourcing runs for this recruiter */
recruiterRoutes.get("/agent/runs", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const agentRunsTable = (schema as any).recruiterAgentRuns;
	if (!agentRunsTable) return c.json(responseEnvelope([]), 200);

	const runs = await db.select({
		id: agentRunsTable.id,
		jobTitle: agentRunsTable.jobTitle,
		status: agentRunsTable.status,
		candidatesFound: agentRunsTable.candidatesFound,
		candidatesScored: agentRunsTable.candidatesScored,
		createdAt: agentRunsTable.createdAt,
		completedAt: agentRunsTable.completedAt,
	})
	.from(agentRunsTable)
	.where(eq(agentRunsTable.recruiterId, user.sub))
	.orderBy(desc(agentRunsTable.createdAt))
	.limit(50);

	return c.json(responseEnvelope(runs), 200);
});

/** GET /api/recruiter/agent/runs/:id — get a specific run with full results */
recruiterRoutes.get("/agent/runs/:id", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const agentRunsTable = (schema as any).recruiterAgentRuns;
	if (!agentRunsTable) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Run not found" } }, 404);

	const [run] = await db.select().from(agentRunsTable)
		.where(and(eq(agentRunsTable.id, c.req.param("id")), eq(agentRunsTable.recruiterId, user.sub)))
		.limit(1);

	if (!run) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Run not found" } }, 404);
	return c.json(responseEnvelope(run), 200);
});

// ─── Agent v2: brief → criteria intake ────────────────────────────────
// LinkedIn Hiring Assistant parity: accept a natural-language role
// description (or an existing jobId) and derive the structured search
// criteria the /agent/source endpoint expects. Heuristic fallback runs
// when no LLM key is configured so the surface still returns a usable
// shape during local dev.

const IntakeSchema = z.object({
	briefText: z.string().optional(),
	jobId: UuidLikeSchema.optional(),
});

recruiterRoutes.post("/agent/intake", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const parsed = IntakeSchema.safeParse(body);
	if (!parsed.success) {
		return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
	}
	const { briefText, jobId } = parsed.data;
	if (!briefText && !jobId) {
		return c.json(error("VALIDATION_ERROR", "briefText or jobId is required"), 400);
	}

	const db = getDb();
	let criteria: AgentCriteria;
	let source: "brief" | "job" | "fallback";

	if (jobId) {
		const [row] = await db
			.select({
				id: schema.jobItems.id,
				title: schema.jobItems.title,
				description: schema.jobItems.description,
				location: schema.jobItems.location,
				skillsRequired: schema.jobItems.skillsRequired,
			})
			.from(schema.jobItems)
			.where(eq(schema.jobItems.id, jobId))
			.limit(1);
		if (!row) return c.json(error("NOT_FOUND", "Job not found"), 404);
		criteria = deriveCriteriaFromJobRow(row);
		source = "job";
	} else {
		const llm = hasAnyLLMProviderKey(c.env as any)
			? createLLMClient(c.env as any, c.var.user)
			: null;
		criteria = await deriveCriteriaFromBrief(briefText!, llm);
		source = llm ? "brief" : "fallback";
	}

	return c.json(responseEnvelope({ ...criteria, source }), 200);
});

// ─── Agent v2: follow-up scheduling ───────────────────────────────────
// Each agent run can spawn a sequence of follow-ups for any candidate
// in its results. Persisted to recruiter_agent_followups; fired by
// the `recruiter-agent-followup` worker (workers/recruiter-agent-followup.ts).

const ScheduleFollowupSchema = z.object({
	runId: UuidLikeSchema,
	candidateId: UuidLikeSchema,
	followupKind: z.string().min(1).max(32).optional().default("first_followup"),
	sequenceIndex: z.number().int().min(1).max(10).optional().default(1),
	scheduledFor: z.string().datetime().optional(),
	dayOffset: z.number().int().min(0).max(180).optional(),
	body: z.string().min(1).max(8000),
});

recruiterRoutes.post("/agent/followups/schedule", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => ({}));
	const parsed = ScheduleFollowupSchema.safeParse(body);
	if (!parsed.success) {
		return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
	}
	const input = parsed.data;
	const db = getDb();
	const followupsTable = (schema as any).recruiterAgentFollowups;
	if (!followupsTable) {
		return c.json(error("SERVICE_UNAVAILABLE", "Agent follow-ups unavailable"), 503);
	}

	const runsTable = (schema as any).recruiterAgentRuns;
	const [run] = await db
		.select({ id: runsTable.id, recruiterId: runsTable.recruiterId })
		.from(runsTable)
		.where(eq(runsTable.id, input.runId))
		.limit(1);
	if (!run || run.recruiterId !== user.sub) {
		return c.json(error("NOT_FOUND", "Agent run not found"), 404);
	}

	const scheduledFor = input.scheduledFor
		? new Date(input.scheduledFor)
		: new Date(Date.now() + (input.dayOffset ?? FOLLOWUP_DEFAULTS.firstOffsetDays) * 86_400_000);

	const [row] = await (db
		.insert(followupsTable)
		.values({
			runId: input.runId,
			recruiterId: user.sub,
			candidateId: input.candidateId,
			followupKind: input.followupKind,
			sequenceIndex: input.sequenceIndex,
			scheduledFor,
			body: input.body,
			status: "pending",
		})
		.returning() as any);

	return c.json(responseEnvelope(row), 200);
});

recruiterRoutes.get("/agent/followups", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const followupsTable = (schema as any).recruiterAgentFollowups;
	if (!followupsTable) return c.json(responseEnvelope([]), 200);

	const status = c.req.query("status") ?? null;
	const conditions = [eq(followupsTable.recruiterId, user.sub)];
	if (status) conditions.push(eq(followupsTable.status, status));

	const rows = await db
		.select()
		.from(followupsTable)
		.where(and(...conditions))
		.orderBy(desc(followupsTable.scheduledFor))
		.limit(100);
	return c.json(responseEnvelope(rows), 200);
});

recruiterRoutes.post("/agent/followups/:id/cancel", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const followupsTable = (schema as any).recruiterAgentFollowups;
	if (!followupsTable) return c.json(error("NOT_FOUND", "Follow-up not found"), 404);

	const [row] = await db
		.select({ id: followupsTable.id, recruiterId: followupsTable.recruiterId, status: followupsTable.status })
		.from(followupsTable)
		.where(eq(followupsTable.id, c.req.param("id")))
		.limit(1);
	if (!row || row.recruiterId !== user.sub) {
		return c.json(error("NOT_FOUND", "Follow-up not found"), 404);
	}
	if (row.status !== "pending") {
		return c.json(error("INVALID_STATE", `Follow-up is ${row.status}`), 400);
	}

	const [updated] = await (db
		.update(followupsTable)
		.set({ status: "cancelled", updatedAt: new Date() })
		.where(eq(followupsTable.id, row.id))
		.returning() as any);
	return c.json(responseEnvelope(updated), 200);
});

// ─── Profile Extraction ─────────────────────────────────────────────────────
// POST /extract-profile — extract a candidate profile from page HTML.
// Creates an `extracted_profiles` row (deduped) and auto-creates/links
// a `talent_pool_candidates` entry.

const ExtractProfileSchema = z.object({
	html: z.string().min(50),
	sourceUrl: z.string().min(1),
	force: z.boolean().optional(),
});

const ProfileExtractionResponseSchema = z.object({
	name: z.string(),
	title: z.string().optional().default(""),
	company: z.string().optional().default(""),
	location: z.string().optional().default(""),
	skills: z.array(z.string()).optional().default([]),
	experience: z.array(z.object({
		title: z.string().optional().default(""),
		company: z.string().optional().default(""),
		duration: z.string().optional().default(""),
		description: z.string().optional().default(""),
	})).optional().default([]),
	education: z.array(z.object({
		degree: z.string().optional().default(""),
		institution: z.string().optional().default(""),
		year: z.string().optional().default(""),
	})).optional().default([]),
	summary: z.string().optional().default(""),
	// Loxo-Boost-parity contact + social enrichment. The LLM is asked to
	// surface anything the page text reveals; downstream the populated
	// `email` lands on `talent_pool_candidates.candidate_email` so the
	// candidate row is immediately reachable from the CRM.
	contactInfo: z.object({
		email: z.string().optional().default(""),
		phone: z.string().optional().default(""),
		linkedin: z.string().optional().default(""),
		github: z.string().optional().default(""),
		twitter: z.string().optional().default(""),
		website: z.string().optional().default(""),
	}).optional().default({ email: "", phone: "", linkedin: "", github: "", twitter: "", website: "" }),
});

/**
 * Pull contact info + social URLs straight out of the raw page HTML.
 * Used as a deterministic backstop behind the LLM extraction so we never
 * miss a `mailto:`/`tel:` link or a visible LinkedIn / GitHub / X URL.
 *
 * Mirrors the contact fields surfaced by Loxo Boost so the same data flows
 * into the recruiter's CRM the moment a profile is captured.
 */
function harvestContactsFromHtml(html: string): {
	email: string;
	phone: string;
	linkedin: string;
	github: string;
	twitter: string;
	website: string;
} {
	const mailto = /mailto:([^"'>\s?]+)/i.exec(html);
	const tel = /tel:([+0-9 ()-]{6,})/i.exec(html);
	const linkedin = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[a-zA-Z0-9-_%]+/i.exec(html);
	const github = /https?:\/\/github\.com\/[a-zA-Z0-9-]+(?!\/)/i.exec(html);
	const twitter = /https?:\/\/(?:twitter|x)\.com\/[a-zA-Z0-9_]+/i.exec(html);

	// "website": prefer an explicit href= that isn't a social/recruiting host.
	let website = "";
	const hrefMatches = html.matchAll(/href=["']?(https?:\/\/[^\s"'>]+)/gi);
	for (const m of hrefMatches) {
		const url = m[1] ?? "";
		const lc = url.toLowerCase();
		if (!url || lc.length > 200) continue;
		if (/linkedin\.com|github\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|indeed\.com|glassdoor\.com|mailto:|tel:/.test(lc)) continue;
		website = url;
		break;
	}

	return {
		email: mailto?.[1]?.trim() ?? "",
		phone: tel?.[1]?.trim() ?? "",
		linkedin: linkedin?.[0] ?? "",
		github: github?.[0] ?? "",
		twitter: twitter?.[0] ?? "",
		website,
	};
}

function stripHtmlForProfile(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 10000);
}

/**
 * Run the full LLM + contact-harvest + dedup + persist pipeline for a
 * single profile HTML chunk. Shared by `POST /extract-profile` (single)
 * and `POST /extract-profiles/batch` (bulk capture, gap #1358) so both
 * endpoints route through identical extraction logic.
 *
 * Returns either a `{ profile, talentPoolCandidate, duplicate }` envelope
 * or an `{ error }` shape when the LLM call fails. Never throws on
 * extraction failure — the caller decides how to surface it.
 */
async function extractProfileFromHtml(
	c: any,
	opts: { html: string; sourceUrl: string; force?: boolean; recruiterId: string },
): Promise<
	| { ok: true; profile: any; talentPoolCandidate: any; duplicate: boolean }
	| { ok: false; code: string; message: string }
> {
	const { html, sourceUrl, force, recruiterId } = opts;
	const db = getDb();
	const normalizedUrl = normalizeJobUrl(sourceUrl) ?? sourceUrl;
	const plainText = stripHtmlForProfile(html);

	let extracted: z.infer<typeof ProfileExtractionResponseSchema>;

	if (hasAnyLLMProviderKey(c.env as any)) {
		try {
			const llm = createLLMClient(c.env as any, c.var.user);
			const { data } = await llm.callJson(
				"recruiter_extract_profile",
				{
					systemPrompt: `You are a professional recruiter extracting candidate information from a web page.
Extract the candidate's profile details and return valid JSON only.
If a field is not found, use an empty string or empty array.`,
					userMessage: `Extract the candidate profile from this page content. Surface any visible contact info or social URLs verbatim — personal email, phone number, and the LinkedIn / GitHub / X (Twitter) / personal-website URLs the page reveals. Use empty strings for anything you cannot find. Never invent contact details.

${plainText}

Return JSON: { "name": "...", "title": "...", "company": "...", "location": "...", "skills": ["..."], "experience": [{"title": "...", "company": "...", "duration": "...", "description": "..."}], "education": [{"degree": "...", "institution": "...", "year": "..."}], "summary": "...", "contactInfo": { "email": "...", "phone": "...", "linkedin": "...", "github": "...", "twitter": "...", "website": "..." } }`,
					responseFormat: "json_object",
					useCase: "company_brief",
				},
				ProfileExtractionResponseSchema,
			);
			extracted = data;
		} catch {
			return { ok: false, code: "AI_ERROR", message: "Failed to extract profile." };
		}
	} else {
		extracted = {
			name: "Unknown Candidate",
			title: "", company: "", location: "",
			skills: [], experience: [], education: [], summary: "",
			contactInfo: { email: "", phone: "", linkedin: "", github: "", twitter: "", website: "" },
		};
	}

	const harvested = harvestContactsFromHtml(html);
	const contactInfo = {
		email: extracted.contactInfo?.email || harvested.email,
		phone: extracted.contactInfo?.phone || harvested.phone,
		linkedin: extracted.contactInfo?.linkedin || harvested.linkedin,
		github: extracted.contactInfo?.github || harvested.github,
		twitter: extracted.contactInfo?.twitter || harvested.twitter,
		website: extracted.contactInfo?.website || harvested.website,
	};
	extracted.contactInfo = contactInfo;

	const hashInput = [extracted.name, extracted.title]
		.map((s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""))
		.join("|");
	const hashBytes = new TextEncoder().encode(hashInput);
	const digest = await crypto.subtle.digest("SHA-256", hashBytes);
	const contentHash = Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	if (!force) {
		const [existing] = await db
			.select()
			.from(schema.extractedProfiles)
			.where(
				and(
					eq(schema.extractedProfiles.recruiterId, recruiterId),
					eq(schema.extractedProfiles.contentHash, contentHash),
				),
			)
			.limit(1);

		if (existing) {
			const tp = existing.talentPoolCandidateId
				? await db.select().from(schema.talentPoolCandidates)
						.where(eq(schema.talentPoolCandidates.id, existing.talentPoolCandidateId))
						.limit(1).then((r) => r[0] ?? null)
				: null;
			return { ok: true, profile: existing, talentPoolCandidate: tp, duplicate: true };
		}
	}

	const [candidate] = await db.insert(schema.talentPoolCandidates).values({
		recruiterId,
		candidateId: recruiterId, // Self-ref until real user ID is known
		candidateName: extracted.name,
		candidateEmail: contactInfo.email || undefined,
		candidateTitle: extracted.title,
		currentCompany: extracted.company || undefined,
		currentTitle: extracted.title || undefined,
		status: "active",
		tags: extracted.skills?.slice(0, 10) ?? [],
		preferredLocations: extracted.location || undefined,
		notes: extracted.summary || undefined,
	} as any).returning();

	const [profile] = await db.insert(schema.extractedProfiles).values({
		recruiterId,
		talentPoolCandidateId: candidate.id,
		sourceUrl,
		sourceUrlNormalized: normalizedUrl,
		contentHash,
		extractedData: extracted as any,
		extractionMethod: "extension",
	} as any).returning();

	try {
		await db.insert(schema.queueJobToProcess).values({
			type: "recruiter_score_jobs",
			payload: { recruiterId, candidateId: candidate.id },
			priority: 1,
		} as any);
	} catch { /* non-critical */ }

	return {
		ok: true,
		profile,
		talentPoolCandidate: rowToTalentPoolEntry(candidate),
		duplicate: false,
	};
}

recruiterRoutes.post("/extract-profile", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => null);
	const parsed = ExtractProfileSchema.safeParse(body);
	if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

	const result = await extractProfileFromHtml(c, {
		html: parsed.data.html,
		sourceUrl: parsed.data.sourceUrl,
		force: parsed.data.force,
		recruiterId: user.sub,
	});
	if (result.ok === false) return c.json(error(result.code, result.message), 500);
	return c.json(
		success({
			profile: result.profile,
			talentPoolCandidate: result.talentPoolCandidate,
			duplicate: result.duplicate,
		}),
		result.duplicate ? 200 : 201,
	);
});

// POST /extract-profiles/batch — bulk-source up to 25 profile cards from
// a single list-view page in one request. Each card is processed through
// the same pipeline as the single endpoint; per-card failures don't
// abort the batch. Gap #1358 (Loxo-Boost-parity bulk capture).
const ExtractProfilesBatchSchema = z.object({
	sourceUrl: z.string().min(1),
	cards: z.array(z.string().min(50)).min(1).max(25),
	force: z.boolean().optional(),
});

recruiterRoutes.post("/extract-profiles/batch", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => null);
	const parsed = ExtractProfilesBatchSchema.safeParse(body);
	if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

	const { sourceUrl, cards, force } = parsed.data;
	const recruiterId = user.sub;

	const items: Array<
		| { ok: true; profile: any; talentPoolCandidate: any; duplicate: boolean }
		| { ok: false; code: string; message: string }
	> = [];

	for (const html of cards) {
		const result = await extractProfileFromHtml(c, { html, sourceUrl, force, recruiterId });
		items.push(result);
	}

	const created = items.filter((r) => r.ok && !r.duplicate).length;
	const duplicates = items.filter((r) => r.ok && r.duplicate).length;
	const failed = items.filter((r) => !r.ok).length;

	return c.json(
		success({
			total: items.length,
			created,
			duplicates,
			failed,
			items,
		}),
		201,
	);
});

// ─── Match Scoring ───────────────────────────────────────────────────────────

// POST /match/score-candidates — score all recruiter's candidates against a job
recruiterRoutes.post("/match/score-candidates", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => ({}));
	const jobId = body.jobId;
	if (!jobId) return c.json(error("VALIDATION_ERROR", "jobId is required"), 400);

	const db = getDb();

	// Count how many candidates will be scored
	const candidates = await db
		.select({ id: schema.talentPoolCandidates.id })
		.from(schema.talentPoolCandidates)
		.where(
			and(
				eq(schema.talentPoolCandidates.recruiterId, user.sub),
				eq(schema.talentPoolCandidates.status, "active"),
			),
		);

	// Enqueue the scoring job
	const [queueEntry] = await db.insert(schema.queueJobToProcess).values({
		type: "recruiter_score_candidates",
		payload: { recruiterId: user.sub, jobId },
		priority: 1,
	} as any).returning();

	return c.json(success({
		queueId: queueEntry.id,
		candidateCount: candidates.length,
	}), 202);
});

// POST /match/score-jobs — score a candidate against all recruiter's active jobs
recruiterRoutes.post("/match/score-jobs", async (c) => {
	const user = c.get("user");
	const body = await c.req.json().catch(() => ({}));
	const candidateId = body.candidateId;
	if (!candidateId) return c.json(error("VALIDATION_ERROR", "candidateId is required"), 400);

	const db = getDb();

	// Enqueue the scoring job
	const [queueEntry] = await db.insert(schema.queueJobToProcess).values({
		type: "recruiter_score_jobs",
		payload: { recruiterId: user.sub, candidateId },
		priority: 1,
	} as any).returning();

	return c.json(success({ queueId: queueEntry.id }), 202);
});

// GET /match/scores — retrieve cached match scores
recruiterRoutes.get("/match/scores", async (c) => {
	const user = c.get("user");
	const jobId = c.req.query("jobId");
	const candidateId = c.req.query("candidateId");
	const db = getDb();

	let condition = eq(schema.recruiterMatchScores.recruiterId, user.sub);
	if (jobId) {
		condition = and(condition, eq(schema.recruiterMatchScores.jobId, jobId))!;
	}
	if (candidateId) {
		condition = and(condition, eq(schema.recruiterMatchScores.candidateId, candidateId))!;
	}

	const scores = await db
		.select()
		.from(schema.recruiterMatchScores)
		.where(condition)
		.orderBy(desc(schema.recruiterMatchScores.score))
		.limit(200);

	return c.json(success({
		scores: scores.map((s) => ({
			id: s.id,
			jobId: s.jobId,
			candidateId: s.candidateId,
			candidateName: s.candidateName,
			jobTitle: s.jobTitle,
			score: s.score,
			recommendations: s.recommendations,
			scoredAt: s.scoredAt.toISOString(),
		})),
	}));
});

// ─── Pipeline ────────────────────────────────────────────────────────────────
// GET /pipeline — aggregated kanban view grouped by submission status

recruiterRoutes.get("/pipeline", async (c) => {
	const user = c.get("user");
	const db = getDb();

	const submissions = await db
		.select()
		.from(schema.candidateSubmissions)
		.where(eq(schema.candidateSubmissions.recruiterId, user.sub))
		.orderBy(desc(schema.candidateSubmissions.updatedAt));

	// Group by status into pipeline stages
	const stageMap: Record<string, string> = {
		"Submitted": "sourced",
		"Reviewed": "contacted",
		"Screening": "screening",
		"Phone Screen": "screening",
		"Interview": "interview",
		"Technical Interview": "interview",
		"Final Interview": "interview",
		"Offer": "offer",
		"Offer Extended": "offer",
		"Accepted": "placed",
		"Placed": "placed",
		"Started": "placed",
	};

	const stages: Record<string, any[]> = {
		sourced: [],
		contacted: [],
		screening: [],
		interview: [],
		offer: [],
		placed: [],
	};

	for (const sub of submissions) {
		const stage = stageMap[sub.status] || "sourced";
		// Look up match score if available
		const [score] = sub.jobId
			? await db
					.select({ score: schema.recruiterMatchScores.score })
					.from(schema.recruiterMatchScores)
					.where(
						and(
							eq(schema.recruiterMatchScores.recruiterId, user.sub),
							eq(schema.recruiterMatchScores.jobId, sub.jobId),
							eq(schema.recruiterMatchScores.candidateId, sub.candidateId),
						),
					)
					.limit(1)
			: [undefined];

		stages[stage].push({
			id: sub.id,
			candidateId: sub.candidateId,
			candidateName: sub.candidateName,
			candidateEmail: sub.candidateEmail,
			jobId: sub.jobId,
			jobTitle: sub.jobTitle,
			companyName: sub.companyName,
			status: sub.status,
			score: score?.score ?? null,
			submittedAt: sub.submittedAt.toISOString(),
			updatedAt: sub.updatedAt.toISOString(),
		});
	}

	return c.json(success({ stages }));
});

// ─── Recruiter Lists (gap #1360) ─────────────────────────────────────────
// Recruiter-scoped collections of candidates distinct from a job's
// pipeline. `kind` is 'list' or 'call_queue'. Mounted at /lists.

const RecruiterListSchema = z.object({
	name: z.string().min(1).max(255),
	description: z.string().optional(),
	kind: z.enum(["list", "call_queue"]).default("list"),
});

recruiterRoutes.post("/lists", async (c) => {
	const user = c.get("user");
	const parsed = RecruiterListSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid list", parsed.error.flatten()), 400);

	const [row] = await getDb().insert(schema.recruiterLists).values({
		recruiterId: user.sub,
		name: parsed.data.name,
		description: parsed.data.description,
		kind: parsed.data.kind,
	} as any).returning();
	return c.json(success(row), 201);
});

recruiterRoutes.get("/lists", async (c) => {
	const user = c.get("user");
	const rows = await getDb()
		.select()
		.from(schema.recruiterLists)
		.where(eq(schema.recruiterLists.recruiterId, user.sub))
		.orderBy(desc(schema.recruiterLists.updatedAt));
	return c.json(success(rows));
});

recruiterRoutes.delete("/lists/:id", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const [row] = await db
		.select({ recruiterId: schema.recruiterLists.recruiterId })
		.from(schema.recruiterLists)
		.where(eq(schema.recruiterLists.id, c.req.param("id")))
		.limit(1);
	if (!row || row.recruiterId !== user.sub) return c.json(error("NOT_FOUND", "List not found"), 404);
	await db.delete(schema.recruiterLists).where(eq(schema.recruiterLists.id, c.req.param("id")));
	return c.json(success({ deleted: true }));
});

recruiterRoutes.post("/lists/:id/members", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const body = await c.req.json().catch(() => ({}));
	const candidateId = String(body?.talentPoolCandidateId ?? "");
	if (!candidateId) return c.json(error("VALIDATION_ERROR", "talentPoolCandidateId required"), 400);

	const [list] = await db
		.select({ recruiterId: schema.recruiterLists.recruiterId })
		.from(schema.recruiterLists)
		.where(eq(schema.recruiterLists.id, c.req.param("id")))
		.limit(1);
	if (!list || list.recruiterId !== user.sub) return c.json(error("NOT_FOUND", "List not found"), 404);

	// Idempotent: ignore unique-constraint conflicts on (list_id, candidate_id).
	try {
		const [row] = await db.insert(schema.recruiterListMembers).values({
			listId: c.req.param("id"),
			talentPoolCandidateId: candidateId,
		} as any).returning();
		return c.json(success(row), 201);
	} catch {
		return c.json(success({ duplicate: true }), 200);
	}
});

recruiterRoutes.get("/lists/:id/members", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const [list] = await db
		.select({ recruiterId: schema.recruiterLists.recruiterId })
		.from(schema.recruiterLists)
		.where(eq(schema.recruiterLists.id, c.req.param("id")))
		.limit(1);
	if (!list || list.recruiterId !== user.sub) return c.json(error("NOT_FOUND", "List not found"), 404);

	const rows = await db
		.select({
			id: schema.recruiterListMembers.id,
			talentPoolCandidateId: schema.recruiterListMembers.talentPoolCandidateId,
			position: schema.recruiterListMembers.position,
			addedAt: schema.recruiterListMembers.addedAt,
			candidateName: schema.talentPoolCandidates.candidateName,
			candidateTitle: schema.talentPoolCandidates.candidateTitle,
			currentCompany: schema.talentPoolCandidates.currentCompany,
			candidateEmail: schema.talentPoolCandidates.candidateEmail,
		})
		.from(schema.recruiterListMembers)
		.leftJoin(
			schema.talentPoolCandidates,
			eq(schema.recruiterListMembers.talentPoolCandidateId, schema.talentPoolCandidates.id),
		)
		.where(eq(schema.recruiterListMembers.listId, c.req.param("id")))
		.orderBy(schema.recruiterListMembers.position);
	return c.json(success(rows));
});

recruiterRoutes.delete("/lists/:id/members/:memberId", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const [list] = await db
		.select({ recruiterId: schema.recruiterLists.recruiterId })
		.from(schema.recruiterLists)
		.where(eq(schema.recruiterLists.id, c.req.param("id")))
		.limit(1);
	if (!list || list.recruiterId !== user.sub) return c.json(error("NOT_FOUND", "List not found"), 404);

	await db
		.delete(schema.recruiterListMembers)
		.where(eq(schema.recruiterListMembers.id, c.req.param("memberId")));
	return c.json(success({ deleted: true }));
});

// ─── Recruiter Outreach Sequences (gap #1357) ────────────────────────────

const OutreachStepSchema = z.object({
	channel: z.enum(["email", "message", "sms"]),
	delayDays: z.number().int().min(0).max(365),
	subject: z.string().optional(),
	body: z.string().min(1),
	// Opt this step into AI personalization at send time (processRecruiterOutreach).
	aiPersonalize: z.boolean().optional(),
});

const OutreachSequenceSchema = z.object({
	name: z.string().min(1).max(255),
	description: z.string().optional(),
	steps: z.array(OutreachStepSchema).min(1).max(10),
	isActive: z.boolean().optional(),
});

recruiterRoutes.post("/sequences", async (c) => {
	const user = c.get("user");
	const parsed = OutreachSequenceSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid sequence", parsed.error.flatten()), 400);

	const [row] = await getDb().insert(schema.recruiterOutreachSequences).values({
		recruiterId: user.sub,
		name: parsed.data.name,
		description: parsed.data.description,
		steps: parsed.data.steps,
		isActive: parsed.data.isActive ?? true,
	} as any).returning();
	return c.json(success(row), 201);
});

recruiterRoutes.get("/sequences", async (c) => {
	const user = c.get("user");
	const rows = await getDb()
		.select()
		.from(schema.recruiterOutreachSequences)
		.where(eq(schema.recruiterOutreachSequences.recruiterId, user.sub))
		.orderBy(desc(schema.recruiterOutreachSequences.updatedAt));
	return c.json(success(rows));
});

recruiterRoutes.delete("/sequences/:id", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const [row] = await db
		.select({ recruiterId: schema.recruiterOutreachSequences.recruiterId })
		.from(schema.recruiterOutreachSequences)
		.where(eq(schema.recruiterOutreachSequences.id, c.req.param("id")))
		.limit(1);
	if (!row || row.recruiterId !== user.sub) return c.json(error("NOT_FOUND", "Sequence not found"), 404);
	await db
		.delete(schema.recruiterOutreachSequences)
		.where(eq(schema.recruiterOutreachSequences.id, c.req.param("id")));
	return c.json(success({ deleted: true }));
});

// Enroll a candidate into a sequence. First step's `nextSendAt` is
// computed from `delayDays` on step 0; subsequent steps are scheduled by
// the worker that processes due enrollments (out of scope for this pass —
// tracked as residual gap).
recruiterRoutes.post("/sequences/:id/enroll", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const body = await c.req.json().catch(() => ({}));
	const candidateId = String(body?.talentPoolCandidateId ?? "");
	if (!candidateId) return c.json(error("VALIDATION_ERROR", "talentPoolCandidateId required"), 400);

	const [seq] = await db
		.select()
		.from(schema.recruiterOutreachSequences)
		.where(eq(schema.recruiterOutreachSequences.id, c.req.param("id")))
		.limit(1);
	if (!seq || seq.recruiterId !== user.sub) return c.json(error("NOT_FOUND", "Sequence not found"), 404);

	const firstStep = (seq.steps as any[])[0] ?? { delayDays: 0 };
	const nextSendAt = new Date(Date.now() + (firstStep.delayDays ?? 0) * 86_400_000);

	try {
		const [row] = await db.insert(schema.recruiterOutreachEnrollments).values({
			sequenceId: c.req.param("id"),
			recruiterId: user.sub,
			talentPoolCandidateId: candidateId,
			status: "active",
			currentStep: 0,
			nextSendAt,
		} as any).returning();
		return c.json(success(row), 201);
	} catch {
		return c.json(success({ duplicate: true }), 200);
	}
});

recruiterRoutes.get("/sequences/:id/enrollments", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const [seq] = await db
		.select({ recruiterId: schema.recruiterOutreachSequences.recruiterId })
		.from(schema.recruiterOutreachSequences)
		.where(eq(schema.recruiterOutreachSequences.id, c.req.param("id")))
		.limit(1);
	if (!seq || seq.recruiterId !== user.sub) return c.json(error("NOT_FOUND", "Sequence not found"), 404);

	const rows = await db
		.select()
		.from(schema.recruiterOutreachEnrollments)
		.where(eq(schema.recruiterOutreachEnrollments.sequenceId, c.req.param("id")))
		.orderBy(desc(schema.recruiterOutreachEnrollments.enrolledAt));
	return c.json(success(rows));
});
