/**
 * Studio features — in-video lead forms. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 * Use cases live in services/studio/video-forms.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { readPublicEngagement } from "../../services/studio/public-engagement.js";
import { resolveActableEngagementRow } from "../../services/studio/engagement-row-access.js";
import {
  createVideoForm,
  deleteVideoForm,
  getVideoForm,
  listFormSubmissions,
  listProjectForms,
  submitVideoForm,
  updateVideoForm,
} from "../../services/studio/video-forms.js";
import { viewerCanActOnProject } from "./shared.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";
import { requireUser } from "../helpers/routerHelpers.js";

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
  if (!(await viewerCanActOnProject(c.var.userId, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }
  return c.json(success({ forms: await listProjectForms(projectId) }));
});

// GET /api/studio/projects/:projectId/engagement/public — the ONE public
// read behind the playback engagement overlay (#1586): a PUBLIC project's
// active forms, chapters and thumbnails (never review comments or
// submissions). Optional-auth in app.ts. Malformed, unknown and private ids
// all answer 404. Cached + invalidated in services/studio/public-engagement.
formRoutes.get("/projects/:projectId/engagement/public", async (c) => {
  const assets = await readPublicEngagement(c.req.param("projectId"));
  if (!assets) return c.json(error("NOT_FOUND", "Project not found"), 404);
  return c.json(success(assets));
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
formRoutes.post("/projects/:projectId/forms", validateJson(z.object({
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
  }), (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const projectId = c.req.param("projectId");
  // Active forms are served by the PUBLIC engagement read — only someone
  // who may act on the project may attach one (unknown / forbidden → 404).
  if (!(await viewerCanActOnProject(userId, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }
  return c.json(success(await createVideoForm(userId, projectId, c.req.valid("json"))), 201);
});

// PATCH /api/studio/forms/:id
formRoutes.patch("/forms/:id", validateJson(z.object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    positionSeconds: z.number().min(0).optional(),
    requireToContinue: z.boolean().optional(),
    isActive: z.boolean().optional(),
    redirectUrl: z.string().url().nullable().optional(),
    submitButtonText: z.string().max(40).optional(),
    ...KnowledgeCheckFields,
  }), () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const id = c.req.param("id");
  const access = await resolveActableEngagementRow(userId, "form", id);
  if (!access) return c.json(error("NOT_FOUND", "Form not found"), 404);

  const updated = await updateVideoForm(access.projectId, id, c.req.valid("json"));
  if (!updated) return c.json(error("NOT_FOUND", "Form not found"), 404);
  return c.json(success(updated));
});

// GET /api/studio/forms/:id — owner / company member / delegate. Returns the form with the
// answer key so authoring surfaces (VideoFormsDialog edit mode, SCORM
// export #1400) can hydrate without re-fetching the parent project.
formRoutes.get("/forms/:id", async (c) => {
  const id = c.req.param("id");
  // Whoever may act on the form's project (owner / company / delegate).
  if (!(await resolveActableEngagementRow(c.var.userId, "form", id))) {
    return c.json(error("NOT_FOUND", "Form not found"), 404);
  }
  const form = await getVideoForm(id);
  if (!form) return c.json(error("NOT_FOUND", "Form not found"), 404);
  return c.json(success(form));
});

// DELETE /api/studio/forms/:id
formRoutes.delete("/forms/:id", async (c) => {
  const userId = requireUser(c);
  const id = c.req.param("id");
  const access = await resolveActableEngagementRow(userId, "form", id);
  if (!access) return c.json(error("NOT_FOUND", "Form not found"), 404);
  const deleted = await deleteVideoForm(access.projectId, id);
  if (!deleted) return c.json(error("NOT_FOUND", "Form not found"), 404);
  return c.json(success({ deleted }));
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
formRoutes.post("/forms/:id/submit", validateJson(FormSubmitSchema, () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const result = await submitVideoForm(
    c.req.param("id"),
    c.var.userId ?? null,
    c.req.valid("json"),
    c.req.header("cf-ipcountry") ?? null,
  );
  return c.json(success(result), 201);
});

// GET /api/studio/forms/:id/submissions — owner only
formRoutes.get("/forms/:id/submissions", async (c) => {
  const id = c.req.param("id");
  // Whoever may act on the form's project (owner / company / delegate).
  if (!(await resolveActableEngagementRow(c.var.userId, "form", id))) {
    return c.json(error("NOT_FOUND", "Form not found"), 404);
  }
  const submissions = await listFormSubmissions(id);
  return c.json(success({ submissions, total: submissions.length }));
});
