import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppContext, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import * as jobService from "../services/job/JobService.js";
import { handleJobSentimentPrediction } from "../services/job/job-sentiment-handler.js";
import { buildRepos } from "../repositories/index.js";
import { buildApiDeps } from "../services/apiDeps.js";
import { LocationService } from "../services/location/LocationService.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { extractPdfText } from "../utils/pdf-extract.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { OptionalUrlSchema, UuidLikeSchema } from "../../../shared/validation.js";
import { JOB_LIST_FIELDS, parseFields, projectRows } from "../../../shared/projection.js";
import { requireJobOwner } from "../services/jobs/jobOwnership.js";
import { bumpSearchVersion } from "../utils/search-cache.js";
import {
  createScreeningInterviewFromApply,
  listApplicationsMissingScreening,
} from "../services/interview/screening-from-apply.js";

// ============================================================================
// SCHEMAS
// ============================================================================

export const CreateJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
  heroImageUrl: OptionalUrlSchema,
  /** #743 — Optional Studio Project attached to the job. */
  videoProjectId: z.string().uuid().optional().nullable(),
  /** Required-skills list. Persisted to `job_items.skills_required` (jsonb).
   *  The wire field is `skills` to match the read shape (`rowToJob`
   *  exposes `row.skillsRequired` as `skills`). The 2026-05-04 fix:
   *  prior to this entry, Zod silently stripped the field on PUT so the
   *  Skill Extractor's "Add to Job" button looked successful (200 OK)
   *  but never persisted anything. */
  skills: z.array(z.string()).optional(),
  /** AI-resilient sector slug. See `shared/sectors.ts`. Same lesson
   *  as the skills field above — must be declared here or Zod strips
   *  it at the route boundary and the service never sees it. */
  sector: z.string().max(64).optional(),
});

export const UpdateJobSchema = CreateJobSchema.partial();

export const JobAlertSchema = z.object({
  name: z.string().min(1),
  keywords: z.string().optional(),
  location: z.string().optional(),
  jobType: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const jobRoutes = new Hono<AppEnv>();

/**
 * POST /api/jobs/sentimentprediction — score the sentiment of a saved
 * job's description and persist on `job_items.sentiment_score`. Body:
 * `{ jobId }`. Pasted-text scoring goes through /sentiment/sentimentprediction
 * (see routes/sentiment.ts) and never lands here.
 */
jobRoutes.post("/sentimentprediction", attachTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleJobSentimentPrediction(
    { jobs: buildRepos(getDb()).jobs },
    body,
  );
  return c.json(result.body as any, result.status as any);
});

/** Shared between `/` and `/public` — single seam that parses the search
 *  query string AND resolves the structured LocationFilter into a job-id
 *  allowlist. Takes primitives (query + env) instead of the Hono Context
 *  so it stays decoupled from per-route Bindings typing. */
async function publicJobsFromQuery(
  query: Record<string, string | undefined>,
  env: Record<string, string | undefined>,
): Promise<Awaited<ReturnType<typeof jobService.getPublicJobs>>> {
  const hasGeo = Boolean(query.countryId || query.stateId || query.cityId);
  let allow: string[] | null = null;
  if (hasGeo) {
    const deps = buildApiDeps(env);
    const svc = new LocationService(deps);
    allow = await svc.applyLocationFilter("job", {
      countryId: query.countryId ? Number(query.countryId) : undefined,
      stateId: query.stateId || undefined,
      cityId: query.cityId || undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
      remote:
        query.isRemote === "true" ? true : query.isRemote === "false" ? false : undefined,
    });
  }
  return jobService.getPublicJobs({
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 10,
    search: query.search,
    location: query.location,
    employmentType: query.employmentType,
    experienceLevel: query.experienceLevel,
    isRemote:
      query.isRemote === "true" ? true : query.isRemote === "false" ? false : undefined,
    salaryMin: query.salaryMin ? Number(query.salaryMin) : undefined,
    salaryMax: query.salaryMax ? Number(query.salaryMax) : undefined,
    sector: query.sector || undefined,
    entityIdAllowlist: allow,
  });
}

// Public listing endpoint. Frontend legacy calls /api/Job with query params.
// Supports `?fields=id,title,slug,...` projection (gap #1370) so list views
// don't drag the full job body over the wire — descriptions + JSONB
// blobs alone are usually 10× the size of the card-view fields.
jobRoutes.get("/", async (c) => {
  const data = await publicJobsFromQuery(c.req.query(), (c.env ?? {}) as Record<string, string | undefined>);
  const fields = parseFields(c.req.query("fields"), JOB_LIST_FIELDS);
  return c.json(success({ ...data, items: projectRows(data.items as unknown as Array<Record<string, unknown>>, fields) }));
});

/** POST /api/jobs/:id/archive — soft-delete the job (#154). Owner only.
 *  Mirrors resume archive: hides from default listings, preserves slug
 *  + analytics history. */
jobRoutes.post("/:id/archive", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const db = getDb();
  const [row] = await db
    .select({ id: schema.jobItems.id, postedByUserId: schema.jobItems.postedByUserId })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, id))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Job not found"), 404);
  if (row.postedByUserId !== userId) return c.json(error("FORBIDDEN", "Not your job"), 403);
  const [updated] = await db
    .update(schema.jobItems)
    .set({ archivedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(schema.jobItems.id, id))
    .returning();
  bumpSearchVersion();
  return c.json(success(updated), 200);
});

