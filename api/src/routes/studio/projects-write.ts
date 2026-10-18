/**
 * Studio project writes (W2-3a split of routes/studio.ts):
 *   DELETE /api/studio/projects/:projectId            — delete with its media
 *   PATCH  /api/studio/projects/:projectId            — { status?, isPublic? } (publish / visibility)
 *   PATCH  /api/studio/projects/:projectId/visibility — legacy alias (Chrome extension only)
 *   POST   /api/studio/projects/:projectId/clone      — draft copy
 */
import { Hono, type Context } from "hono";
import { z, type ZodError } from "zod";
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
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const studioProjectWriteRoutes = new Hono<AppEnv>();

studioProjectWriteRoutes.delete("/projects/:projectId", async (c) => {
  return c.json(success(await deleteStudioProject(c.var.userId, c.req.param("projectId"))));
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
  const result = await updateStudioProject(c.var.userId, c.req.param("projectId"), input, updateHooks(c));
  if ("blocked" in result) return result.blocked;
  return c.json(success(result.project));
}

// The canonical publish / unpublish / visibility write. `status: "published"`
// = "Publish to Profile" (primary-profile pointer, render privacy mirror,
// profile publication record); `"exported"` = "Remove from Profile";
// `isPublic` toggles public / unlisted. Both → status first, then visibility.
const invalidProjectPatch = (e: ZodError) =>
  error("VALIDATION_ERROR", e.issues.some((i) => i.path[0] === "status") ? "Invalid status" : "Invalid request", e.flatten());

studioProjectWriteRoutes.patch("/projects/:projectId", validateJson(ProjectPatchSchema, invalidProjectPatch, { emptyBody: null }), async (c) => {
  return runProjectUpdate(c, c.req.valid("json"));
});

// Extension-only alias: the published Chrome extension still sends
// `{ isPublic }` here. Same use case as PATCH /projects/:projectId; new
// clients use that route.
// DEPRECATED alias for extension <= current version — remove after next CWS release
studioProjectWriteRoutes.patch("/projects/:projectId/visibility", validateJson(z.object({ isPublic: z.boolean() }), undefined, { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return runProjectUpdate(c, { isPublic: body.isPublic });
});

studioProjectWriteRoutes.post("/projects/:projectId/clone", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await cloneStudioProject(userId, c.req.param("projectId"), body)), 201);
});
