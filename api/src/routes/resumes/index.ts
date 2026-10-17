/**
 * /api/resumes — ONE router (was routes/resumes.ts + resume-versions.ts +
 * resume-roast.ts and the /api/resume alias). Sub-routers are thin
 * adapters over services/resume (queries, commands, create, history,
 * lineage, merge-flow); none of them touches Drizzle.
 *
 * Registration order matters: static paths (/public, /parse, /merge/*,
 * /watched, /master/facts) come before the `/:id` patterns in crud.ts.
 * The root (GET/POST "/") is registered here once — lazyRoute mounts this
 * app with `route(prefix, …)`, which matches the bare prefix.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { resumeAiRoutes } from "./ai.js";
import { resumeCreateRoutes } from "./create.js";
import { resumeCrudRoutes } from "./crud.js";
import { resumeMergeRoutes } from "./merge.js";
import { resumePublishRoutes } from "./publish.js";
import { resumeStateRoutes } from "./state.js";
import { resumeVersionRoutes } from "./versions.js";
import { resumeWatchRoutes } from "./watch.js";

export const resumeRoutes = new Hono<AppEnv>()
  .route("/", resumePublishRoutes)
  .route("/", resumeAiRoutes)
  .route("/", resumeMergeRoutes)
  .route("/", resumeWatchRoutes)
  .route("/", resumeVersionRoutes)
  .route("/", resumeCreateRoutes)
  .route("/", resumeStateRoutes)
  .route("/", resumeCrudRoutes);