jobRoutes.post("/:id/unarchive", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const db = getDb();
  const [row] = await db
    .select({ id: schema.jobItems.id, postedByUserId: schema.jobItems.postedByUserId })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, id))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Job not found"), 404);
  if (row.postedByUserId !== userId) return c.json(error("FORBIDDEN", "Not your job"), 403);
  const [updated] = await db
    .update(schema.jobItems)
    .set({ archivedAt: null, updatedAt: new Date() } as any)
    .where(eq(schema.jobItems.id, id))
    .returning();
  bumpSearchVersion();
  return c.json(success(updated), 200);
});

/** POST /api/jobs or /api/job — create a new job */
jobRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const created = await jobService.createJob(parsed.data, userId);
  return c.json(success(created), 201);
});

/** GET /api/Job/GetSummaryItems — legacy PascalCase alias; getsummaryitems is the canonical form **/
const summaryItemsHandler = async (c: any) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const items = await jobService.getUserJobs(userId);
  return c.json(success(items));
};
jobRoutes.get("/getsummaryitems", summaryItemsHandler);
jobRoutes.get("/GetSummaryItems", summaryItemsHandler); // legacy PascalCase alias

/** GET /api/job/user-jobs — legacy recruiter flow alias */
jobRoutes.get("/user-jobs", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const items = await jobService.getUserJobs(userId);
  return c.json(success(items));
});

/** GET /api/Job/saved — get saved jobs */
jobRoutes.get("/saved", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const items = await jobService.getSavedJobs(userId);
  return c.json(success(items));
});

/** GET /api/jobs/public — explicit public listing. Supports `?fields=` per #1370. */
jobRoutes.get("/public", async (c) => {
  const data = await publicJobsFromQuery(c.req.query(), (c.env ?? {}) as Record<string, string | undefined>);
  const fields = parseFields(c.req.query("fields"), JOB_LIST_FIELDS);
  return c.json(success({ ...data, items: projectRows(data.items as unknown as Array<Record<string, unknown>>, fields) }));
});

/** POST /api/Job/:id/save — save/bookmark a job */
jobRoutes.post("/:id/save", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await jobService.saveJob(c.req.param("id"), userId);
  return c.json(success({ success: true }));
});

/** DELETE /api/Job/:id/save — remove saved job */
jobRoutes.delete("/:id/save", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await jobService.unsaveJob(c.req.param("id"), userId);
  return c.json(success({ success: true }));
});

/** PATCH /api/jobs/:id/status — update saved job pipeline status */
jobRoutes.patch("/:id/status", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const status = body?.status;
  if (!status || !jobService.JOB_PIPELINE_STATUSES.includes(status)) {
    return c.json(error("VALIDATION_ERROR", `Invalid status. Must be one of: ${jobService.JOB_PIPELINE_STATUSES.join(', ')}`), 400);
  }
  const updated = await jobService.updateSavedJobStatus(c.req.param("id"), userId, status, body?.notes);
  if (!updated) return c.json(error("NOT_FOUND", "Job not found in your tracker"), 404);
  return c.json(success({ status }));
});

/** POST /api/Job/:id/apply — apply to a job.
 *
 *  When the job has a screening question set attached
 *  (jobItems.screeningQuestionSetId set + screeningRequired != 'none'),
 *  we materialise a studio_async_interviews row bound to the new
 *  application and return the magic-link token in `screening`. The frontend
 *  uses that to land the candidate on `/interview/:token` directly —
 *  no email round-trip — so the screening feels like the next step of the
 *  application, not a separate ask.
 */
