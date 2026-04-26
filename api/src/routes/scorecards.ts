// scorecards.ts — Structured-hiring scorecards & interview kits.
//
// Mounts:
//   • /api/scorecards/templates       — template + attribute CRUD
//   • /api/scorecards/kits            — interview kit + stage CRUD
//   • /api/scorecards/submissions     — evaluator scorecard submissions
//   • /api/scorecards/debrief         — aggregate roll-up across evaluators
//   • /api/scorecards/decisions       — final hiring decision per application

import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  resolveCompanyScope,
  userCanAccessCompany,
} from "../services/company/scope.js";

export const scorecardRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const RatingScale = z.enum(["1-4", "1-5", "thumbs", "yes-no"]);
const Recommendation = z.enum(["strong_yes", "yes", "no", "strong_no"]);
const Decision = z.enum(["approve", "reject", "hold", "withdraw"]);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const AttributeInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  displayOrder: z.number().int().min(0).default(0),
  weight: z.number().int().min(1).max(10).default(1),
  anchors: z.record(z.string(), z.string()).optional(),
});

const CreateTemplateSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  ratingScale: RatingScale.default("1-4"),
  roleFamily: z.string().max(100).optional(),
  attributes: z.array(AttributeInputSchema).min(1).max(20),
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  ratingScale: RatingScale.optional(),
  roleFamily: z.string().max(100).nullable().optional(),
  isArchived: z.boolean().optional(),
});

const StageInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  displayOrder: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(5).max(480).default(60),
  suggestedQuestions: z.array(z.string()).optional(),
  scorecardTemplateId: z.string().uuid().optional(),
});

const CreateKitSchema = z.object({
  companyId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  stages: z.array(StageInputSchema).min(1).max(15),
});

const UpdateKitSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  isArchived: z.boolean().optional(),
});

const RatingInputSchema = z.object({
  attributeId: z.string().uuid(),
  rating: z.number().int().min(0).max(10).nullable(),
  notes: z.string().max(2000).optional(),
});

const CreateSubmissionSchema = z.object({
  templateId: z.string().uuid(),
  applicationId: z.string().min(1),
  interviewId: z.string().uuid().optional(),
  kitStageId: z.string().uuid().optional(),
  candidateUserId: z.string().uuid().optional(),
  ratings: z.array(RatingInputSchema).optional(),
  overallRecommendation: Recommendation.optional(),
  summary: z.string().max(5000).optional(),
  strengths: z.string().max(5000).optional(),
  concerns: z.string().max(5000).optional(),
});

const UpdateSubmissionSchema = z.object({
  ratings: z.array(RatingInputSchema).optional(),
  overallRecommendation: Recommendation.optional(),
  summary: z.string().max(5000).nullable().optional(),
  strengths: z.string().max(5000).nullable().optional(),
  concerns: z.string().max(5000).nullable().optional(),
});

