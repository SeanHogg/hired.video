/**
 * Live-screening (ZipIntro-style) routes.
 *
 * Two routers exported:
 *   - liveScreenRecruiterRoutes — mounted under /api/recruiter/live-screen,
 *     auth required. Recruiter creates a window, schedules candidates
 *     into back-to-back slots, marks no-shows, and lists historical
 *     sessions.
 *
 *   - liveScreenPublicRoutes — mounted under /api/live-screen, token-only.
 *     Candidate visits the magic link in their invite email, sees the
 *     slot details, accepts or declines. No auth so we can drive the
 *     flow from email / SMS deep links with no friction.
 *
 * Use cases live in services/recruiter/live-screen-sessions.ts (scheduling
 * maths in live-screen-scheduler.ts, persistence in liveScreeningRepository).
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import {
  autoMatchLiveScreenSession,
  createLiveScreenSession,
  getLiveScreenSessionDetail,
  getPublicLiveScreenInvite,
  listLiveScreenSessions,
  respondToLiveScreenInvite,
  scheduleLiveScreenCandidates,
} from "../services/recruiter/live-screen-sessions.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

// ---------------------------------------------------------------------------
// Recruiter-scoped router
// ---------------------------------------------------------------------------

export const liveScreenRecruiterRoutes = new Hono<AppEnv>();

const CreateSessionSchema = z.object({
  title: z.string().min(1).max(255),
  jobId: UuidLikeSchema.optional().nullable(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  slotMinutes: z.number().int().min(3).max(60).optional().default(8),
  meetingUrl: z.string().url().optional().nullable(),
  criteria: z.record(z.string(), z.unknown()).optional().default({}),
});

liveScreenRecruiterRoutes.post("/sessions", validateJson(CreateSessionSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const rId = requireUser(c);
  const body = c.req.valid("json");
  const session = await createLiveScreenSession(rId, {
    title: body.title,
    jobId: body.jobId ?? null,
    startTime: body.startTime,
    endTime: body.endTime,
    slotMinutes: body.slotMinutes,
    meetingUrl: body.meetingUrl ?? null,
    criteria: body.criteria,
  });
  return c.json(success(session), 200);
});

liveScreenRecruiterRoutes.get("/sessions", async (c) => {
  const rId = requireUser(c);
  return c.json(success(await listLiveScreenSessions(rId)), 200);
});

liveScreenRecruiterRoutes.get("/sessions/:id", async (c) => {
  const rId = requireUser(c);
  return c.json(success(await getLiveScreenSessionDetail(rId, c.req.param("id"))), 200);
});

const ScheduleCandidatesSchema = z.object({
  candidates: z
    .array(
      z.object({
        candidateId: UuidLikeSchema.nullable(),
        candidateName: z.string().min(1).max(255),
        candidateEmail: z.string().email().optional().nullable(),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * POST /sessions/:id/auto-match
 *
 * ZipIntro parity #1208: instead of forcing the recruiter to POST a
 * candidate list, pull the top N scored candidates from their most
 * recent `recruiter_agent_runs` row that matches this session's
 * `job_id`, then run them through the same scheduler the manual
 * `/schedule` endpoint uses. Net result for the recruiter: "I declared
 * the window — fill it for me from the agent."
 *
 * Body: { runId?: string, limit?: number } — runId is optional; if
 * omitted, the latest completed agent run for this job is used.
 */
liveScreenRecruiterRoutes.post("/sessions/:id/auto-match", async (c) => {
  const rId = requireUser(c);
  const body = ((await c.req.json().catch(() => null)) ?? {}) as { runId?: unknown; limit?: unknown };
  const limit = Math.min(50, Math.max(1, Number(body.limit ?? 25)));
  const runId = body.runId ? String(body.runId) : undefined;
  return c.json(success(await autoMatchLiveScreenSession(rId, c.req.param("id"), { runId, limit })), 200);
});

liveScreenRecruiterRoutes.post("/sessions/:id/schedule", validateJson(ScheduleCandidatesSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const rId = requireUser(c);
  const body = c.req.valid("json");
  // candidateId is required-but-nullable on the wire; the schema already
  // rejected a missing key, so `?? null` only normalises the inferred type.
  const candidates = body.candidates.map((cand) => ({
    candidateId: cand.candidateId ?? null,
    candidateName: cand.candidateName,
    candidateEmail: cand.candidateEmail,
  }));
  return c.json(success(await scheduleLiveScreenCandidates(rId, c.req.param("id"), candidates)), 200);
});

// ---------------------------------------------------------------------------
// Public (token-only) router
// ---------------------------------------------------------------------------

export const liveScreenPublicRoutes = new Hono<AppEnv>();

const RespondSchema = z.object({
  action: z.enum(["accept", "decline"]),
  notes: z.string().max(2000).optional(),
});

liveScreenPublicRoutes.get("/invites/:token", async (c) => {
  return c.json(success(await getPublicLiveScreenInvite(c.req.param("token"))), 200);
});

liveScreenPublicRoutes.post("/invites/:token/respond", validateJson(RespondSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await respondToLiveScreenInvite(c.req.param("token"), body.action, body.notes)), 200);
});