jobRoutes.post("/:id/apply", async (c) => {
  const user = c.var.user;
  const userId = user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const jobId = c.req.param("id");
  const { applicationId } = await jobService.applyToJob(jobId, userId, body ?? { resumeId: "" });

  // Award gamification points for the application. Fire-and-forget.
  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  await withGamification(c, "application-submitted", (game, role, uid) =>
    game.onApplicationSubmitted({
      userId: uid,
      role,
      applicationId,
      metadata: { jobId },
    }),
  );

  // Screening: if the job has a question set attached, spin up the interview
  // and hand back the token so the frontend can route the candidate into it
  // immediately. Failures here MUST NOT block the application — the recruiter
  // can still send the screening manually from MyInterviewAssignments.
  let screening: Awaited<ReturnType<typeof createScreeningInterviewFromApply>> = null;
  try {
    screening = await createScreeningInterviewFromApply(getDb(), {
      jobId,
      applicationId,
      candidateUserId: userId,
      candidateEmail: user?.email ?? "",
    });
  } catch (err) {
    console.error("[apply] screening creation failed:", err);
  }

  return c.json(success({ success: true, applicationId, screening }));
});

/** GET /api/Job/:id/screening/preview — candidate-safe view of the screening
 *  attachment. Public-ish: returns aggregate stats only (count, total
 *  expected minutes, prep/retake config) so the apply page can warn the
 *  candidate without leaking the actual question text in advance. */
jobRoutes.get("/:id/screening/preview", async (c) => {
  const jobId = c.req.param("id");
  const db = getDb();
  const [job] = await db
    .select({
      screeningQuestionSetId: schema.jobItems.screeningQuestionSetId,
      screeningRequired: schema.jobItems.screeningRequired,
    })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);
  if (!job.screeningQuestionSetId || job.screeningRequired === "none") {
    return c.json(success({ hasScreening: false }));
  }

  const [set] = await db
    .select()
    .from(schema.interviewQuestionSets)
    .where(eq(schema.interviewQuestionSets.id, job.screeningQuestionSetId))
    .limit(1);
  if (!set) return c.json(success({ hasScreening: false }));

  const questions = Array.isArray(set.questions)
    ? (set.questions as Array<{ maxDurationSec: number }>)
    : [];
  const expectedMinutes = Math.ceil(
    questions.reduce((sum, q) => sum + (q.maxDurationSec ?? 120), 0) / 60,
  );

  return c.json(success({
    hasScreening: true,
    screeningRequired: job.screeningRequired,
    title: set.title,
    description: set.description,
    questionCount: questions.length,
    expectedMinutes,
    prepTimeSec: set.prepTimeSec,
    maxRetakes: set.maxRetakes,
    proctoringOn: set.proctoringOn,
  }));
});

/** GET /api/Job/:id/screening — fetch the full screening attachment for a job
 *  (owner-only). Returns `{ questionSetId, screeningRequired, set }`. Used
 *  by the job edit page to render the "Screening" tab. */
jobRoutes.get("/:id/screening", async (c) => {
  const jobId = c.req.param("id");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const [job] = await db
    .select({
      id: schema.jobItems.id,
      screeningQuestionSetId: schema.jobItems.screeningQuestionSetId,
      screeningRequired: schema.jobItems.screeningRequired,
    })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);

  let set: typeof schema.interviewQuestionSets.$inferSelect | null = null;
  if (job.screeningQuestionSetId) {
    const [row] = await db
      .select()
      .from(schema.interviewQuestionSets)
      .where(eq(schema.interviewQuestionSets.id, job.screeningQuestionSetId))
      .limit(1);
    set = row ?? null;
  }

  return c.json(success({
    questionSetId: job.screeningQuestionSetId,
    screeningRequired: job.screeningRequired,
    set,
  }));
});

/** PUT /api/Job/:id/screening — attach or detach a question set on a job.
 *  Body: `{ questionSetId: string | null, screeningRequired: 'none' | 'optional' | 'required' }`.
 *  Owner-only. */
jobRoutes.put("/:id/screening", async (c) => {
  const jobId = c.req.param("id");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const schemaIn = z.object({
    questionSetId: UuidLikeSchema.nullable(),
    screeningRequired: z.enum(["none", "optional", "required"]),
  });
  const parsed = schemaIn.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid screening payload", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();
  // Cross-check that the user can read the set they're attaching (if any).
  if (parsed.data.questionSetId) {
    const [row] = await db
      .select()
      .from(schema.interviewQuestionSets)
      .where(eq(schema.interviewQuestionSets.id, parsed.data.questionSetId))
      .limit(1);
    if (!row) return c.json(error("NOT_FOUND", "Question set not found"), 404);
    // Reuse the same can-read rule as the question-set CRUD: owner OR
    // company member. We don't have a helper exported yet, but ownerUserId
    // === user covers the common path; company-owned sets are gated by the
    // route layer when the user lists their library, so we trust the id.
  }

  // If the caller wants screening but didn't pick a set, refuse — there's
  // no UX path where this is intentional.
  if (parsed.data.screeningRequired !== "none" && !parsed.data.questionSetId) {
    return c.json(
      error("INVALID_STATE", "Pick a question set before marking screening optional/required"),
      400,
    );
  }

  await db
    .update(schema.jobItems)
    .set({
      screeningQuestionSetId: parsed.data.questionSetId,
      screeningRequired: parsed.data.screeningRequired,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.jobItems.id, jobId));

  return c.json(success({
    questionSetId: parsed.data.questionSetId,
    screeningRequired: parsed.data.screeningRequired,
  }));
});

