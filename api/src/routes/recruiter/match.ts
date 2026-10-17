/**
 * /api/recruiter/match — enqueue recruiter match scoring (202) and read
 * the cached scores.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { getMatchScores, queueCandidateScoring, queueJobScoring } from "../../services/recruiter/match-scoring.js";
import { handle } from "./http.js";

export const matchRoutes = new Hono<AppEnv>();

// POST /match/score-candidates — score all the recruiter's candidates against a job
matchRoutes.post("/match/score-candidates", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "envelope", async () => c.json(success(await queueCandidateScoring(user.sub, body.jobId)), 202));
});

// POST /match/score-jobs — score a candidate against all the recruiter's active jobs
matchRoutes.post("/match/score-jobs", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "envelope", async () => c.json(success(await queueJobScoring(user.sub, body.candidateId)), 202));
});

// GET /match/scores — cached match scores (?jobId= / ?candidateId=)
matchRoutes.get("/match/scores", async (c) => {
  const scores = await getMatchScores(c.get("user").sub, {
    jobId: c.req.query("jobId"),
    candidateId: c.req.query("candidateId"),
  });
  return c.json(success(scores));
});
