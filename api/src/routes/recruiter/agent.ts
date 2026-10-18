/**
 * /api/recruiter/agent — AI Recruiter Agent (#66): sourcing runs, brief →
 * criteria intake (Agent v2), and scheduled follow-ups.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  cancelFollowup,
  deriveAgentCriteria,
  getAgentRun,
  listAgentRuns,
  listFollowups,
  runSourcingAgent,
  scheduleAgentFollowup,
} from "../../services/recruiter/agent-sourcing.js";
import { recruiterLlmFor } from "../../services/recruiter/llm.js";
import { handle, responseEnvelope } from "./http.js";

export const agentRoutes = new Hono<AppEnv>();

/**
 * POST /agent/source
 * Body: { jobId?, jobTitle, skills[], location?, experienceYears?, maxCandidates? }
 * Scores matching candidates and generates personalised outreach via LLM.
 */
agentRoutes.post("/agent/source", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "bare", async () => {
    const llm = recruiterLlmFor(c.env, c.var.user);
    return c.json(responseEnvelope(await runSourcingAgent(user.sub, body, llm)), 200);
  });
});

/** GET /agent/runs — past sourcing runs for this recruiter */
agentRoutes.get("/agent/runs", async (c) => {
  return c.json(responseEnvelope(await listAgentRuns(c.var.userId)), 200);
});

/** GET /agent/runs/:id — one run with full results */
agentRoutes.get("/agent/runs/:id", async (c) => {
  const user = c.get("user");
  return handle(c, "bare", async () => c.json(responseEnvelope(await getAgentRun(user.sub, c.req.param("id"))), 200));
});

// POST /agent/intake — natural-language brief or existing jobId → the
// structured criteria /agent/source expects (heuristic without an LLM key).
agentRoutes.post("/agent/intake", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "envelope", async () => {
    const criteria = await deriveAgentCriteria(body, recruiterLlmFor(c.env, c.var.user));
    return c.json(responseEnvelope(criteria), 200);
  });
});

// POST /agent/followups/schedule — persisted to recruiter_agent_followups,
// fired by workers/recruiter-agent-followup.ts.
agentRoutes.post("/agent/followups/schedule", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "envelope", async () => c.json(responseEnvelope(await scheduleAgentFollowup(user.sub, body)), 200));
});

agentRoutes.get("/agent/followups", async (c) => {
  const rows = await listFollowups(c.var.userId, c.req.query("status") ?? null);
  return c.json(responseEnvelope(rows), 200);
});

agentRoutes.post("/agent/followups/:id/cancel", async (c) => {
  const user = c.get("user");
  return handle(c, "envelope", async () => c.json(responseEnvelope(await cancelFollowup(user.sub, c.req.param("id"))), 200));
});