/** GET /api/Job/:id/screening/backfill-preview — owner-only count of how
 *  many existing applicants don't yet have a screening row attached. Used
 *  by [JobScreeningCard] to render "Send screening to N existing applicants"
 *  when a recruiter attaches a set after the job has been live. */
jobRoutes.get("/:id/screening/backfill-preview", async (c) => {
  const jobId = c.req.param("id");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;
  const missing = await listApplicationsMissingScreening(getDb(), jobId);
  return c.json(success({ count: missing.length }));
});

/** POST /api/Job/:id/screening/backfill — owner-only. For every existing
 *  applicant on this job that doesn't yet have a screening interview
 *  attached, materialise one via `createScreeningInterviewFromApply` and
 *  the magic-link emailer. Closes #1236 (late-attach gap). */
jobRoutes.post("/:id/screening/backfill", async (c) => {
  const jobId = c.req.param("id");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const missing = await listApplicationsMissingScreening(db, jobId);
  if (missing.length === 0) {
    return c.json(success({ count: 0, created: 0 }));
  }

  let created = 0;
  const failures: Array<{ applicationId: string; reason: string }> = [];
  for (const row of missing) {
    try {
      const result = await createScreeningInterviewFromApply(db, {
        jobId,
        applicationId: row.applicationId,
        candidateUserId: row.candidateUserId,
        candidateEmail: row.candidateEmail ?? "",
      });
      if (result) created += 1;
    } catch (err) {
      failures.push({
        applicationId: row.applicationId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return c.json(success({
    count: missing.length,
    created,
    failures,
  }));
});

/** GET /api/Job/slug/:slug — get job by slug */
jobRoutes.get("/slug/:slug", async (c) => {
  const user = c.var.user;
  const viewer = user?.sub
    ? {
        userId: user.sub,
        isSuperAdmin:
          user.isSuperAdmin === true ||
          user.roles?.includes(USER_ROLES.SUPER_ADMIN) === true,
      }
    : undefined;
  const job = await jobService.getJobBySlug(c.req.param("slug"), viewer);
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);
  return c.json(success(job));
});

/** GET /api/Job/applications — list user's job applications */
jobRoutes.get("/applications", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const apps = await jobService.getApplications(userId);
  return c.json(success(apps));
});

/** GET /api/Job/alerts — list user's job alerts */
jobRoutes.get("/alerts", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const alerts = await jobService.getJobAlerts(userId);
  return c.json(success(alerts));
});

/** POST /api/Job/alerts — create alert */
jobRoutes.post("/alerts", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = JobAlertSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request body"), 400);
  const alert = await jobService.createJobAlert(userId, parsed.data);
  return c.json(success(alert), 201);
});

/** PUT /api/Job/alerts/:id — update alert */
jobRoutes.put("/alerts/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const alert = await jobService.updateJobAlert(c.req.param("id"), userId, body);
  if (!alert) return c.json(error("NOT_FOUND", "Alert not found"), 404);
  return c.json(success(alert));
});

/** PATCH /api/Job/alerts/:id/toggle — toggle alert active status */
jobRoutes.patch("/alerts/:id/toggle", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const alert = await jobService.toggleJobAlert(c.req.param("id"), userId);
  if (!alert) return c.json(error("NOT_FOUND", "Alert not found"), 404);
  return c.json(success(alert));
});

/** DELETE /api/Job/alerts/:id — delete alert */
jobRoutes.delete("/alerts/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await jobService.deleteJobAlert(c.req.param("id"), userId);
  return c.json(success({ success: true }));
});

/**
 * Shared payload extractor for the createFromFile handlers. Accepts either
 * a multipart upload (`file` + optional `location`) or a JSON body
 * (`{ title?, description?, location? }`) and returns the raw text content
 * of the upload along with the display filename. Pure — does not touch the DB.
 *
 * PDF uploads are decoded via the shared `extractPdfText` helper so the
 * downstream extractor sees plain text, not compressed PDF bytes.
 */