const CreateDecisionSchema = z.object({
  companyId: z.string().uuid(),
  applicationId: z.string().min(1),
  jobId: z.string().uuid().optional(),
  candidateUserId: z.string().uuid().optional(),
  decision: Decision,
  reason: z.string().max(2000).optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadTemplateOrFail(c: any, id: string) {
  const db = getDb();
  const [tpl] = await db
    .select()
    .from(schema.scorecardTemplates)
    .where(eq(schema.scorecardTemplates.id, id))
    .limit(1);
  if (!tpl) {
    c.status(404);
    return { error: c.json(error("NOT_FOUND", "Template not found"), 404) } as const;
  }
  const userId = uid(c);
  if (!userId || !(await userCanAccessCompany(userId, tpl.companyId))) {
    return { error: c.json(error("FORBIDDEN", "No access to this template"), 403) } as const;
  }
  return { tpl } as const;
}

async function loadKitOrFail(c: any, id: string) {
  const db = getDb();
  const [kit] = await db
    .select()
    .from(schema.interviewKits)
    .where(eq(schema.interviewKits.id, id))
    .limit(1);
  if (!kit) {
    return { error: c.json(error("NOT_FOUND", "Kit not found"), 404) } as const;
  }
  const userId = uid(c);
  if (!userId || !(await userCanAccessCompany(userId, kit.companyId))) {
    return { error: c.json(error("FORBIDDEN", "No access to this kit"), 403) } as const;
  }
  return { kit } as const;
}

/**
 * Compute a 0-100 weighted overall score from rating inputs given the
 * template's attributes and rating scale. Returns null if the inputs are
 * empty or all null.
 */
function computeOverallScore(
  attributes: { id: string; weight: number }[],
  ratings: { attributeId: string; rating: number | null }[],
  ratingScale: string,
): number | null {
  const max =
    ratingScale === "1-4" ? 4 :
    ratingScale === "1-5" ? 5 :
    ratingScale === "thumbs" ? 1 :
    ratingScale === "yes-no" ? 1 : 4;
  let weighted = 0;
  let totalWeight = 0;
  for (const attr of attributes) {
    const r = ratings.find((x) => x.attributeId === attr.id);
    if (!r || r.rating === null || r.rating === undefined) continue;
    weighted += (r.rating / max) * attr.weight;
    totalWeight += attr.weight;
  }
  if (totalWeight === 0) return null;
  return Math.round((weighted / totalWeight) * 100);
}

// ─── Templates ──────────────────────────────────────────────────────────────

scorecardRoutes.get("/templates", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const scope = await resolveCompanyScope(userId, c.req.query("companyId"));
  if (scope.companyIds.length === 0) return c.json(success([]));

  const db = getDb();
  const filter = c.req.query("companyId");
  const where =
    filter && scope.companyIds.includes(filter)
      ? eq(schema.scorecardTemplates.companyId, filter)
      : inArray(schema.scorecardTemplates.companyId, scope.companyIds);

  const rows = await db
    .select()
    .from(schema.scorecardTemplates)
    .where(and(where, eq(schema.scorecardTemplates.isArchived, false)))
    .orderBy(desc(schema.scorecardTemplates.updatedAt));
  return c.json(success(rows));
});

scorecardRoutes.get("/templates/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const r = await loadTemplateOrFail(c, c.req.param("id"));
  if ("error" in r) return r.error;

  const db = getDb();
  const attrs = await db
    .select()
    .from(schema.scorecardAttributes)
    .where(eq(schema.scorecardAttributes.templateId, r.tpl.id))
    .orderBy(asc(schema.scorecardAttributes.displayOrder));
  return c.json(success({ ...r.tpl, attributes: attrs }));
});

scorecardRoutes.post("/templates", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "No access to this company"), 403);
  }

  const db = getDb();
  const [tpl] = await db
    .insert(schema.scorecardTemplates)
    .values({
      companyId: parsed.data.companyId,
      createdByUserId: userId,
      name: parsed.data.name,
      description: parsed.data.description,
      ratingScale: parsed.data.ratingScale,
      roleFamily: parsed.data.roleFamily,
    } as any)
    .returning();

  const attrs = await db
    .insert(schema.scorecardAttributes)
    .values(
      parsed.data.attributes.map((a, i) => ({
        templateId: tpl.id,
        name: a.name,
        description: a.description,
        displayOrder: a.displayOrder ?? i,
        weight: a.weight ?? 1,
        anchors: a.anchors as any,
      })) as any,
    )
    .returning();

  return c.json(success({ ...tpl, attributes: attrs }), 201);
});

scorecardRoutes.patch("/templates/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const r = await loadTemplateOrFail(c, c.req.param("id"));
  if ("error" in r) return r.error;

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.scorecardTemplates)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(schema.scorecardTemplates.id, r.tpl.id))
    .returning();
  return c.json(success(updated));
});

scorecardRoutes.post("/templates/:id/attributes", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const r = await loadTemplateOrFail(c, c.req.param("id"));
  if ("error" in r) return r.error;

  const body = await c.req.json().catch(() => null);
  const parsed = AttributeInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [attr] = await db
    .insert(schema.scorecardAttributes)
    .values({
      templateId: r.tpl.id,
      name: parsed.data.name,
      description: parsed.data.description,
      displayOrder: parsed.data.displayOrder ?? 0,
      weight: parsed.data.weight ?? 1,
      anchors: parsed.data.anchors as any,
    } as any)
    .returning();
  return c.json(success(attr), 201);
});

scorecardRoutes.patch("/attributes/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [attr] = await db
    .select()
    .from(schema.scorecardAttributes)
    .where(eq(schema.scorecardAttributes.id, c.req.param("id")))
    .limit(1);
  if (!attr) return c.json(error("NOT_FOUND", "Attribute not found"), 404);
  const r = await loadTemplateOrFail(c, attr.templateId);
  if ("error" in r) return r.error;

  const body = await c.req.json().catch(() => ({}));
  const parsed = AttributeInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }

  const [updated] = await db
    .update(schema.scorecardAttributes)
    .set(parsed.data as any)
    .where(eq(schema.scorecardAttributes.id, attr.id))
    .returning();
  return c.json(success(updated));
});

