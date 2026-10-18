/**
 * Per-link subject management on a studio project (W2-3a split of
 * routes/studio.ts). Both are idempotent:
 *   POST   /api/studio/projects/:projectId/subjects                  — add one link
 *   DELETE /api/studio/projects/:projectId/subjects/:kind/:subjectId — remove one link
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { STUDIO_SUBJECT_KINDS } from "../../../../shared/studio-subject.js";
import { addProjectSubject, removeProjectSubject } from "../../services/studio/project-subjects.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const studioProjectSubjectRoutes = new Hono<AppEnv>();

const SubjectBodySchema = z.object({
  kind: z.enum(STUDIO_SUBJECT_KINDS),
  id:   z.string().min(1).max(200),
});

studioProjectSubjectRoutes.post("/projects/:projectId/subjects", validateJson(SubjectBodySchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await addProjectSubject(c.var.userId, c.req.param("projectId"), body)), 201);
});

studioProjectSubjectRoutes.delete("/projects/:projectId/subjects/:kind/:subjectId", async (c) => {
  const kind = c.req.param("kind");
  if (!STUDIO_SUBJECT_KINDS.includes(kind as (typeof STUDIO_SUBJECT_KINDS)[number])) {
    return c.json(error("VALIDATION_ERROR", "Unknown subject kind"), 400);
  }
  const result = await removeProjectSubject(c.var.userId, c.req.param("projectId"), {
    kind,
    id: c.req.param("subjectId"),
  });
  return c.json(success(result));
});