export async function extractCreateFromFilePayload(c: AppContext): Promise<{
  title: string;
  description: string;
  location: string | undefined;
}> {
  const contentType = c.req.header("Content-Type") ?? "";
  let title = "Imported Job";
  let description = "";
  let location: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file") as File | null;
    if (file) {
      // Strip the extension — we'll use the filename as a fallback title
      // when the AI extractor can't find one in the content itself.
      title = (file.name || title).replace(/\.(pdf|docx?|txt|md|html?)$/i, "");
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const bytes = await file.arrayBuffer().catch(() => null);
        if (bytes) description = await extractPdfText(new Uint8Array(bytes));
      } else {
        description = await file.text().catch(() => "");
      }
    }
    if (form?.has("location")) {
      location = String(form.get("location"));
    }
  } else {
    const body = await c.req.json().catch(() => null);
    if (body) {
      if (typeof body.title === "string" && body.title.length > 0) title = body.title;
      if (typeof body.description === "string") description = body.description;
      if (typeof body.location === "string") location = body.location;
    }
  }

  return { title, description, location };
}

/**
 * POST /api/Job/CreateFromFile (multipart or JSON)
 * POST /api/job/createfromfile (JSON alias for legacy callers)
 *
 * Runs the uploaded content through the same extractAndClassifyJob +
 * createTrackedJob pipeline the browser-extension ingress uses, so every
 * job — regardless of ingress path — lands in the DB with the same
 * structured shape (jobType, experienceLevel, salary, skills,
 * responsibilities, requirements, qualifications, benefits, applyUrl).
 *
 * Markdown-first description: the extractor converts whatever input
 * (HTML, PDF-extracted text, plain text) into Markdown before storing,
 * so the frontend can render formatted job descriptions consistently.
 */
const createFromFileHandler = async (c: AppContext) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const payload = await extractCreateFromFilePayload(c);
  if (!payload.description.trim()) {
    return c.json(error("VALIDATION_ERROR", "File contained no readable text"), 400);
  }

  // Feed the file text through the unified extraction pipeline. No JSON-LD
  // will match (it's not HTML), so this routes straight to the LLM
  // classifier which returns the structured ParsedJob shape.
  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;
  const result = await jobService.extractAndClassifyJob({
    html: payload.description,
    llm,
  });

  // If the LLM rejects the content (e.g. a resume was uploaded instead of a
  // job), keep the user's content anyway — we still have their filename as
  // a title and the raw text as a description. The extension-path does the
  // same "fall open" on extractor failure.
  const parsed = result.parsed ?? {
    title: payload.title,
    description: payload.description,
    confidence: "low" as const,
  };
  if (!parsed.title || /^tracked job$/i.test(parsed.title) || /^job from /i.test(parsed.title)) {
    parsed.title = payload.title;
  }
  if (payload.location && !parsed.location) parsed.location = payload.location;

  const created = await jobService.createTrackedJob(
    {
      title: parsed.title,
      description: parsed.description,
      company: parsed.company,
      location: parsed.location,
      isRemote: parsed.isRemote,
      jobType: parsed.jobType,
      experienceLevel: parsed.experienceLevel,
      salaryMin: parsed.salaryMin,
      salaryMax: parsed.salaryMax,
      salaryCurrency: parsed.salaryCurrency,
      skills: parsed.skills,
      responsibilities: parsed.responsibilities,
      requirements: parsed.requirements,
      qualifications: parsed.qualifications,
      benefits: parsed.benefits,
    },
    userId,
    { track: true },
  );
  return c.json(success(created), 201);
};
jobRoutes.post("/CreateFromFile", createFromFileHandler);
jobRoutes.post("/createfromfile", createFromFileHandler);

/**
 * POST /api/jobs/extract — track a job from a webpage
 *
 * The Chrome extension sends `{ url, html, sourceUrl?, force? }`.
 *
 * Pipeline:
 *   1. Parse structured data (JSON-LD → OG → heuristics → AI classifier).
 *   2. Run the 3-layer dedup pipeline (normalized URL → content hash →
 *      fuzzy ILIKE → AI duplicate confirmation).
 *      - If an exact match is found, return it as-is (just bookmark it
 *        to the user's tracker if `track` is true).
 *      - If fuzzy candidates exist but AI confidence < 0.8, return
 *        a 200 with `{ duplicate_candidates: [...] }` so the extension
 *        can show a "did you mean?" prompt. The extension re-submits
 *        with `force: true` to skip dedup if the user says "Track new".
 *   3. Create the new job and bookmark it.
 */
