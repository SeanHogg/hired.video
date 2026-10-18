/**
 * /api/resumes — versions: snapshot history (#155) and the master/version
 * lineage the kit reviews use (was /api/resume-versions/*).
 *
 *   POST /master/facts                 write confirmed gap answers to the master
 *   GET  /:id/versions                 snapshot list
 *   POST /:id/versions                 snapshot now { label?, isAutosave? }
 *   POST /:id/versions/:vid/restore    restore a snapshot into the live résumé
 *   GET  /:id/versions/lineage         ★ master / version of ★ master / standalone, % different, stale
 *   POST /:id/versions/synced          a version took its master's content in
 *
 * Saving content AS a version of a master is a create:
 * `POST /api/resumes { source: "variation" }`.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { ConfirmedFactSchema } from "../../../../shared/resume-tailor.js";
import { DomainError } from "../../domains/errors.js";
import { invalidResumeContent, resumeNotFound } from "../../services/resume/errors.js";
import { liveResumes } from "../../services/resume/deps.js";
import { createSnapshot, listSnapshots, liveResumeVersions, restoreSnapshot } from "../../services/resume/history.js";
import { describeLineage, markVersionSynced, writeFactsToMaster } from "../../services/resume/lineage.js";
import { refreshDiffPercentFor } from "../../services/resume/view.js";
import { invalidResumeBodyHook, respond, type ResumeCtx } from "./shared.js";
import { validateJson } from "../helpers/validate.js";

export const resumeVersionRoutes = new Hono<AppEnv>();

const FactsSchema = z.object({ facts: z.array(ConfirmedFactSchema).min(1).max(20) });

async function writeFacts(c: ResumeCtx, facts: z.output<typeof FactsSchema>["facts"]) {
  const repo = liveResumes();
  const userId = c.var.userId;
  const outcome = await writeFactsToMaster(repo, userId, facts);
  // `in` narrowing — the API compiles with `strict: false`.
  if ("code" in outcome) {
    if (outcome.code === "NO_MASTER") throw new DomainError(404, "NO_MASTER", "You don't have a master résumé yet");
    throw invalidResumeContent(outcome.issues);
  }
  if (outcome.changed) await refreshDiffPercentFor(repo, userId, outcome.masterId);
  return { masterId: outcome.masterId, changed: outcome.changed };
}

resumeVersionRoutes.post("/master/facts", validateJson(FactsSchema, invalidResumeBodyHook, { emptyBody: null }), (c) =>
  respond(c, writeFacts(c, c.req.valid("json").facts)),
);

resumeVersionRoutes.get("/:id/versions/lineage", (c) =>
  respond(
    c,
    describeLineage(liveResumes(), c.var.userId, c.req.param("id")).then((lineage) => {
      if (!lineage) throw resumeNotFound();
      return lineage;
    }),
  ),
);

resumeVersionRoutes.post("/:id/versions/synced", (c) =>
  respond(
    c,
    markVersionSynced(liveResumes(), c.var.userId, c.req.param("id")).then((done) => {
      if (!done) throw resumeNotFound("Version not found");
      return { synced: true };
    }),
  ),
);

resumeVersionRoutes.get("/:id/versions", (c) => respond(c, listSnapshots(liveResumeVersions(), c.var.userId, c.req.param("id"))));

resumeVersionRoutes.post("/:id/versions", async (c) =>
  respond(c, createSnapshot(liveResumeVersions(), c.var.userId, c.req.param("id"), await c.req.json().catch(() => ({}))), 201),
);

resumeVersionRoutes.post("/:id/versions/:vid/restore", (c) =>
  respond(c, restoreSnapshot(liveResumeVersions(), liveResumes(), c.var.userId, c.req.param("id"), c.req.param("vid"))),
);
