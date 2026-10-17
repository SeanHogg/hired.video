/**
 * `/api/pipeline` — the ONE candidate-pipeline resource.
 *
 *   /public/:shareToken   anonymous hiring-manager portal read (./public.ts)
 *   /share                owner share-link management (./share.ts)
 *   /submissions          agency recruiter's submissions board
 *   / , /reports, /:entryId[...]   board + entry CRUD (./entries.ts)
 *
 * Sub-routers with fixed first segments are registered before the
 * `/:entryId` entry routes so they keep priority.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { buildSubmissionsBoard } from "../../services/pipeline/submissionsBoard.js";
import { pipelinePublicRoutes } from "./public.js";
import { pipelineShareRoutes } from "./share.js";
import { pipelineEntryRoutes } from "./entries.js";

export const pipelineRoutes = new Hono<AppEnv>();

pipelineRoutes.route("/public", pipelinePublicRoutes);
pipelineRoutes.route("/share", pipelineShareRoutes);

// GET /submissions — the recruiter's candidate_submissions bucketed by status
// into sourcing stages (recruiter side-panel extension board).
pipelineRoutes.get("/submissions", async (c) => {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success({ stages: await buildSubmissionsBoard(userId) }));
});

pipelineRoutes.route("/", pipelineEntryRoutes);