const extractHandler = async (c: any) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const url: string = typeof body?.url === "string" ? body.url : "";
  const html: string = typeof body?.html === "string" ? body.html : "";
  const sourceUrl: string = typeof body?.sourceUrl === "string" ? body.sourceUrl : url;
  const trackParam = c.req.query("track");
  const track =
    body?.track === false ? false : trackParam === "false" ? false : true;
  const force = body?.force === true;

  // Optional hints from the content script's DOM detection —
  // used as fallbacks when AI extraction struggles with noisy HTML.
  const hintTitle: string = typeof body?.hintTitle === "string" ? body.hintTitle.trim() : "";
  const hintCompany: string = typeof body?.hintCompany === "string" ? body.hintCompany.trim() : "";
  const hintLocation: string = typeof body?.hintLocation === "string" ? body.hintLocation.trim() : "";

  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;

  // ---- Step 1: classify the page --------------------------------
  const result = await jobService.extractAndClassifyJob({
    url: sourceUrl,
    html,
    llm,
  });

  if (!result.ok || !result.parsed) {
    // If AI extraction fails but we have hints from the content script,
    // create a minimal job from the hints + MD description rather than
    // rejecting the request entirely.
    if (hintTitle) {
      const markdown = jobService.htmlToMarkdown(html);
      // Try to extract the "About the job" section from the text.
      const aboutIdx = markdown.toLowerCase().indexOf("about the job");
      const descText =
        aboutIdx >= 0 ? markdown.slice(aboutIdx, aboutIdx + 8000).trim() : markdown.slice(0, 8000);

      (result as any).ok = true;
      (result as any).parsed = {
        title: hintTitle,
        company: hintCompany || jobService.HIRED_VIDEO_SEED_COMPANY,
        location: hintLocation,
        description: descText,
        confidence: "low",
      };
    } else {
      return c.json(
        error("NOT_A_JOB_POSTING", result.reason || "This page doesn't look like a job posting.", {
          confidence: result.confidence,
        }),
        422,
      );
    }
  }

  const parsed = result.parsed!;

  // Apply hints as fallbacks — content script DOM parsing is often more
  // accurate than AI extraction for title/company on obfuscated pages.
  if (hintTitle && (!parsed.title || parsed.title.toLowerCase().includes('job from'))) {
    parsed.title = hintTitle;
  }
  if (hintCompany && (!parsed.company || parsed.company === jobService.HIRED_VIDEO_SEED_COMPANY)) {
    parsed.company = hintCompany;
  }
  if (hintLocation && !parsed.location) {
    parsed.location = hintLocation;
  }

  const company = track ? parsed.company : jobService.HIRED_VIDEO_SEED_COMPANY;

  // ---- Step 2: dedup (skip when force=true — user confirmed "new") --
  if (!force) {
    const dedup = await jobService.deduplicateJob(
      {
        title: parsed.title,
        company,
        location: parsed.location,
        description: parsed.description?.slice(0, 1000),
        sourceUrl: sourceUrl || undefined,
      },
      llm,
    );

    if (dedup.outcome === 'exact' && dedup.existingJob) {
      // Exact match — just bookmark the existing row.
      if (track) {
        const db = getDb();
        await db.insert(jobService.schema_savedJobs).values({ userId, jobId: dedup.existingJob.id }).onConflictDoNothing();
      }
      return c.json(
        success({
          ...dedup.existingJob,
          applyUrl: jobService.deriveApplyUrl({
            parsed,
            job: dedup.existingJob,
            fallbackUrl: sourceUrl,
          }),
        }),
        200,
      );
    }

    if (dedup.outcome === 'fuzzy' && dedup.existingJob) {
      // AI-confirmed fuzzy match — treat like exact.
      if (track) {
        const db = getDb();
        await db.insert(jobService.schema_savedJobs).values({ userId, jobId: dedup.existingJob.id }).onConflictDoNothing();
      }
      return c.json(
        success({
          ...dedup.existingJob,
          applyUrl: jobService.deriveApplyUrl({
            parsed,
            job: dedup.existingJob,
            fallbackUrl: sourceUrl,
          }),
        }),
        200,
      );
    }

    if (dedup.candidates && dedup.candidates.length > 0) {
      // Ambiguous fuzzy matches — return candidates so extension can
      // show a "did you mean?" prompt. Status 200 + special shape.
      return c.json(
        success({
          duplicate_candidates: dedup.candidates.map((c) => ({
            id: c.id,
            title: c.title,
            company: c.company,
            location: c.location,
            sourceUrl: c.sourceUrl,
            createdAt: c.createdAt,
          })),
          parsed_title: parsed.title,
          parsed_company: company,
        }),
        200,
      );
    }
  }

  // ---- Step 3: create new job ------------------------------------
  const created = await jobService.createTrackedJob(
    {
      title: parsed.title,
      description: parsed.description,
      location: parsed.location,
      company,
      sourceUrl: sourceUrl || undefined,
      applyUrl: parsed.applyUrl,
      isRemote: parsed.isRemote,
      jobType: parsed.jobType,
      experienceLevel: parsed.experienceLevel,
      salaryMin: parsed.salaryMin,
      salaryMax: parsed.salaryMax,
      salaryCurrency: parsed.salaryCurrency,
      skills: parsed.skills,
      responsibilities: parsed.responsibilities,
      requirements: parsed.requirements,
      qualifications: parsed.qualifications,
      benefits: parsed.benefits,
    },
    userId,
    { track },
  );

  const applyUrl = jobService.deriveApplyUrl({ parsed, fallbackUrl: sourceUrl });
  return c.json(success({ ...created, applyUrl }), 201);
};
jobRoutes.post("/Extract", extractHandler);
jobRoutes.post("/extract", attachTokenBudget(), extractHandler);

