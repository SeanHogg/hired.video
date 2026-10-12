/**
 * Studio features — in-video lead forms. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema, UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { invalidatePublicEngagement, readPublicEngagement, viewerMaySubmitToProject } from "../../services/studio/public-engagement.js";
import { resolveActableEngagementRow } from "../../services/studio/engagement-row-access.js";
import { passesGate } from "../../services/learning/scoring.js";
import { ok, fail, viewerCanActOnProject, studioVideoForms, studioVideoFormSubmissions, marketingLeads } from "./shared.js";

export const formRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  16. IN-VIDEO LEAD FORMS — gap #140
// ██
// ██  Wistia Turnstile equivalent. Forms are pinned to a playback timestamp
// ██  and surface as an overlay during the embedded player. Submissions
// ██  land in `studio_video_form_submissions` AND mirror into the global
// ██  `marketingLeads` table for the unified lead inbox.
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/projects/:projectId/forms — list forms for a project (owner)
formRoutes.get("/projects/:projectId/forms", async (c) => {
  const projectId = c.req.param("projectId");
  // Same rule as chapters / thumbnails / comments: owner, company member
  // or delegate; unknown / forbidden -> 404.
  if (!(await viewerCanActOnProject(c.var.user?.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }
  const db = getDb();

  const forms = await db
    .select()
    .from(studioVideoForms)
    .where(eq(studioVideoForms.projectId, projectId))
    .orderBy(studioVideoForms.positionSeconds);

  return c.json(ok({ forms }));
});

// GET /api/studio/projects/:projectId/engagement/public — the ONE public
// read behind the playback engagement overlay (#1586): a PUBLIC project's
// active forms, chapters and thumbnails (never review comments or
// submissions). Optional-auth in app.ts. Malformed, unknown and private ids
// all answer 404. Cached + invalidated in services/studio/public-engagement.
formRoutes.get("/projects/:projectId/engagement/public", async (c) => {
  const assets = await readPublicEngagement(c.req.param("projectId"));
  if (!assets) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  return c.json(ok(assets));
});

// #1505 — Knowledge-check fields shared across create + update. Defining
// them once keeps the two Zod schemas in DRY lockstep (only the
// .optional() / .partial() shape differs at the boundary).
const KnowledgeCheckFields = {
  formType: z.enum(["lead_capture", "knowledge_check"]).optional(),
  answerKey: z
    .record(
      z.string(),
      z.object({
        correctAnswer: z.string(),
        points: z.number().int().min(1).max(100).default(1),
        rationale: z.string().max(500).optional(),
      }),
    )
    .nullable()
    .optional(),
  passingScorePct: z.number().int().min(0).max(100).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(20).nullable().optional(),
  remediationJumpToSceneId: z.string().nullable().optional(),
  courseLessonId: UuidLikeSchema.nullable().optional(),
} as const;

// POST /api/studio/projects/:projectId/forms — create
formRoutes.post("/projects/:projectId/forms", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    title: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    positionSeconds: z.number().min(0),
    fields: z.array(z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      type: z.enum(["email", "text", "tel", "select"]),
      required: z.boolean().default(true),
      options: z.array(z.string()).optional(), // for select
    })).min(1),
    requireToContinue: z.boolean().default(true),
    redirectUrl: z.string().url().nullable().optional(),
    submitButtonText: z.string().max(40).optional(),
    ...KnowledgeCheckFields,
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  // Active forms are served by the PUBLIC engagement read — only someone
  // who may act on the project may attach one (unknown / forbidden → 404).
  if (!(await viewerCanActOnProject(user.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }

  const db = getDb();
  const [form] = await db.insert(studioVideoForms).values({
    userId: user.sub,
    projectId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    positionSeconds: parsed.data.positionSeconds,
    fields: parsed.data.fields,
    requireToContinue: parsed.data.requireToContinue,
    redirectUrl: parsed.data.redirectUrl ?? null,
    submitButtonText: parsed.data.submitButtonText ?? "Continue",
    formType: parsed.data.formType ?? "lead_capture",
    answerKey: parsed.data.answerKey ?? null,
    passingScorePct: parsed.data.passingScorePct ?? null,
    maxAttempts: parsed.data.maxAttempts ?? null,
    remediationJumpToSceneId: parsed.data.remediationJumpToSceneId ?? null,
    courseLessonId: parsed.data.courseLessonId ?? null,
  } as any).returning();

  invalidatePublicEngagement(projectId);
  return c.json(ok(form), 201);
});

// PATCH /api/studio/forms/:id
formRoutes.patch("/forms/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    positionSeconds: z.number().min(0).optional(),
    requireToContinue: z.boolean().optional(),
    isActive: z.boolean().optional(),
    redirectUrl: z.string().url().nullable().optional(),
    submitButtonText: z.string().max(40).optional(),
    ...KnowledgeCheckFields,
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);
  const access = await resolveActableEngagementRow(user.sub, "form", id);
  if (!access) return c.json(fail("NOT_FOUND", "Form not found"), 404);

  const db = getDb();
  const [updated] = await db.update(studioVideoForms)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(studioVideoForms.id, id))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Form not found"), 404);
  invalidatePublicEngagement(access.projectId);
  return c.json(ok(updated));
});

// GET /api/studio/forms/:id — owner / company member / delegate. Returns the form with the
// answer key so authoring surfaces (VideoFormsDialog edit mode, SCORM
// export #1400) can hydrate without re-fetching the parent project.
formRoutes.get("/forms/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  // Whoever may act on the form's project (owner / company / delegate).
  if (!(await resolveActableEngagementRow(user?.sub, "form", id))) {
    return c.json(fail("NOT_FOUND", "Form not found"), 404);
  }
  const db = getDb();
  const [form] = await db.select()
    .from(studioVideoForms)
    .where(eq(studioVideoForms.id, id))
    .limit(1);
  if (!form) return c.json(fail("NOT_FOUND", "Form not found"), 404);
  return c.json(ok(form));
});

// DELETE /api/studio/forms/:id
formRoutes.delete("/forms/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const access = await resolveActableEngagementRow(user.sub, "form", id);
  if (!access) return c.json(fail("NOT_FOUND", "Form not found"), 404);
  const db = getDb();
  const deleted = await db.delete(studioVideoForms)
    .where(eq(studioVideoForms.id, id))
    .returning({ id: studioVideoForms.id });
  if (deleted.length === 0) return c.json(fail("NOT_FOUND", "Form not found"), 404);
  invalidatePublicEngagement(access.projectId);
  return c.json(ok({ deleted: deleted[0].id }));
});

// Bounded anonymous body: a form has at most a few dozen fields, so the
// answer map is capped by key count and size (the global /api/* limiter
// already throttles per IP for anonymous callers).
export const FormSubmitSchema = z.object({
  answers: z
    .record(z.string().min(1).max(64), z.string().max(2000))
    .refine((a) => Object.keys(a).length <= 50, { message: "Too many answers" }),
  timestampSec: z.number().min(0).max(86_400).optional(),
  videoId: z.string().max(64).optional(),
  referrer: z.string().max(2048).optional(),
});

// POST /api/studio/forms/:id/submit — submission from the playback overlay /
// embedded player. Optional-auth in app.ts: a signed-out viewer of a PUBLIC
// project may submit; on a private project only someone who may act on it
// (the owner previewing in the editor). Inactive, unknown and malformed ids
// and forbidden projects all answer 404.
formRoutes.post("/forms/:id/submit", async (c) => {
  const id = c.req.param("id");
  if (!UUID_LIKE_REGEX.test(id)) return c.json(fail("NOT_FOUND", "Form not found"), 404);
  const viewerId = c.var.user?.sub ?? null;
  const body = await c.req.json().catch(() => null);
  const parsed = FormSubmitSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  const [form] = await db.select().from(studioVideoForms).where(eq(studioVideoForms.id, id)).limit(1);
  if (!form || !form.isActive) return c.json(fail("NOT_FOUND", "Form not found"), 404);
  if (!(await viewerMaySubmitToProject(viewerId, form.projectId))) {
    return c.json(fail("NOT_FOUND", "Form not found"), 404);
  }

  // Validate required fields
  const fields = (form.fields as Array<{ key: string; required: boolean; type: string }>) || [];
  for (const f of fields) {
    if (f.required && !parsed.data.answers[f.key]) {
      return c.json(fail("VALIDATION_ERROR", `Required field missing: ${f.key}`), 400);
    }
  }

  const email = parsed.data.answers["email"] ?? null;
  const name = parsed.data.answers["name"] ?? null;
  const company = parsed.data.answers["company"] ?? null;

  const ipCountry = c.req.header("cf-ipcountry") ?? null;

  // #201 — Knowledge-check scoring. When formType === 'knowledge_check',
  // grade against the stored answer_key and emit cmi.score.raw-style
  // metadata on the submission. The remediation jump + max-attempts gate
  // are enforced client-side from the response payload.
  let scoreRaw: number | null = null;
  let scoreMax: number | null = null;
  let passed: boolean | null = null;
  let remediationJumpToSceneId: string | null = null;
  if (form.formType === "knowledge_check" && form.answerKey) {
    const key = form.answerKey as Record<string, {
      correctAnswer: string;
      points?: number;
    }>;
    let earned = 0;
    let max = 0;
    for (const [fieldKey, spec] of Object.entries(key)) {
      const pts = spec.points ?? 1;
      max += pts;
      if (String(parsed.data.answers[fieldKey] ?? "").trim().toLowerCase() ===
          String(spec.correctAnswer).trim().toLowerCase()) {
        earned += pts;
      }
    }
    scoreRaw = earned;
    scoreMax = max;
    // #1642 — pass-gate check routes through the shared scoring seam
    // (services/learning/scoring.ts) so the rounding semantics match
    // every other "did the learner pass?" callsite in the codebase.
    const threshold = form.passingScorePct ?? 80;
    passed = passesGate({ scoreRaw, scoreMin: 0, scoreMax }, threshold);
    if (!passed) remediationJumpToSceneId = form.remediationJumpToSceneId ?? null;
  }

  const [submission] = await db.insert(studioVideoFormSubmissions).values({
    formId: id,
    projectId: form.projectId,
    videoId: parsed.data.videoId ?? null,
    viewerEmail: email,
    viewerName: name,
    answers: parsed.data.answers,
    timestampSec: parsed.data.timestampSec ?? null,
    referrer: parsed.data.referrer ?? null,
    ipCountry,
    scoreRaw,
    scoreMax,
    passed,
  } as any).returning();

  // Mirror into global lead inbox (#54 / #38)
  if (email) {
    await db.insert(marketingLeads).values({
      email,
      name,
      company,
      source: "video-form",
      metadata: {
        formId: id,
        projectId: form.projectId,
        formTitle: form.title,
        timestampSec: parsed.data.timestampSec ?? null,
      },
    } as any).catch(() => { /* ignore duplicate-email FKs */ });
  }

  return c.json(ok({
    id: submission.id,
    redirectUrl: form.redirectUrl,
    // #201 — knowledge-check fields. Null for lead-capture forms.
    formType: form.formType,
    scoreRaw,
    scoreMax,
    passed,
    remediationJumpToSceneId,
  }), 201);
});

// GET /api/studio/forms/:id/submissions — owner only
formRoutes.get("/forms/:id/submissions", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  // Whoever may act on the form's project (owner / company / delegate).
  if (!(await resolveActableEngagementRow(user?.sub, "form", id))) {
    return c.json(fail("NOT_FOUND", "Form not found"), 404);
  }
  const db = getDb();

  const submissions = await db.select()
    .from(studioVideoFormSubmissions)
    .where(eq(studioVideoFormSubmissions.formId, id))
    .orderBy(desc(studioVideoFormSubmissions.createdAt))
    .limit(500);

  return c.json(ok({ submissions, total: submissions.length }));
});