scorecardRoutes.delete("/attributes/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [attr] = await db
    .select()
    .from(schema.scorecardAttributes)
    .where(eq(schema.scorecardAttributes.id, c.req.param("id")))
    .limit(1);
  if (!attr) return c.json(error("NOT_FOUND", "Attribute not found"), 404);
  const r = await loadTemplateOrFail(c, attr.templateId);
  if ("error" in r) return r.error;

  await db
    .delete(schema.scorecardAttributes)
    .where(eq(schema.scorecardAttributes.id, attr.id));
  return c.json(success({ id: attr.id }));
});

// ─── Interview Kits ─────────────────────────────────────────────────────────

scorecardRoutes.get("/kits", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const scope = await resolveCompanyScope(userId, c.req.query("companyId"));
  if (scope.companyIds.length === 0) return c.json(success([]));

  const db = getDb();
  const filter = c.req.query("companyId");
  const jobFilter = c.req.query("jobId");
  const where = and(
    filter && scope.companyIds.includes(filter)
      ? eq(schema.interviewKits.companyId, filter)
      : inArray(schema.interviewKits.companyId, scope.companyIds),
    eq(schema.interviewKits.isArchived, false),
    jobFilter ? eq(schema.interviewKits.jobId, jobFilter) : undefined,
  );

  const rows = await db
    .select()
    .from(schema.interviewKits)
    .where(where)
    .orderBy(desc(schema.interviewKits.updatedAt));
  return c.json(success(rows));
});

scorecardRoutes.get("/kits/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const r = await loadKitOrFail(c, c.req.param("id"));
  if ("error" in r) return r.error;

  const db = getDb();
  const stages = await db
    .select()
    .from(schema.interviewKitStages)
    .where(eq(schema.interviewKitStages.kitId, r.kit.id))
    .orderBy(asc(schema.interviewKitStages.displayOrder));
  return c.json(success({ ...r.kit, stages }));
});

scorecardRoutes.post("/kits", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateKitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "No access to this company"), 403);
  }

  const db = getDb();
  const [kit] = await db
    .insert(schema.interviewKits)
    .values({
      companyId: parsed.data.companyId,
      jobId: parsed.data.jobId,
      createdByUserId: userId,
      name: parsed.data.name,
      description: parsed.data.description,
    } as any)
    .returning();

  const stages = await db
    .insert(schema.interviewKitStages)
    .values(
      parsed.data.stages.map((s, i) => ({
        kitId: kit.id,
        name: s.name,
        description: s.description,
        displayOrder: s.displayOrder ?? i,
        durationMinutes: s.durationMinutes ?? 60,
        suggestedQuestions: s.suggestedQuestions as any,
        scorecardTemplateId: s.scorecardTemplateId,
      })) as any,
    )
    .returning();

  return c.json(success({ ...kit, stages }), 201);
});

scorecardRoutes.patch("/kits/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const r = await loadKitOrFail(c, c.req.param("id"));
  if ("error" in r) return r.error;

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateKitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.interviewKits)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(schema.interviewKits.id, r.kit.id))
    .returning();
  return c.json(success(updated));
});

scorecardRoutes.post("/kits/:id/stages", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const r = await loadKitOrFail(c, c.req.param("id"));
  if ("error" in r) return r.error;

  const body = await c.req.json().catch(() => null);
  const parsed = StageInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [stage] = await db
    .insert(schema.interviewKitStages)
    .values({
      kitId: r.kit.id,
      name: parsed.data.name,
      description: parsed.data.description,
      displayOrder: parsed.data.displayOrder ?? 0,
      durationMinutes: parsed.data.durationMinutes ?? 60,
      suggestedQuestions: parsed.data.suggestedQuestions as any,
      scorecardTemplateId: parsed.data.scorecardTemplateId,
    } as any)
    .returning();
  return c.json(success(stage), 201);
});