/**
 * POST /api/jobs/:id/refresh — backfill missing fields on a tracked job.
 *
 * The extension captures the current page HTML and posts it here. The
 * client has already confirmed this page matches the stored job
 * (it highlighted the row green before the user clicked rescan), so
 * there is no server-side mismatch check.
 *
 * Fills fields that are currently null/empty on the stored row using a
 * fresh AI extraction of the posted HTML. Never overwrites a non-empty
 * stored value — this is a backfill, not a re-extract.
 */
jobRoutes.post("/:id/refresh", attachTokenBudget(), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const jobId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const html: string = typeof body?.html === "string" ? body.html : "";
  const url: string = typeof body?.url === "string" ? body.url : "";
  // The client identifies which fields are missing on the tracked job
  // and sends the allow-list here. Server honors it strictly — even if
  // other columns are also empty, we leave them alone. Falls back to
  // "fill any null" when absent so legacy callers still work.
  const missingFields: string[] | null = Array.isArray(body?.missingFields)
    ? body.missingFields.filter((f: unknown) => typeof f === "string")
    : null;
  if (!html) return c.json(error("VALIDATION_ERROR", "html is required"), 400);

  const db = getDb();
  const [row] = await db.select().from(schema.jobItems).where(eq(schema.jobItems.id, jobId)).limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Job not found"), 404);

  // Confirm the caller actually has this job in their tracker. Prevents a
  // random user from refreshing someone else's tracked job.
  const [saved] = await db
    .select({ jobId: schema.savedJobs.jobId })
    .from(schema.savedJobs)
    .where(and(eq(schema.savedJobs.userId, userId), eq(schema.savedJobs.jobId, jobId)))
    .limit(1);
  if (!saved) return c.json(error("FORBIDDEN", "This job isn't in your tracker."), 403);

  // Re-extract from the posted HTML. Same pipeline as /extract, so hit
  // rates / fallbacks are consistent.
  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;
  const result = await jobService.extractAndClassifyJob({ url, html, llm });
  if (!result.ok || !result.parsed) {
    return c.json(
      error("EXTRACTION_FAILED", result.reason || "Could not extract job data from this page."),
      422,
    );
  }
  let parsed = result.parsed;

  // JSON-LD-only extractions (confidence "high") often omit key fields
  // like jobType, salary, experienceLevel, skills — refresh is supposed
  // to fill them. If any of those are still empty after the first pass
  // and we have an API key, take a second pass with the LLM classifier
  // to fill the holes. Heuristic wins on conflict.
  const needsEnrichment =
    !parsed.jobType ||
    !parsed.experienceLevel ||
    parsed.salaryMin == null ||
    parsed.salaryMax == null ||
    !(parsed.skills && parsed.skills.length > 0) ||
    !(parsed.benefits && parsed.benefits.length > 0);
  if (llm && needsEnrichment) {
    parsed = await jobService.enrichParsedWithLLM(parsed, { url, html, llm });
  }

  // Merge policy lives in services/job.ts so it can be unit-tested
  // without spinning up Hono + DB. See computeRefreshBackfill() for
  // the exact rules (never overwrite, honor missingFields allow-list,
  // per-key details merging).
  const { updates, updatedFields } = jobService.computeRefreshBackfill({
    row,
    parsed,
    url,
    missingFields,
  });

  if (updatedFields.length === 0) {
    // Nothing to do — return the row as-is so the client can no-op gracefully.
    return c.json(
      success({
        ...row,
        applyUrl: jobService.deriveApplyUrl({ parsed, job: row, fallbackUrl: url }),
        updated: false,
        updatedFields: [],
      }),
      200,
    );
  }

  updates.updatedAt = new Date();
  const [updatedRow] = await db
    .update(schema.jobItems)
    .set(updates)
    .where(eq(schema.jobItems.id, jobId))
    .returning();

  return c.json(
    success({
      ...updatedRow,
      applyUrl: jobService.deriveApplyUrl({ parsed, job: updatedRow, fallbackUrl: url }),
      updated: true,
      updatedFields,
    }),
    200,
  );
});

