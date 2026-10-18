/**
 * PATCH /api/resumes/:id — one validated body for every state flip:
 *   { archived?, isMaster?: true, isActive?: true, privacy?, parentId?: null, status? }
 * (was POST /:id/archive|unarchive|setmaster|setactive|setprivacy|promote|detach|publish).
 * Returns the updated résumé.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { ResumeStatePatchSchema } from "../../../../shared/resume-create.js";
import { patchResumeState } from "../../services/resume/commands.js";
import { invalidResumeBodyHook, respond, resumeDeps } from "./shared.js";
import { validateJson } from "../helpers/validate.js";

export const resumeStateRoutes = new Hono<AppEnv>();

resumeStateRoutes.patch("/:id", validateJson(ResumeStatePatchSchema, invalidResumeBodyHook, { emptyBody: null }), (c) =>
  respond(c, patchResumeState(resumeDeps(c), c.var.userId, c.req.param("id"), c.req.valid("json"))),
);
