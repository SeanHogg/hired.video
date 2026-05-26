// candidates.ts — Agency recruiting routes backing the week-1 MVP of
// gap #99. Three logical sections:
//
//   1. candidate_resumes      — recruiter-owned resume records with a
//                                variant tree (parent_id) and one active
//                                descendant per candidate.
//   2. redaction_profiles     — reusable per-company PII-stripping rules.
//   3. candidate_resume_shares — tokenized branded + redacted public
//                                share links, plus the unauthenticated
//                                view endpoint that applies redaction +
//                                brand overlay at render time.
//
// Pitch deck routes (sibling surface) live in `pitch-decks.ts`. Both
// files share the company-scope helper in `services/company-scope.ts`.

import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  resolveCompanyScope,
  userCanAccessCompany,
} from "../services/company/scope.js";
import {
  applyRedaction,
  DEFAULT_REDACTION_RULES,
  type RedactionRules,
} from "../services/resume/redaction.js";

export const candidatesRoutes = new Hono<AppEnv>();
// Public share route — mounted separately at /api/public/candidate-resume
// so it can skip auth middleware.
export const candidateResumePublicRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function generateShareToken(): string {
  return randomBytes(16).toString("hex"); // 32-char hex, fits varchar(64).
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateCandidateResumeSchema = z.object({
  companyId: UuidLikeSchema,
  talentPoolCandidateId: UuidLikeSchema.optional(),
  linkedUserId: UuidLikeSchema.optional(),
  mergedFromUserResumeId: UuidLikeSchema.optional(),
  parentId: UuidLikeSchema.optional(),
  label: z.string().max(255).optional(),
  content: z.record(z.string(), z.unknown()).default({}),
  recruiterNotes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const UpdateCandidateResumeSchema = z.object({
  label: z.string().max(255).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  recruiterNotes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const CreateRedactionProfileSchema = z.object({
  companyId: UuidLikeSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  hideName: z.boolean().optional(),
  hideEmail: z.boolean().optional(),
  hidePhone: z.boolean().optional(),
  hideAddress: z.boolean().optional(),
  hideLinkedin: z.boolean().optional(),
  hideOtherUrls: z.boolean().optional(),
  hideAvatar: z.boolean().optional(),
  replacementName: z.string().max(100).optional(),
  hideCompanyNames: z.boolean().optional(),
  hideSchoolNames: z.boolean().optional(),
  extraStripPaths: z.array(z.string()).optional(),
});

const UpdateRedactionProfileSchema = CreateRedactionProfileSchema.omit({
  companyId: true,
}).partial();

const CreateShareSchema = z.object({
  companyId: UuidLikeSchema,
  candidateResumeId: UuidLikeSchema,
  redactionProfileId: UuidLikeSchema.optional(),
  whitelabelTenantId: UuidLikeSchema.optional(),
  name: z.string().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().optional(),
});

const UpdateShareSchema = z.object({
  name: z.string().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ─── Scope ───────────────────────────────────────────────────────────────────

/**
 * GET /api/recruit/my-scope — returns the set of companies the caller can
 * recruit on behalf of, plus the whitelabel tenants + redaction profiles
 * attached to each. Used by the recruiter UI on first load to pick a
 * default company for new candidates / shares / decks.
 */
candidatesRoutes.get("/my-scope", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const scope = await resolveCompanyScope(userId);
  if (scope.companyIds.length === 0) {
    return c.json(success({ companies: [], brandKits: [], redactionProfiles: [] }), 200);
  }

  const db = getDb();
  const [companies, brandKits, profiles] = await Promise.all([
    db
      .select({
        id: schema.companyProfiles.id,
        name: schema.companyProfiles.name,
        logoUrl: schema.companyProfiles.logoUrl,
      })
      .from(schema.companyProfiles)
      .where(inArray(schema.companyProfiles.id, scope.companyIds)),
    db
      .select({
        id: schema.whitelabelTenants.id,
        ownerId: schema.whitelabelTenants.ownerId,
        name: schema.whitelabelTenants.name,
        subdomain: schema.whitelabelTenants.subdomain,
        primaryColor: schema.whitelabelTenants.primaryColor,
        logoUrl: schema.whitelabelTenants.logoUrl,
      })
      .from(schema.whitelabelTenants)
      .where(eq(schema.whitelabelTenants.ownerId, userId)),
    db
      .select()
      .from(schema.redactionProfiles)
      .where(inArray(schema.redactionProfiles.companyId, scope.companyIds)),
  ]);

  return c.json(
    success({
      primaryCompanyId: scope.primaryCompanyId,
      companies,
      brandKits,
      redactionProfiles: profiles,
    }),
    200,
  );
});

// ─── candidate_resumes ───────────────────────────────────────────────────────

/** GET /api/recruit/candidates — list candidate resumes for the caller's scope */
candidatesRoutes.get("/candidates", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const scope = await resolveCompanyScope(userId, c.req.query("companyId"));
  if (scope.companyIds.length === 0) return c.json(success([]), 200);

  const companyFilter = c.req.query("companyId");
  const talentPoolCandidateId = c.req.query("talentPoolCandidateId");
  const activeOnly = c.req.query("activeOnly") === "true";

  const db = getDb();
  const conditions = [];
  if (companyFilter) {
    if (!scope.companyIds.includes(companyFilter)) {
      return c.json(error("FORBIDDEN", "Access denied"), 403);
    }
    conditions.push(eq(schema.candidateResumes.companyId, companyFilter));
  } else {
    conditions.push(inArray(schema.candidateResumes.companyId, scope.companyIds));
  }
  if (talentPoolCandidateId) {
    conditions.push(eq(schema.candidateResumes.talentPoolCandidateId, talentPoolCandidateId));
  }
  if (activeOnly) conditions.push(eq(schema.candidateResumes.isActive, true));

  const rows = await db
    .select()
    .from(schema.candidateResumes)
    .where(and(...conditions))
    .orderBy(desc(schema.candidateResumes.updatedAt));

  return c.json(success(rows), 200);
});

/** GET /api/recruit/candidates/:id — get one resume */
candidatesRoutes.get("/candidates/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.candidateResumes)
    .where(eq(schema.candidateResumes.id, c.req.param("id")))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Candidate resume not found"), 404);

  if (!(await userCanAccessCompany(userId, row.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  return c.json(success(row), 200);
});

/**
 * POST /api/recruit/candidates — create a new candidate resume (root or variant).
 * If `parentId` is provided, the new row becomes a variant of that parent; the
 * parent must belong to the same company. If `isActive: true` is set, any
 * currently-active sibling for the same talent_pool_candidate is flipped to
 * inactive inside the same transaction (see /activate for the explicit flow).
 */
candidatesRoutes.post("/candidates", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateCandidateResumeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const db = getDb();

  // If parent is specified, confirm it belongs to the same company.
  if (parsed.data.parentId) {
    const [parent] = await db
      .select({ companyId: schema.candidateResumes.companyId })
      .from(schema.candidateResumes)
      .where(eq(schema.candidateResumes.id, parsed.data.parentId))
      .limit(1);
    if (!parent || parent.companyId !== parsed.data.companyId) {
      return c.json(error("VALIDATION_ERROR", "parentId does not belong to this company"), 400);
    }
  }

  const [row] = await db
    .insert(schema.candidateResumes)
    .values({
      companyId: parsed.data.companyId,
      importedByUserId: userId,
      talentPoolCandidateId: parsed.data.talentPoolCandidateId ?? null,
      linkedUserId: parsed.data.linkedUserId ?? null,
      mergedFromUserResumeId: parsed.data.mergedFromUserResumeId ?? null,
      parentId: parsed.data.parentId ?? null,
      isActive: parsed.data.isActive ?? false,
      label: parsed.data.label ?? null,
      content: parsed.data.content,
      recruiterNotes: parsed.data.recruiterNotes ?? null,
      metadata: (parsed.data.metadata as any) ?? {},
    } as any)
    .returning();

  // If the new row is marked active, deactivate siblings in the same
  // (company, talent_pool_candidate) bucket.
  if (row.isActive && row.talentPoolCandidateId) {
    await db
      .update(schema.candidateResumes)
      .set({ isActive: false, updatedAt: new Date() } as any)
      .where(
        and(
          eq(schema.candidateResumes.companyId, row.companyId),
          eq(schema.candidateResumes.talentPoolCandidateId, row.talentPoolCandidateId),
          eq(schema.candidateResumes.isActive, true),
        ),
      );
    // Re-flip ourselves back on — the bulk update above touches the new row too.
    await db
      .update(schema.candidateResumes)
      .set({ isActive: true, updatedAt: new Date() } as any)
      .where(eq(schema.candidateResumes.id, row.id));
  }

  return c.json(success(row), 201);
});

/**
 * POST /api/recruit/candidates/bulk-csv — bulk-create candidate resumes from
 * a parsed CSV upload. Body: { companyId, rows: [{ name, email, phone, location,
 * linkedinUrl, label, skills }] }. Each row becomes a thin JSON Resume
 * (basics + skills) so it integrates with the existing candidate pipeline.
 *
 * Closes audit gap #1 (CSV import was missing — only JSON-paste worked).
 */
const BulkCsvRowSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  label: z.string().max(200).optional().nullable(),
  skills: z.array(z.string()).optional().nullable(),
});
const BulkCsvSchema = z.object({
  companyId: UuidLikeSchema,
  rows: z.array(BulkCsvRowSchema).min(1).max(500),
});

candidatesRoutes.post("/candidates/bulk-csv", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = BulkCsvSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid CSV payload", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const db = getDb();
  const inserts = parsed.data.rows.map((r) => ({
    companyId: parsed.data.companyId,
    importedByUserId: userId,
    label: r.label ?? r.name,
    content: {
      basics: {
        name: r.name,
        label: r.label ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        location: r.location ? { city: r.location } : null,
        profiles: r.linkedinUrl
          ? [{ network: "LinkedIn", url: r.linkedinUrl }]
          : [],
      },
      skills: (r.skills ?? []).map((s) => ({ name: s })),
    },
    metadata: { source: "csv_import" },
  }));

  const created = await db
    .insert(schema.candidateResumes)
    .values(inserts as any)
    .returning();

  return c.json(success({ created, count: created.length }), 201);
});

/** PATCH /api/recruit/candidates/:id — update resume content/label/notes */
candidatesRoutes.patch("/candidates/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateCandidateResumeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select({ companyId: schema.candidateResumes.companyId })
    .from(schema.candidateResumes)
    .where(eq(schema.candidateResumes.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Candidate resume not found"), 404);
  if (!(await userCanAccessCompany(userId, existing.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const [row] = await db
    .update(schema.candidateResumes)
    .set({
      ...(parsed.data.label !== undefined && { label: parsed.data.label }),
      ...(parsed.data.content !== undefined && { content: parsed.data.content }),
      ...(parsed.data.recruiterNotes !== undefined && { recruiterNotes: parsed.data.recruiterNotes }),
      ...(parsed.data.metadata !== undefined && { metadata: parsed.data.metadata as any }),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.candidateResumes.id, c.req.param("id")))
    .returning();
  return c.json(success(row), 200);
});

/** DELETE /api/recruit/candidates/:id — remove resume (+ child variants cascade) */
candidatesRoutes.delete("/candidates/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [existing] = await db
    .select({ companyId: schema.candidateResumes.companyId })
    .from(schema.candidateResumes)
    .where(eq(schema.candidateResumes.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Candidate resume not found"), 404);
  if (!(await userCanAccessCompany(userId, existing.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  await db
    .delete(schema.candidateResumes)
    .where(eq(schema.candidateResumes.id, c.req.param("id")));
  return c.json(success({ deleted: true }), 200);
});

/**
 * POST /api/recruit/candidates/:id/activate — mark this variant active for its
 * candidate, flipping any currently-active sibling to inactive first.
 */
candidatesRoutes.post("/candidates/:id/activate", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [target] = await db
    .select()
    .from(schema.candidateResumes)
    .where(eq(schema.candidateResumes.id, c.req.param("id")))
    .limit(1);
  if (!target) return c.json(error("NOT_FOUND", "Candidate resume not found"), 404);
  if (!(await userCanAccessCompany(userId, target.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  if (!target.talentPoolCandidateId) {
    return c.json(
      error("VALIDATION_ERROR", "Resume is not linked to a talent_pool_candidate; cannot activate."),
      400,
    );
  }

  // Deactivate any currently-active sibling.
  await db
    .update(schema.candidateResumes)
    .set({ isActive: false, updatedAt: new Date() } as any)
    .where(
      and(
        eq(schema.candidateResumes.companyId, target.companyId),
        eq(schema.candidateResumes.talentPoolCandidateId, target.talentPoolCandidateId),
        eq(schema.candidateResumes.isActive, true),
      ),
    );

  const [row] = await db
    .update(schema.candidateResumes)
    .set({ isActive: true, updatedAt: new Date() } as any)
    .where(eq(schema.candidateResumes.id, target.id))
    .returning();
  return c.json(success(row), 200);
});

// ─── redaction_profiles ──────────────────────────────────────────────────────

candidatesRoutes.get("/redaction-profiles", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const scope = await resolveCompanyScope(userId, c.req.query("companyId"));
  if (scope.companyIds.length === 0) return c.json(success([]), 200);

  const filter = c.req.query("companyId");
  if (filter && !scope.companyIds.includes(filter)) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.redactionProfiles)
    .where(
      filter
        ? eq(schema.redactionProfiles.companyId, filter)
        : inArray(schema.redactionProfiles.companyId, scope.companyIds),
    )
    .orderBy(desc(schema.redactionProfiles.isDefault), desc(schema.redactionProfiles.updatedAt));
  return c.json(success(rows), 200);
});

candidatesRoutes.get("/redaction-profiles/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.redactionProfiles)
    .where(eq(schema.redactionProfiles.id, c.req.param("id")))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Redaction profile not found"), 404);
  if (!(await userCanAccessCompany(userId, row.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  return c.json(success(row), 200);
});

candidatesRoutes.post("/redaction-profiles", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateRedactionProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const db = getDb();

  // If this profile is marked default, unset any other default for this company.
  if (parsed.data.isDefault) {
    await db
      .update(schema.redactionProfiles)
      .set({ isDefault: false, updatedAt: new Date() } as any)
      .where(
        and(
          eq(schema.redactionProfiles.companyId, parsed.data.companyId),
          eq(schema.redactionProfiles.isDefault, true),
        ),
      );
  }

  const [row] = await db
    .insert(schema.redactionProfiles)
    .values({
      companyId: parsed.data.companyId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isDefault: parsed.data.isDefault ?? false,
      hideName: parsed.data.hideName ?? true,
      hideEmail: parsed.data.hideEmail ?? true,
      hidePhone: parsed.data.hidePhone ?? true,
      hideAddress: parsed.data.hideAddress ?? true,
      hideLinkedin: parsed.data.hideLinkedin ?? true,
      hideOtherUrls: parsed.data.hideOtherUrls ?? false,
      hideAvatar: parsed.data.hideAvatar ?? true,
      replacementName: parsed.data.replacementName ?? "Candidate",
      hideCompanyNames: parsed.data.hideCompanyNames ?? false,
      hideSchoolNames: parsed.data.hideSchoolNames ?? false,
      extraStripPaths: parsed.data.extraStripPaths ?? [],
    } as any)
    .returning();
  return c.json(success(row), 201);
});

candidatesRoutes.patch("/redaction-profiles/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateRedactionProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.redactionProfiles)
    .where(eq(schema.redactionProfiles.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Redaction profile not found"), 404);
  if (!(await userCanAccessCompany(userId, existing.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  if (parsed.data.isDefault) {
    await db
      .update(schema.redactionProfiles)
      .set({ isDefault: false, updatedAt: new Date() } as any)
      .where(
        and(
          eq(schema.redactionProfiles.companyId, existing.companyId),
          eq(schema.redactionProfiles.isDefault, true),
        ),
      );
  }

  const [row] = await db
    .update(schema.redactionProfiles)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.isDefault !== undefined && { isDefault: parsed.data.isDefault }),
      ...(parsed.data.hideName !== undefined && { hideName: parsed.data.hideName }),
      ...(parsed.data.hideEmail !== undefined && { hideEmail: parsed.data.hideEmail }),
      ...(parsed.data.hidePhone !== undefined && { hidePhone: parsed.data.hidePhone }),
      ...(parsed.data.hideAddress !== undefined && { hideAddress: parsed.data.hideAddress }),
      ...(parsed.data.hideLinkedin !== undefined && { hideLinkedin: parsed.data.hideLinkedin }),
      ...(parsed.data.hideOtherUrls !== undefined && { hideOtherUrls: parsed.data.hideOtherUrls }),
      ...(parsed.data.hideAvatar !== undefined && { hideAvatar: parsed.data.hideAvatar }),
      ...(parsed.data.replacementName !== undefined && { replacementName: parsed.data.replacementName }),
      ...(parsed.data.hideCompanyNames !== undefined && { hideCompanyNames: parsed.data.hideCompanyNames }),
      ...(parsed.data.hideSchoolNames !== undefined && { hideSchoolNames: parsed.data.hideSchoolNames }),
      ...(parsed.data.extraStripPaths !== undefined && { extraStripPaths: parsed.data.extraStripPaths }),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.redactionProfiles.id, c.req.param("id")))
    .returning();
  return c.json(success(row), 200);
});

candidatesRoutes.delete("/redaction-profiles/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [existing] = await db
    .select({ companyId: schema.redactionProfiles.companyId })
    .from(schema.redactionProfiles)
    .where(eq(schema.redactionProfiles.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Redaction profile not found"), 404);
  if (!(await userCanAccessCompany(userId, existing.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  await db
    .delete(schema.redactionProfiles)
    .where(eq(schema.redactionProfiles.id, c.req.param("id")));
  return c.json(success({ deleted: true }), 200);
});

// ─── candidate_resume_shares ─────────────────────────────────────────────────

candidatesRoutes.get("/shares", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const scope = await resolveCompanyScope(userId, c.req.query("companyId"));
  if (scope.companyIds.length === 0) return c.json(success([]), 200);

  const candidateResumeId = c.req.query("candidateResumeId");

  const db = getDb();
  const conditions = [inArray(schema.candidateResumeShares.companyId, scope.companyIds)];
  if (candidateResumeId) {
    conditions.push(eq(schema.candidateResumeShares.candidateResumeId, candidateResumeId));
  }

  const rows = await db
    .select()
    .from(schema.candidateResumeShares)
    .where(and(...conditions))
    .orderBy(desc(schema.candidateResumeShares.createdAt));
  return c.json(success(rows), 200);
});

candidatesRoutes.post("/shares", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateShareSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const db = getDb();

  // Verify the candidate resume belongs to this company.
  const [cr] = await db
    .select({ companyId: schema.candidateResumes.companyId })
    .from(schema.candidateResumes)
    .where(eq(schema.candidateResumes.id, parsed.data.candidateResumeId))
    .limit(1);
  if (!cr || cr.companyId !== parsed.data.companyId) {
    return c.json(error("VALIDATION_ERROR", "candidateResumeId does not belong to this company"), 400);
  }

  const [row] = await db
    .insert(schema.candidateResumeShares)
    .values({
      companyId: parsed.data.companyId,
      candidateResumeId: parsed.data.candidateResumeId,
      redactionProfileId: parsed.data.redactionProfileId ?? null,
      whitelabelTenantId: parsed.data.whitelabelTenantId ?? null,
      sharedByUserId: userId,
      shareToken: generateShareToken(),
      name: parsed.data.name ?? null,
      recipientEmail: parsed.data.recipientEmail ?? null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      isActive: true,
    } as any)
    .returning();
  return c.json(success(row), 201);
});

candidatesRoutes.patch("/shares/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateShareSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select({ companyId: schema.candidateResumeShares.companyId })
    .from(schema.candidateResumeShares)
    .where(eq(schema.candidateResumeShares.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Share not found"), 404);
  if (!(await userCanAccessCompany(userId, existing.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const [row] = await db
    .update(schema.candidateResumeShares)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.recipientEmail !== undefined && { recipientEmail: parsed.data.recipientEmail }),
      ...(parsed.data.expiresAt !== undefined && {
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      }),
      ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.candidateResumeShares.id, c.req.param("id")))
    .returning();
  return c.json(success(row), 200);
});

candidatesRoutes.delete("/shares/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [existing] = await db
    .select({ companyId: schema.candidateResumeShares.companyId })
    .from(schema.candidateResumeShares)
    .where(eq(schema.candidateResumeShares.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Share not found"), 404);
  if (!(await userCanAccessCompany(userId, existing.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  await db
    .delete(schema.candidateResumeShares)
    .where(eq(schema.candidateResumeShares.id, c.req.param("id")));
  return c.json(success({ revoked: true }), 200);
});

// ─── Public share view (unauthenticated) ─────────────────────────────────────
//
// GET /api/public/candidate-resume/:token — returns the redacted resume
// content + branding metadata for the reviewer UI. Every read increments
// view_count and updates last_viewed_at. Fails closed: expired, inactive,
// or missing shares return 404 (intentionally ambiguous — we never leak
// whether a token once existed).

candidateResumePublicRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");
  if (!token) return c.json(error("NOT_FOUND", "Share not found"), 404);

  const db = getDb();
  const [share] = await db
    .select()
    .from(schema.candidateResumeShares)
    .where(eq(schema.candidateResumeShares.shareToken, token))
    .limit(1);
  if (!share || !share.isActive) return c.json(error("NOT_FOUND", "Share not found"), 404);
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return c.json(error("NOT_FOUND", "Share not found"), 404);
  }

  // Load the candidate resume and the redaction profile (if any) and the
  // whitelabel brand kit (if any). Parallel lookups keep latency low.
  const [[candidateResume], profileRow, brandRow] = await Promise.all([
    db
      .select()
      .from(schema.candidateResumes)
      .where(eq(schema.candidateResumes.id, share.candidateResumeId))
      .limit(1),
    share.redactionProfileId
      ? db
          .select()
          .from(schema.redactionProfiles)
          .where(eq(schema.redactionProfiles.id, share.redactionProfileId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    share.whitelabelTenantId
      ? db
          .select({
            name: schema.whitelabelTenants.name,
            subdomain: schema.whitelabelTenants.subdomain,
            primaryColor: schema.whitelabelTenants.primaryColor,
            logoUrl: schema.whitelabelTenants.logoUrl,
            heroHeadline: schema.whitelabelTenants.heroHeadline,
            website: schema.whitelabelTenants.website,
            contactEmail: schema.whitelabelTenants.contactEmail,
          })
          .from(schema.whitelabelTenants)
          .where(eq(schema.whitelabelTenants.id, share.whitelabelTenantId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  if (!candidateResume) return c.json(error("NOT_FOUND", "Share not found"), 404);

  const rules: RedactionRules = profileRow
    ? {
        hideName: profileRow.hideName,
        hideEmail: profileRow.hideEmail,
        hidePhone: profileRow.hidePhone,
        hideAddress: profileRow.hideAddress,
        hideLinkedin: profileRow.hideLinkedin,
        hideOtherUrls: profileRow.hideOtherUrls,
        hideAvatar: profileRow.hideAvatar,
        replacementName: profileRow.replacementName,
        hideCompanyNames: profileRow.hideCompanyNames,
        hideSchoolNames: profileRow.hideSchoolNames,
        extraStripPaths: (profileRow.extraStripPaths as string[]) ?? [],
      }
    : DEFAULT_REDACTION_RULES;

  const redactedContent = applyRedaction(candidateResume.content as any, rules);

  // Fire-and-forget view counter — don't block the response.
  db.update(schema.candidateResumeShares)
    .set({
      viewCount: (share.viewCount ?? 0) + 1,
      lastViewedAt: new Date(),
    } as any)
    .where(eq(schema.candidateResumeShares.id, share.id))
    .catch(() => {});

  return c.json(
    success({
      share: {
        id: share.id,
        name: share.name,
        createdAt: share.createdAt,
      },
      brand: brandRow,
      content: redactedContent,
    }),
    200,
  );
});
