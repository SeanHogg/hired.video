/**
 * /api/resumes — following other people's résumés (#403).
 *
 *   GET    /watched      every résumé the caller follows (newest first)
 *   PUT    /:id/watch    follow   (was POST /watch/:id)
 *   DELETE /:id/watch    unfollow (was POST /unwatch/:id)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { requireUserId } from "../../domains/errors.js";
import { ResumeVersionRepository } from "../../repositories/resumeVersionRepository.js";
import { unwatchResume, watchResume } from "../../services/resume/commands.js";
import { listWatched } from "../../services/resume/history.js";
import { respond, resumeDeps } from "./shared.js";

export const resumeWatchRoutes = new Hono<AppEnv>();

// `/watched` is a single segment, so app.ts's optional-auth detail regex can
// match it — require the user here rather than trusting the mode.
resumeWatchRoutes.get("/watched", (c) =>
  respond(c, Promise.resolve().then(() => listWatched(new ResumeVersionRepository(getDb()), requireUserId(c.var.user?.sub)))),
);

resumeWatchRoutes.put("/:id/watch", (c) => respond(c, watchResume(resumeDeps(c), c.var.user.sub, c.req.param("id"))));

resumeWatchRoutes.delete("/:id/watch", (c) => respond(c, unwatchResume(resumeDeps(c), c.var.user.sub, c.req.param("id"))));