scorecardRoutes.patch("/stages/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [stage] = await db
    .select()
    .from(schema.interviewKitStages)
    .where(eq(schema.interviewKitStages.id, c.req.param("id")))
    .limit(1);
  if (!stage) return c.json(error("NOT_FOUND", "Stage not found"), 404);
  const r = await loadKitOrFail(c, stage.kitId);
  if ("error" in r) return r.error;

  const body = await c.req.json().catch(() => ({}));
  const parsed = StageInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  const [updated] = await db
    .update(schema.interviewKitStages)
    .set(parsed.data as any)
    .where(eq(schema.interviewKitStages.id, stage.id))
    .returning();
  return c.json(success(updated));
});

scorecardRoutes.delete("/stages/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [stage] = await db
    .select()
    .from(schema.interviewKitStages)
    .where(eq(schema.interviewKitStages.id, c.req.param("id")))
    .limit(1);
  if (!stage) return c.json(error("NOT_FOUND", "Stage not found"), 404);
  const r = await loadKitOrFail(c, stage.kitId);
  if ("error" in r) return r.error;

  await db
    .delete(schema.interviewKitStages)
    .where(eq(schema.interviewKitStages.id, stage.id));
  return c.json(success({ id: stage.id }));
});

// ─── Submissions ────────────────────────────────────────────────────────────

scorecardRoutes.get("/submissions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const applicationId = c.req.query("applicationId");
  const interviewId = c.req.query("interviewId");
  if (!applicationId && !interviewId) {
    return c.json(error("VALIDATION_ERROR", "applicationId or interviewId required"), 400);
  }

  const db = getDb();
  const where = applicationId
    ? eq(schema.scorecardSubmissions.applicationId, applicationId)
    : eq(schema.scorecardSubmissions.interviewId, interviewId!);

  const subs = await db
    .select()
    .from(schema.scorecardSubmissions)
    .where(where)
    .orderBy(desc(schema.scorecardSubmissions.updatedAt));

  // Authorise via the submission's template -> companyId. If user can't
  // access ANY of the templates in scope, return empty list.
  const tplIds = Array.from(new Set(subs.map((s) => s.templateId)));
  if (tplIds.length === 0) return c.json(success([]));
  const tpls = await db
    .select({ id: schema.scorecardTemplates.id, companyId: schema.scorecardTemplates.companyId })
    .from(schema.scorecardTemplates)
    .where(inArray(schema.scorecardTemplates.id, tplIds));
  const allowedCompanyIds: string[] = [];
  for (const t of tpls) {
    if (await userCanAccessCompany(userId, t.companyId)) allowedCompanyIds.push(t.id);
  }
  const visible = subs.filter((s) => allowedCompanyIds.includes(s.templateId));
  return c.json(success(visible));
});

scorecardRoutes.get("/submissions/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [sub] = await db
    .select()
    .from(schema.scorecardSubmissions)
    .where(eq(schema.scorecardSubmissions.id, c.req.param("id")))
    .limit(1);
  if (!sub) return c.json(error("NOT_FOUND", "Submission not found"), 404);
  const r = await loadTemplateOrFail(c, sub.templateId);
  if ("error" in r) return r.error;

  const ratings = await db
    .select()
    .from(schema.scorecardSubmissionRatings)
    .where(eq(schema.scorecardSubmissionRatings.submissionId, sub.id));
  return c.json(success({ ...sub, ratings }));
});

scorecardRoutes.post("/submissions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }

  const r = await loadTemplateOrFail(c, parsed.data.templateId);
  if ("error" in r) return r.error;

  const db = getDb();
  const [sub] = await db
    .insert(schema.scorecardSubmissions)
    .values({
      templateId: parsed.data.templateId,
      interviewId: parsed.data.interviewId,
      kitStageId: parsed.data.kitStageId,
      applicationId: parsed.data.applicationId,
      candidateUserId: parsed.data.candidateUserId,
      evaluatorUserId: userId,
      overallRecommendation: parsed.data.overallRecommendation,
      summary: parsed.data.summary,
      strengths: parsed.data.strengths,
      concerns: parsed.data.concerns,
      status: "draft",
    } as any)
    .returning();

  if (parsed.data.ratings && parsed.data.ratings.length > 0) {
    await db.insert(schema.scorecardSubmissionRatings).values(
      parsed.data.ratings.map((rt) => ({
        submissionId: sub.id,
        attributeId: rt.attributeId,
        rating: rt.rating ?? null,
        notes: rt.notes,
      })) as any,
    );
  }
  return c.json(success(sub), 201);
});

