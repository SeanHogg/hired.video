/**
 * Studio project writes (W2-3a split of routes/studio.ts):
 *   DELETE /api/studio/projects/:projectId            — delete with its media
 *   PATCH  /api/studio/projects/:projectId            — { status?, isPublic? } (publish / visibility)
 *   PATCH  /api/studio/projects/:projectId/visibility — legacy alias (Chrome extension only)
 *   POST   /api/studio/projects/:projectId/clone      — draft copy
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { candidateConsentGate } from "../candidate-consent-gate.js";
import { postChannelGate } from "../../services/studio/post-channel-gate.js";
import { scheduleVideoScan } from "../../services/moderation/explicit/schedule.js";
import {
  PROJECT_STATUSES,
  updateStudioProject,
  type ProjectUpdateHooks,
  type ProjectUpdateInput,
} from "../../services/studio/project-update.js";
import { cloneStudioProject, deleteStudioProject } from "../../services/studio/project-commands.js";
import { fail, ok, studioErrorResponse } from "./http.js";

export const studioProjectWriteRoutes = new Hono<AppEnv>();

studioProjectWriteRoutes.delete("/projects/:projectId", async (c) => {
  try {
    return c.json(ok(await deleteStudioProject(c.var.user.sub, c.req.param("projectId"))));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

const ProjectPatchSchema = z
  .object({
    status: z.enum(PROJECT_STATUSES).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((d) => d.status !== undefined || d.isPublic !== undefined, {
    message: "status or isPublic is required",
  });

/** The request-bound gates + scan the project-state use case runs. */
function updateHooks(c: Context<AppEnv>): ProjectUpdateHooks<Response> {
  return {
    async gatePublish(projectId) {
      return (await candidateConsentGate(c, projectId)) ?? (await postChannelGate(c, projectId, "profile"));
    },
    gateMakePublic: (projectId) => candidateConsentGate(c, projectId),
    scheduleScan: (videoId) => scheduleVideoScan(c, videoId),
  };
}

async function runProjectUpdate(c: Context<AppEnv>, input: ProjectUpdateInput): Promise<Response> {
  try {
    const result = await updateStudioProject(c.var.user.sub, c.req.param("projectId"), input, updateHooks(c));
    if ("blocked" in result) return result.blocked;
    return c.json(ok(result.project));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
}

// The canonical publish / unpublish / visibility write. `status: "published"`
// = "Publish to Profile" (primary-profile pointer, render privacy mirror,
// profile publication record); `"exported"` = "Remove from Profile";
// `isPublic` toggles public / unlisted. Both → status first, then visibility.
studioProjectWriteRoutes.patch("/projects/:projectId", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ProjectPatchSchema.safeParse(body);
  if (!parsed.success) {
    const statusInvalid = parsed.error.issues.some((i) => i.path[0] === "status");
    return c.json(
      fail("VALIDATION_ERROR", statusInvalid ? "Invalid status" : "Invalid request", parsed.error.flatten()),
      400,
    );
  }
  return runProjectUpdate(c, parsed.data);
});

// Extension-only alias: the published Chrome extension still sends
// `{ isPublic }` here. Same use case as PATCH /projects/:projectId; new
// clients use that route.
// DEPRECATED alias for extension <= current version — remove after next CWS release
studioProjectWriteRoutes.patch("/projects/:projectId/visibility", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ isPublic: z.boolean() }).safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  return runProjectUpdate(c, { isPublic: parsed.data.isPublic });
});

studioProjectWriteRoutes.post("/projects/:projectId/clone", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  try {
    return c.json(ok(await cloneStudioProject(userId, c.req.param("projectId"), body)), 201);
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});
