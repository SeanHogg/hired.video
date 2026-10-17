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
import { invalidResumeBody } from "../../services/resume/errors.js";
import { ownerId, respond, resumeDeps, type ResumeCtx } from "./shared.js";

export const resumeStateRoutes = new Hono<AppEnv>();

async function patch(c: ResumeCtx) {
  const parsed = ResumeStatePatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw invalidResumeBody(parsed.error.flatten());
  return patchResumeState(resumeDeps(c), ownerId(c), c.req.param("id"), parsed.data);
}

resumeStateRoutes.patch("/:id", (c) => respond(c, patch(c)));