scorecardRoutes.patch("/submissions/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [sub] = await db
    .select()
    .from(schema.scorecardSubmissions)
    .where(eq(schema.scorecardSubmissions.id, c.req.param("id")))
    .limit(1);
  if (!sub) return c.json(error("NOT_FOUND", "Submission not found"), 404);
  if (sub.evaluatorUserId !== userId) {
    return c.json(error("FORBIDDEN", "Only the evaluator can edit this submission"), 403);
  }
  if (sub.status === "submitted") {
    return c.json(error("CONFLICT", "Submitted scorecards cannot be edited"), 409);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }

  const updates: any = { updatedAt: new Date() };
  if (parsed.data.overallRecommendation !== undefined)
    updates.overallRecommendation = parsed.data.overallRecommendation;
  if (parsed.data.summary !== undefined) updates.summary = parsed.data.summary;
  if (parsed.data.strengths !== undefined) updates.strengths = parsed.data.strengths;
  if (parsed.data.concerns !== undefined) updates.concerns = parsed.data.concerns;

  const [updated] = await db
    .update(schema.scorecardSubmissions)
    .set(updates)
    .where(eq(schema.scorecardSubmissions.id, sub.id))
    .returning();

  if (parsed.data.ratings) {
    // Upsert per-attribute ratings.
    for (const rt of parsed.data.ratings) {
      const [existing] = await db
        .select()
        .from(schema.scorecardSubmissionRatings)
        .where(
          and(
            eq(schema.scorecardSubmissionRatings.submissionId, sub.id),
            eq(schema.scorecardSubmissionRatings.attributeId, rt.attributeId),
          ),
        )
        .limit(1);
      if (existing) {
        await db
          .update(schema.scorecardSubmissionRatings)
          .set({ rating: rt.rating ?? null, notes: rt.notes } as any)
          .where(eq(schema.scorecardSubmissionRatings.id, existing.id));
      } else {
        await db.insert(schema.scorecardSubmissionRatings).values({
          submissionId: sub.id,
          attributeId: rt.attributeId,
          rating: rt.rating ?? null,
          notes: rt.notes,
        } as any);
      }
    }
  }

  return c.json(success(updated));
});

scorecardRoutes.post("/submissions/:id/submit", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [sub] = await db
    .select()
    .from(schema.scorecardSubmissions)
    .where(eq(schema.scorecardSubmissions.id, c.req.param("id")))
    .limit(1);
  if (!sub) return c.json(error("NOT_FOUND", "Submission not found"), 404);
  if (sub.evaluatorUserId !== userId) {
    return c.json(error("FORBIDDEN", "Only the evaluator can submit"), 403);
  }
  if (sub.status === "submitted") {
    return c.json(error("CONFLICT", "Already submitted"), 409);
  }

  const [tpl] = await db
    .select()
    .from(schema.scorecardTemplates)
    .where(eq(schema.scorecardTemplates.id, sub.templateId))
    .limit(1);
  const attrs = await db
    .select()
    .from(schema.scorecardAttributes)
    .where(eq(schema.scorecardAttributes.templateId, sub.templateId));
  const ratings = await db
    .select()
    .from(schema.scorecardSubmissionRatings)
    .where(eq(schema.scorecardSubmissionRatings.submissionId, sub.id));

  const overallScore = computeOverallScore(
    attrs.map((a) => ({ id: a.id, weight: a.weight })),
    ratings.map((r) => ({ attributeId: r.attributeId, rating: r.rating })),
    tpl?.ratingScale ?? "1-4",
  );

  const [updated] = await db
    .update(schema.scorecardSubmissions)
    .set({
      status: "submitted",
      overallScore,
      submittedAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.scorecardSubmissions.id, sub.id))
    .returning();

  return c.json(success(updated));
});

