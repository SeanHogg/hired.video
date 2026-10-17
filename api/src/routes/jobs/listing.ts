/**
 * Job read/listing endpoints (single-segment statics + slug lookup):
 *
 *   GET /                 public listing (`?fields=` projection, #1370)
 *   GET /getsummaryitems  caller's posted jobs
 *   GET /user-jobs        legacy recruiter-flow alias of the above
 *   GET /saved            caller's tracked jobs
 *   GET /public           explicit public listing (`?fields=`)
 *   GET /slug/:slug       job by slug
 *   GET /applications     caller's job applications
 *
 * Mounted before manage.ts so these statics win over `GET /:id`.
 */
import { Hono } from "hono";
import type { AppContext, AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import * as jobService from "../../services/job/JobService.js";
import { publicJobsFromQuery } from "../../services/jobs/publicJobsQuery.js";
import { JOB_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import { jobViewerOf } from "./http.js";

export const jobListingRoutes = new Hono<AppEnv>();

/** Public listing with optional `?fields=id,title,slug,...` projection so
 *  list views don't drag the full job body over the wire — descriptions +
 *  JSONB blobs alone are usually 10× the size of the card-view fields. */
async function publicListing(c: AppContext): Promise<Response> {
  const data = await publicJobsFromQuery(c.req.query(), (c.env ?? {}) as Record<string, string | undefined>);
  const fields = parseFields(c.req.query("fields"), JOB_LIST_FIELDS);
  return c.json(success({ ...data, items: projectRows(data.items as unknown as Array<Record<string, unknown>>, fields) }));
}

/** The caller's posted jobs — `/getsummaryitems` and its `/user-jobs` alias. */
async function userJobs(c: AppContext): Promise<Response> {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const items = await jobService.getUserJobs(userId);
  return c.json(success(items));
}

jobListingRoutes.get("/", publicListing);
jobListingRoutes.get("/getsummaryitems", userJobs);
jobListingRoutes.get("/user-jobs", userJobs);

jobListingRoutes.get("/saved", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const items = await jobService.getSavedJobs(userId);
  return c.json(success(items));
});

jobListingRoutes.get("/public", publicListing);

jobListingRoutes.get("/slug/:slug", async (c) => {
  const job = await jobService.getJobBySlug(c.req.param("slug"), jobViewerOf(c));
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);
  return c.json(success(job));
});

jobListingRoutes.get("/applications", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const apps = await jobService.getApplications(userId);
  return c.json(success(apps));
});