/** GET /api/jobs/:id/metrics/time-to-hire — manager-only hiring-velocity metric */
jobRoutes.get("/:id/metrics/time-to-hire", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  // Require the same manager check the job detail uses; the metric
  // includes per-pipeline timing that competitors price as a Greenhouse-
  // tier feature, so we don't surface it to non-managers.
  const viewer = user?.sub
    ? {
        userId: user.sub,
        isSuperAdmin:
          user.isSuperAdmin === true ||
          user.roles?.includes(USER_ROLES.SUPER_ADMIN) === true,
      }
    : undefined;
  const job = await jobService.getJobById(id, undefined, viewer);
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);
  if (!(job as any).viewerCanManage) {
    return c.json(error("FORBIDDEN", "Only the job's manager can view hiring metrics"), 403);
  }
  const { computeTimeToHire } = await import("../services/job/time-to-hire.js");
  const metric = await computeTimeToHire(id);
  return c.json(success(metric));
});

/** GET /api/jobs/:id — get a specific job */
jobRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  // Pass viewer context so the DTO carries the backend's `viewerCanManage`
  // verdict. The frontend uses this flag (not its own role check) to gate
  // Edit Job + Candidates/Reports — without it, the frontend rule drifts
  // from `requireJobOwner` and non-owners see manage UI that 403s on use.
  const viewer = user?.sub
    ? {
        userId: user.sub,
        isSuperAdmin:
          user.isSuperAdmin === true ||
          user.roles?.includes(USER_ROLES.SUPER_ADMIN) === true,
      }
    : undefined;
  const job = await jobService.getJobById(id, undefined, viewer);
  if (!job) {
    return c.json(error("NOT_FOUND", "Job not found"), 404);
  }
  return c.json(success(job));
});

/** PUT /api/jobs/:id — update a job */
jobRoutes.put("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const updated = await jobService.updateJob(c.req.param("id"), parsed.data, userId);
  if (!updated) {
    return c.json(error("NOT_FOUND", "Job not found"), 404);
  }

  return c.json(success(updated));
});

/** DELETE /api/jobs/:id — delete a job */
jobRoutes.delete("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const user = c.var.user;
  const isAdmin = user?.isSuperAdmin === true || user?.roles?.includes(USER_ROLES.SUPER_ADMIN);
  const deleted = await jobService.deleteJob(c.req.param("id"), userId, isAdmin);
  if (!deleted) return c.json(error("NOT_FOUND", "Job not found or not owned by you"), 404);
  return c.json(success(null, "Job deleted"));
});

/** POST /api/jobs/:id/clone — duplicate a job the caller posted.
 *  Title gets " (Copy)" appended; the clone lands as inactive so the owner
 *  reviews + republishes intentionally. Mirrors the resume + studio-project
 *  clone pattern so every owner-created entity supports the universal Clone
 *  action. */
jobRoutes.post("/:id/clone", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [original] = await db
    .select()
    .from(schema.jobItems)
    .where(and(eq(schema.jobItems.id, c.req.param("id")), eq((schema.jobItems as any).postedByUserId, userId)))
    .limit(1);
  if (!original) return c.json(error("NOT_FOUND", "Job not found or not owned by you"), 404);
  // Drizzle keys we never copy: id (regenerated), createdAt/updatedAt (defaultNow),
  // sponsored billing fields (paid feature scoped to the original), and the
  // body-cleanse cursor (the clone re-enters the worker as a fresh row).
  const {
    id: _omitId,
    createdAt: _omitCreated,
    updatedAt: _omitUpdated,
    sponsored: _omitSponsored,
    sponsoredUntil: _omitSponsoredUntil,
    sponsoredRankBoost: _omitSponsoredRank,
    bodyCleansedAt: _omitCleansedAt,
    bodyCleanseStatus: _omitCleanseStatus,
    ...rest
  } = original as Record<string, unknown>;
  const [clone] = await db
    .insert(schema.jobItems)
    .values({
      ...rest,
      postedByUserId: userId,
      title: `${original.title} (Copy)`,
      isActive: false,
    } as any)
    .returning();
  const job = await jobService.getJobById(clone!.id);
  return c.json(success(job), 201);
});