// ─── Debrief ────────────────────────────────────────────────────────────────
//
// Aggregate roll-up across all submissions for an application: average
// score, recommendation breakdown, per-attribute averages.
scorecardRoutes.get("/debrief", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const applicationId = c.req.query("applicationId");
  if (!applicationId) {
    return c.json(error("VALIDATION_ERROR", "applicationId required"), 400);
  }

  const db = getDb();
  const subs = await db
    .select()
    .from(schema.scorecardSubmissions)
    .where(
      and(
        eq(schema.scorecardSubmissions.applicationId, applicationId),
        eq(schema.scorecardSubmissions.status, "submitted"),
      ),
    );

  if (subs.length === 0) {
    return c.json(success({ submissions: [], avgScore: null, recommendations: {}, attributes: [] }));
  }

  // Authorise: at least one submission must reference a template the user can read.
  const tplIds = Array.from(new Set(subs.map((s) => s.templateId)));
  const tpls = await db
    .select()
    .from(schema.scorecardTemplates)
    .where(inArray(schema.scorecardTemplates.id, tplIds));
  let authorised = false;
  for (const t of tpls) {
    if (await userCanAccessCompany(userId, t.companyId)) {
      authorised = true;
      break;
    }
  }
  if (!authorised) return c.json(error("FORBIDDEN", "No access to this debrief"), 403);

  const subIds = subs.map((s) => s.id);
  const ratings = await db
    .select()
    .from(schema.scorecardSubmissionRatings)
    .where(inArray(schema.scorecardSubmissionRatings.submissionId, subIds));
  const attrs = await db
    .select()
    .from(schema.scorecardAttributes)
    .where(inArray(schema.scorecardAttributes.templateId, tplIds));

  const recommendations: Record<string, number> = {};
  let scoreSum = 0;
  let scoreCount = 0;
  for (const s of subs) {
    if (s.overallRecommendation) {
      recommendations[s.overallRecommendation] =
        (recommendations[s.overallRecommendation] ?? 0) + 1;
    }
    if (s.overallScore !== null && s.overallScore !== undefined) {
      scoreSum += s.overallScore;
      scoreCount += 1;
    }
  }
  const avgScore = scoreCount === 0 ? null : Math.round(scoreSum / scoreCount);

  // Per-attribute average across all submissions.
  const attrAgg = attrs.map((a) => {
    const myRatings = ratings
      .filter((r) => r.attributeId === a.id && r.rating !== null && r.rating !== undefined)
      .map((r) => r.rating as number);
    const avg =
      myRatings.length === 0
        ? null
        : Math.round((myRatings.reduce((x, y) => x + y, 0) / myRatings.length) * 10) / 10;
    return { attributeId: a.id, name: a.name, avg, samples: myRatings.length };
  });

  return c.json(
    success({
      submissions: subs,
      avgScore,
      recommendations,
      attributes: attrAgg,
    }),
  );
});

// ─── Hiring decisions ───────────────────────────────────────────────────────

scorecardRoutes.get("/decisions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const applicationId = c.req.query("applicationId");
  if (!applicationId) {
    return c.json(error("VALIDATION_ERROR", "applicationId required"), 400);
  }
  const scope = await resolveCompanyScope(userId);
  if (scope.companyIds.length === 0) return c.json(success([]));

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.hiringDecisions)
    .where(
      and(
        eq(schema.hiringDecisions.applicationId, applicationId),
        inArray(schema.hiringDecisions.companyId, scope.companyIds),
      ),
    )
    .orderBy(desc(schema.hiringDecisions.decidedAt));
  return c.json(success(rows));
});

scorecardRoutes.post("/decisions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "No access to this company"), 403);
  }

  // Snapshot the debrief aggregate at decision time.
  const db = getDb();
  const subs = await db
    .select()
    .from(schema.scorecardSubmissions)
    .where(
      and(
        eq(schema.scorecardSubmissions.applicationId, parsed.data.applicationId),
        eq(schema.scorecardSubmissions.status, "submitted"),
      ),
    );
  const recommendations: Record<string, number> = {};
  const scores: number[] = [];
  for (const s of subs) {
    if (s.overallRecommendation) {
      recommendations[s.overallRecommendation] =
        (recommendations[s.overallRecommendation] ?? 0) + 1;
    }
    if (s.overallScore !== null && s.overallScore !== undefined) scores.push(s.overallScore);
  }
  const aggregateSnapshot = {
    submissionCount: subs.length,
    avgScore:
      scores.length === 0 ? null : Math.round(scores.reduce((x, y) => x + y, 0) / scores.length),
    recommendations,
  };

  const [decision] = await db
    .insert(schema.hiringDecisions)
    .values({
      companyId: parsed.data.companyId,
      jobId: parsed.data.jobId,
      applicationId: parsed.data.applicationId,
      candidateUserId: parsed.data.candidateUserId,
      decidedByUserId: userId,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
      aggregateSnapshot: aggregateSnapshot as any,
    } as any)
    .returning();

  return c.json(success(decision), 201);
});

export default scorecardRoutes;
