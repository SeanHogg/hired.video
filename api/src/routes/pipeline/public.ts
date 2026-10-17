/**
 * Public hiring-manager portal read — `GET /api/pipeline/public/:shareToken`.
 * No auth (`/api/pipeline/public/` is in app.ts PUBLIC_PREFIXES): the
 * unguessable token is the grant. Returns a redacted snapshot (no contact PII).
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { getPublicPortal } from "../../services/pipeline/PipelineShareService.js";

export const pipelinePublicRoutes = new Hono<AppEnv>();

pipelinePublicRoutes.get("/:shareToken", async (c) => {
  const result = await getPublicPortal(c.req.param("shareToken"));
  if ("error" in result) {
    if (result.error === "EXPIRED") return c.json(error("EXPIRED", "Share link has expired"), 410);
    if (result.error === "JOB_NOT_FOUND") return c.json(error("NOT_FOUND", "Job not found"), 404);
    return c.json(error("NOT_FOUND", "Share link not found"), 404);
  }
  return c.json(success(result), 200);
});
