/**
 * The ONE public studio read namespace (no auth required):
 *   GET /api/studio/public                                  — discovery feed + home video wall
 *   GET /api/studio/public?subjectKind=…&subjectId=…        — a subject's public projects (#323)
 *   GET /api/studio/public/:videoId                         — the watch payload (/v/:id, /m/:slug)
 * Consolidates the former GET /videos/public and GET /projects/public
 * (W2-3a). The subject list keeps the full project DTO shape; the feed keeps
 * the PublicVideo shape.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { STUDIO_SUBJECT_KINDS } from "../../../../shared/studio-subject.js";
import { getPublicVideoFeed } from "../../services/studio/public-video-feed.js";
import { listPublicSubjectProjects } from "../../services/studio/video-catalog.js";
import { getPublicWatchPayload } from "../../services/studio/public-watch-payload.js";
import { fail, ok } from "./http.js";

export const studioPublicRoutes = new Hono<AppEnv>();

function isSubjectKind(kind: string): kind is (typeof STUDIO_SUBJECT_KINDS)[number] {
  return (STUDIO_SUBJECT_KINDS as readonly string[]).includes(kind);
}

studioPublicRoutes.get("/public", async (c) => {
  const subjectKind = c.req.query("subjectKind");
  const subjectId = c.req.query("subjectId");
  // No subject filter → the feed (cached until a video changes).
  if (subjectKind === undefined && subjectId === undefined) {
    return c.json(ok(await getPublicVideoFeed()));
  }
  if (!subjectKind || !subjectId || !isSubjectKind(subjectKind)) {
    return c.json(fail("VALIDATION_ERROR", "subjectKind and subjectId are required"), 400);
  }
  return c.json(ok(await listPublicSubjectProjects({ kind: subjectKind, id: subjectId })));
});

studioPublicRoutes.get("/public/:videoId", async (c) => {
  const result = await getPublicWatchPayload(c.req.param("videoId"));
  return c.json(result.body, result.status);
});
