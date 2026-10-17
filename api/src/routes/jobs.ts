/**
 * /api/jobs (and legacy /api/job) — composition root.
 *
 * Sub-routers (routes/jobs/), mounted in this order so static segments keep
 * winning over `/:id` params exactly as when this was one file:
 *   sentiment.ts  POST /sentimentprediction (W2-1 moving it to the AI-tools dispatcher)
 *   tracker.ts    seeker tracker: /:id/save, /:id/status, /:id/apply
 *   screening.ts  /:id/screening[/preview|/backfill-preview|/backfill]
 *   listing.ts    GET /, /getsummaryitems, /user-jobs, /saved, /public, /slug/:slug, /applications
 *   alerts.ts     /alerts CRUD
 *   ingest.ts     /createfromfile, /extract, /:id/refresh
 *   manage.ts     POST /, /:id/archive|unarchive|clone, /:id/metrics/time-to-hire, GET|PUT|DELETE /:id (last)
 *
 * Use cases live in services/jobs/ (publicJobsQuery, jobLifecycle,
 * jobScreening, jobIngest); data access in repositories/jobsRepository.ts
 * and repositories/jobScreeningRepository.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { jobSentimentRoutes } from "./jobs/sentiment.js";
import { jobTrackerRoutes } from "./jobs/tracker.js";
import { jobScreeningRoutes } from "./jobs/screening.js";
import { jobListingRoutes } from "./jobs/listing.js";
import { jobAlertRoutes } from "./jobs/alerts.js";
import { jobIngestRoutes } from "./jobs/ingest.js";
import { jobManageRoutes } from "./jobs/manage.js";

export { CreateJobSchema, UpdateJobSchema, JobAlertSchema } from "./jobs/schemas.js";
export { extractCreateFromFilePayload } from "./jobs/payload.js";

export const jobRoutes = new Hono<AppEnv>()
  .route("/", jobSentimentRoutes)
  .route("/", jobTrackerRoutes)
  .route("/", jobScreeningRoutes)
  .route("/", jobListingRoutes)
  .route("/", jobAlertRoutes)
  .route("/", jobIngestRoutes)
  .route("/", jobManageRoutes);
