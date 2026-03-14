import { Hono } from "hono";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import * as jobService from "../services/job.js";

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
});

const UpdateJobSchema = CreateJobSchema.partial();

// ============================================================================
// ROUTES
// ============================================================================

export const jobRoutes = new Hono<{ Variables: Variables }>();

/**
 * NOTE: This routes file currently contains stubbed behavior to support the frontend.
 * The real domain logic belongs in `api/src/services/job.ts` and should eventually
 * replace these stubs with real database-backed implementations.
 */

// Public listing endpoint. Frontend legacy calls /api/Job with query params.
jobRoutes.get("/", async (c) => {
  const query = c.req.query();
  const data = await jobService.getPublicJobs({
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 10,
    search: query.search,
    location: query.location,
  });
  return c.json(success(data));
});

/** POST /api/jobs or /api/job — create a new job (stub) */
jobRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }
  const created = await jobService.createJob(parsed.data);
  return c.json(success(created), 201);
});

/** GET /api/Job/GetSummaryItems (legacy) and /api/job/getsummaryitems **/
jobRoutes.get("/GetSummaryItems", async (c) => {
  const items = await jobService.getUserJobs();
  return c.json(success(items));
});
jobRoutes.get("/getsummaryitems", async (c) => {
  const items = await jobService.getUserJobs();
  return c.json(success(items));
});

/** GET /api/job/user-jobs — legacy recruiter flow alias */
jobRoutes.get("/user-jobs", async (c) => {
  const items = await jobService.getUserJobs();
  return c.json(success(items));
});

/** GET /api/Job/saved — get saved jobs */
jobRoutes.get("/saved", async (c) => {
  const items = await jobService.getSavedJobs();
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
  });
  return c.json(success(data));
});

/** POST /api/Job/:id/save — save/bookmark a job */
jobRoutes.post("/:id/save", async (c) => {
  await jobService.saveJob(c.req.param("id"));
  return c.json(success({ success: true }));
});

/** DELETE /api/Job/:id/save — remove saved job */
jobRoutes.delete("/:id/save", async (c) => {
  await jobService.unsaveJob(c.req.param("id"));
  return c.json(success({ success: true }));
});

/** POST /api/Job/:id/apply — apply to a job */
jobRoutes.post("/:id/apply", async (c) => {
  const body = await c.req.json().catch(() => null);
  await jobService.applyToJob(c.req.param("id"), body ?? { resumeId: "" });
  return c.json(success({ success: true }));
});

/** GET /api/Job/slug/:slug — get job by slug */
jobRoutes.get("/slug/:slug", async (c) => {
  const job = await jobService.getJobBySlug(c.req.param("slug"));
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);
  return c.json(success(job));
});

/** POST /api/Job/CreateFromFile — create job from uploaded file */
jobRoutes.post("/CreateFromFile", async (c) => {
  // Stubbed; requires file processing implementation
  return c.json(success({ success: true }), 200);
});
jobRoutes.post("/createfromfile", async (c) =>
  c.json(success({ success: true }), 200),
);

/** POST /api/Job/Extract — extract job from URL */
jobRoutes.post("/Extract", async (c) => {
  // Stubbed; requires scraping/storage logic
  return c.json(success({ success: true }), 200);
});
jobRoutes.post("/extract", async (c) =>
  c.json(success({ success: true }), 200),
);

/** GET /api/Job/applications — list user's job applications */
jobRoutes.get("/applications", async (c) => c.json(success([]), 200));

/** GET /api/Job/alerts — list user's job alerts */
jobRoutes.get("/alerts", async (c) => c.json(success([]), 200));

/** POST /api/Job/alerts — create alert */
jobRoutes.post("/alerts", async (c) => c.json(success({ success: true }), 201));

/** PUT /api/Job/alerts/:id — update alert */
jobRoutes.put("/alerts/:id", async (c) => c.json(success({ success: true }), 200));

/** PATCH /api/Job/alerts/:id/toggle — toggle alert active status */
jobRoutes.patch("/alerts/:id/toggle", async (c) => c.json(success({ success: true }), 200));

/** DELETE /api/Job/alerts/:id — delete alert */
jobRoutes.delete("/alerts/:id", async (c) => c.json(success({ success: true }), 200));

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
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const updated = await jobService.updateJob(c.req.param("id"), parsed.data);
  if (!updated) {
    return c.json(error("NOT_FOUND", "Job not found"), 404);
  }

  return c.json(success(updated));
});

/** DELETE /api/jobs/:id — delete a job */
jobRoutes.delete("/:id", async (c) => {
  await jobService.deleteJob(c.req.param("id"));
  return c.json(success(null, "Job deleted"));
});
