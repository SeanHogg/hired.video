import { Hono } from "hono";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import * as jobService from "../services/job.js";
import { getApiKey } from "../services/ai.js";

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
});

const UpdateJobSchema = CreateJobSchema.partial();

const JobAlertSchema = z.object({
  name: z.string().min(1),
  keywords: z.string().optional(),
  location: z.string().optional(),
  jobType: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const jobRoutes = new Hono<{ Variables: Variables }>();

// Public listing endpoint. Frontend legacy calls /api/Job with query params.
jobRoutes.get("/", async (c) => {
  const query = c.req.query();
  const data = await jobService.getPublicJobs({
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 10,
    search: query.search,
    location: query.location,
    employmentType: query.employmentType,
    experienceLevel: query.experienceLevel,
    isRemote: query.isRemote === "true" ? true : query.isRemote === "false" ? false : undefined,
    salaryMin: query.salaryMin ? Number(query.salaryMin) : undefined,
    salaryMax: query.salaryMax ? Number(query.salaryMax) : undefined,
  });
  return c.json(success(data));
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

/** GET /api/jobs/public — explicit public listing */
jobRoutes.get("/public", async (c) => {
  const query = c.req.query();
  const data = await jobService.getPublicJobs({
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 10,
    search: query.search,
    location: query.location,
    employmentType: query.employmentType,
    experienceLevel: query.experienceLevel,
    isRemote: query.isRemote === "true" ? true : query.isRemote === "false" ? false : undefined,
    salaryMin: query.salaryMin ? Number(query.salaryMin) : undefined,
    salaryMax: query.salaryMax ? Number(query.salaryMax) : undefined,
  });
  return c.json(success(data));
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

/** POST /api/Job/:id/apply — apply to a job */
jobRoutes.post("/:id/apply", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  await jobService.applyToJob(c.req.param("id"), userId, body ?? { resumeId: "" });
  return c.json(success({ success: true }));
});

/** GET /api/Job/slug/:slug — get job by slug */
jobRoutes.get("/slug/:slug", async (c) => {
  const job = await jobService.getJobBySlug(c.req.param("slug"));
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

/** POST /api/Job/CreateFromFile — create job from uploaded file */
jobRoutes.post("/CreateFromFile", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const contentType = c.req.header("Content-Type") ?? "";
  let title = "Imported Job";
  let description = "";
  let location: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file") as File | null;
    if (file) {
      title = file.name;
      description = await file.text().catch(() => "");
    }
    if (form?.has("location")) {
      location = String(form.get("location"));
    }
  } else {
    const body = await c.req.json().catch(() => null);
    if (body) {
      if (typeof body.title === "string") title = body.title;
      if (typeof body.description === "string") description = body.description;
      if (typeof body.location === "string") location = body.location;
    }
  }

  const created = await jobService.createJob({ title, description, location }, userId);
  return c.json(success(created), 201);
});
jobRoutes.post("/createfromfile", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const title = body?.title ? String(body.title) : "Imported Job";
  const description = body?.description ? String(body.description) : "";
  const location = typeof body?.location === "string" ? body.location : undefined;

  const created = await jobService.createJob({ title, description, location }, userId);
  return c.json(success(created), 201);
});

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

  const apiKey = getApiKey(c.env as { OPENROUTER_API_KEY?: string });

  // ---- Step 1: classify the page --------------------------------
  const result = await jobService.extractAndClassifyJob({
    url: sourceUrl,
    html,
    apiKey,
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
      apiKey,
    );

    if (dedup.outcome === 'exact' && dedup.existingJob) {
      // Exact match — just bookmark the existing row.
      if (track) {
        const db = getDb();
        await db.insert(jobService.schema_savedJobs).values({ userId, jobId: dedup.existingJob.id }).onConflictDoNothing();
      }
      const dedupApplyUrl = parsed.applyUrl || dedup.existingJob.sourceUrl || sourceUrl || undefined;
      return c.json(success({ ...dedup.existingJob, applyUrl: dedupApplyUrl }), 200);
    }

    if (dedup.outcome === 'fuzzy' && dedup.existingJob) {
      // AI-confirmed fuzzy match — treat like exact.
      if (track) {
        const db = getDb();
        await db.insert(jobService.schema_savedJobs).values({ userId, jobId: dedup.existingJob.id }).onConflictDoNothing();
      }
      const dedupApplyUrl = parsed.applyUrl || dedup.existingJob.sourceUrl || sourceUrl || undefined;
      return c.json(success({ ...dedup.existingJob, applyUrl: dedupApplyUrl }), 200);
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

  // Attach applyUrl from the parsed data — this is the direct application
  // link (e.g. Workday, Greenhouse) which may differ from the sourceUrl
  // (where the job was found). Falls back to sourceUrl if none was extracted.
  const applyUrl = parsed.applyUrl || sourceUrl || undefined;

  return c.json(success({ ...created, applyUrl }), 201);
};
jobRoutes.post("/Extract", extractHandler);
jobRoutes.post("/extract", extractHandler);

/** GET /api/jobs/:id — get a specific job */
jobRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const job = await jobService.getJobById(id);
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
  const isAdmin = user?.isSuperAdmin === true || user?.roles?.includes("SuperAdmin") || user?.roles?.includes("super_admin");
  const deleted = await jobService.deleteJob(c.req.param("id"), userId, isAdmin);
  if (!deleted) return c.json(error("NOT_FOUND", "Job not found or not owned by you"), 404);
  return c.json(success(null, "Job deleted"));
});
