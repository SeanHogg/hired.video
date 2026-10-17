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
import { fail, ok, studioErrorResponse } from "./http.js";

export const studioProjectSubjectRoutes = new Hono<AppEnv>();

const SubjectBodySchema = z.object({
  kind: z.enum(STUDIO_SUBJECT_KINDS),
  id:   z.string().min(1).max(200),
});

studioProjectSubjectRoutes.post("/projects/:projectId/subjects", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SubjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  try {
    return c.json(ok(await addProjectSubject(c.var.user.sub, c.req.param("projectId"), parsed.data)), 201);
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

studioProjectSubjectRoutes.delete("/projects/:projectId/subjects/:kind/:subjectId", async (c) => {
  const kind = c.req.param("kind");
  if (!STUDIO_SUBJECT_KINDS.includes(kind as (typeof STUDIO_SUBJECT_KINDS)[number])) {
    return c.json(fail("VALIDATION_ERROR", "Unknown subject kind"), 400);
  }
  try {
    const result = await removeProjectSubject(c.var.user.sub, c.req.param("projectId"), {
      kind,
      id: c.req.param("subjectId"),
    });
    return c.json(ok(result));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});
