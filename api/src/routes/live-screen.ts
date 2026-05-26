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
 * Scheduling is delegated to services/recruiter/live-screen-scheduler.ts
 * (pure, unit-tested). Persistence is straightforward inserts into
 * live_screening_sessions / live_screening_invites (migration 0118).
 */

import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  buildBackToBackSchedule,
  generateInviteToken,
  windowCapacity,
  type ScheduleCandidate,
} from "../services/recruiter/live-screen-scheduler.js";

// ---------------------------------------------------------------------------
// Recruiter-scoped router
// ---------------------------------------------------------------------------

export const liveScreenRecruiterRoutes = new Hono<AppEnv>();

function recruiterId(c: any): string {
  return (c.var.user?.sub as string) ?? "";
}

const CreateSessionSchema = z.object({
  title: z.string().min(1).max(255),
  jobId: UuidLikeSchema.optional().nullable(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  slotMinutes: z.number().int().min(3).max(60).optional().default(8),
  meetingUrl: z.string().url().optional().nullable(),
  criteria: z.record(z.string(), z.unknown()).optional().default({}),
});

liveScreenRecruiterRoutes.post("/sessions", async (c) => {
  const rId = recruiterId(c);
  if (!rId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);
  if (!(end > start)) {
    return c.json(error("VALIDATION_ERROR", "endTime must be after startTime"), 400);
  }

  const db = getDb();
  const sessionsTable = (schema as any).liveScreeningSessions;
  if (!sessionsTable) return c.json(error("SERVICE_UNAVAILABLE", "Live screening unavailable"), 503);

  const [row] = await (db
    .insert(sessionsTable)
    .values({
      recruiterId: rId,
      jobId: parsed.data.jobId ?? null,
      title: parsed.data.title,
      startTime: start,
      endTime: end,
      slotMinutes: parsed.data.slotMinutes,
      meetingUrl: parsed.data.meetingUrl ?? null,
      criteria: parsed.data.criteria as any,
      status: parsed.data.meetingUrl ? "scheduled" : "draft",
    })
    .returning() as any);

  return c.json(
    success({
      ...row,
      capacity: windowCapacity(start, end, parsed.data.slotMinutes),
    }),
    200,
  );
});

liveScreenRecruiterRoutes.get("/sessions", async (c) => {
  const rId = recruiterId(c);
  if (!rId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const sessionsTable = (schema as any).liveScreeningSessions;
  if (!sessionsTable) return c.json(success([]), 200);
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.recruiterId, rId))
    .orderBy(desc(sessionsTable.startTime))
    .limit(50);
  return c.json(success(rows), 200);
});

liveScreenRecruiterRoutes.get("/sessions/:id", async (c) => {
  const rId = recruiterId(c);
  if (!rId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const sessionsTable = (schema as any).liveScreeningSessions;
  const invitesTable = (schema as any).liveScreeningInvites;
  if (!sessionsTable) return c.json(error("NOT_FOUND", "Session not found"), 404);

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, c.req.param("id")), eq(sessionsTable.recruiterId, rId)))
    .limit(1);
  if (!session) return c.json(error("NOT_FOUND", "Session not found"), 404);

  const invites = invitesTable
    ? await db
        .select()
        .from(invitesTable)
        .where(eq(invitesTable.sessionId, session.id))
        .orderBy(asc(invitesTable.slotStart))
    : [];

  return c.json(success({ session, invites }), 200);
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
  const rId = recruiterId(c);
  if (!rId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const sessionsTable = (schema as any).liveScreeningSessions;
  const invitesTable = (schema as any).liveScreeningInvites;
  const runsTable = (schema as any).recruiterAgentRuns;
  if (!sessionsTable || !invitesTable || !runsTable) {
    return c.json(error("SERVICE_UNAVAILABLE", "Live screening or agent runs unavailable"), 503);
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, c.req.param("id")), eq(sessionsTable.recruiterId, rId)))
    .limit(1);
  if (!session) return c.json(error("NOT_FOUND", "Session not found"), 404);

  const body = await c.req.json().catch(() => ({}));
  const limit = Math.min(50, Math.max(1, Number(body.limit ?? 25)));

  // Prefer the explicit run; otherwise fall back to the latest completed
  // run for this session's job. The job match is the discriminator —
  // an agent run from a different role shouldn't fill a different role's
  // slots.
  let run: any = null;
  if (body.runId) {
    const [explicit] = await db
      .select()
      .from(runsTable)
      .where(and(eq(runsTable.id, body.runId), eq(runsTable.recruiterId, rId)))
      .limit(1);
    run = explicit ?? null;
  } else if (session.jobId) {
    const [latest] = await db
      .select()
      .from(runsTable)
      .where(and(eq(runsTable.recruiterId, rId), eq(runsTable.jobId, session.jobId), eq(runsTable.status, "completed")))
      .orderBy(desc(runsTable.completedAt))
      .limit(1);
    run = latest ?? null;
  }

  if (!run) {
    return c.json(error("NOT_FOUND", "No agent run found for this session. Run /agent/source first or pass runId explicitly."), 404);
  }

  // results is an array of { candidateId, name, email, score, ... }
  const results = Array.isArray(run.results) ? run.results : [];
  if (results.length === 0) {
    return c.json(error("INVALID_STATE", "Agent run has no scored candidates"), 400);
  }

  // Already-invited candidates for this session — skip them on a re-run
  // so the scheduler isn't fighting the unique partial index in 0118.
  const existingInvites = await db
    .select({ candidateId: invitesTable.candidateId })
    .from(invitesTable)
    .where(eq(invitesTable.sessionId, session.id));
  const alreadyInvited = new Set(
    (existingInvites as any[]).map((r) => r.candidateId).filter((id): id is string => !!id),
  );

  const ranked: ScheduleCandidate[] = results
    .filter((r: any) => r.candidateId && !alreadyInvited.has(r.candidateId))
    .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit)
    .map((r: any) => ({
      candidateId: r.candidateId,
      candidateName: r.name ?? "Candidate",
      candidateEmail: r.email ?? null,
    }));

  if (ranked.length === 0) {
    return c.json(success({ capacity: 0, scheduled: 0, unscheduled: [], invites: [], sourceRunId: run.id }), 200);
  }

  const schedule = buildBackToBackSchedule(
    new Date(session.startTime),
    new Date(session.endTime),
    session.slotMinutes,
    ranked,
  );

  const created: unknown[] = [];
  for (const slot of schedule.slots) {
    const [row] = await (db
      .insert(invitesTable)
      .values({
        sessionId: session.id,
        candidateId: slot.candidate.candidateId,
        candidateName: slot.candidate.candidateName,
        candidateEmail: slot.candidate.candidateEmail ?? null,
        slotStart: slot.slotStart,
        slotEnd: slot.slotEnd,
        inviteToken: generateInviteToken(),
        status: "pending",
      })
      .returning() as any);
    created.push(row);
  }

  return c.json(
    success({
      sourceRunId: run.id,
      capacity: schedule.capacity,
      scheduled: schedule.scheduled,
      unscheduled: schedule.unscheduled,
      invites: created,
    }),
    200,
  );
});

liveScreenRecruiterRoutes.post("/sessions/:id/schedule", async (c) => {
  const rId = recruiterId(c);
  if (!rId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const parsed = ScheduleCandidatesSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);

  const db = getDb();
  const sessionsTable = (schema as any).liveScreeningSessions;
  const invitesTable = (schema as any).liveScreeningInvites;
  if (!sessionsTable || !invitesTable) return c.json(error("SERVICE_UNAVAILABLE", "Live screening unavailable"), 503);

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, c.req.param("id")), eq(sessionsTable.recruiterId, rId)))
    .limit(1);
  if (!session) return c.json(error("NOT_FOUND", "Session not found"), 404);

  const candidates: ScheduleCandidate[] = parsed.data.candidates.map((cnd) => ({
    candidateId: cnd.candidateId,
    candidateName: cnd.candidateName,
    candidateEmail: cnd.candidateEmail ?? null,
  }));

  const schedule = buildBackToBackSchedule(
    new Date(session.startTime),
    new Date(session.endTime),
    session.slotMinutes,
    candidates,
  );

  const created: unknown[] = [];
  for (const slot of schedule.slots) {
    const [row] = await (db
      .insert(invitesTable)
      .values({
        sessionId: session.id,
        candidateId: slot.candidate.candidateId,
        candidateName: slot.candidate.candidateName,
        candidateEmail: slot.candidate.candidateEmail ?? null,
        slotStart: slot.slotStart,
        slotEnd: slot.slotEnd,
        inviteToken: generateInviteToken(),
        status: "pending",
      })
      .returning() as any);
    created.push(row);
  }

  return c.json(
    success({
      capacity: schedule.capacity,
      scheduled: schedule.scheduled,
      unscheduled: schedule.unscheduled,
      invites: created,
    }),
    200,
  );
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
  const db = getDb();
  const invitesTable = (schema as any).liveScreeningInvites;
  const sessionsTable = (schema as any).liveScreeningSessions;
  if (!invitesTable || !sessionsTable) return c.json(error("NOT_FOUND", "Invite not found"), 404);

  const [invite] = await db
    .select()
    .from(invitesTable)
    .where(eq(invitesTable.inviteToken, c.req.param("token")))
    .limit(1);
  if (!invite) return c.json(error("NOT_FOUND", "Invite not found"), 404);

  const [session] = await db
    .select({
      id: sessionsTable.id,
      title: sessionsTable.title,
      startTime: sessionsTable.startTime,
      endTime: sessionsTable.endTime,
      slotMinutes: sessionsTable.slotMinutes,
      meetingUrl: sessionsTable.meetingUrl,
      status: sessionsTable.status,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, invite.sessionId))
    .limit(1);

  return c.json(
    success({
      invite: {
        id: invite.id,
        candidateName: invite.candidateName,
        slotStart: invite.slotStart,
        slotEnd: invite.slotEnd,
        status: invite.status,
        respondedAt: invite.respondedAt,
      },
      session: session
        ? {
            ...session,
            // Only reveal the meeting URL once the candidate has accepted —
            // unconfirmed invites get the placeholder.
            meetingUrl: invite.status === "accepted" ? session.meetingUrl : null,
          }
        : null,
    }),
    200,
  );
});

liveScreenPublicRoutes.post("/invites/:token/respond", async (c) => {
  const db = getDb();
  const invitesTable = (schema as any).liveScreeningInvites;
  if (!invitesTable) return c.json(error("NOT_FOUND", "Invite not found"), 404);

  const body = await c.req.json().catch(() => ({}));
  const parsed = RespondSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);

  const [invite] = await db
    .select()
    .from(invitesTable)
    .where(eq(invitesTable.inviteToken, c.req.param("token")))
    .limit(1);
  if (!invite) return c.json(error("NOT_FOUND", "Invite not found"), 404);

  if (invite.status !== "pending") {
    return c.json(error("INVALID_STATE", `Already ${invite.status}`), 400);
  }

  const newStatus = parsed.data.action === "accept" ? "accepted" : "declined";
  const [updated] = await (db
    .update(invitesTable)
    .set({
      status: newStatus,
      respondedAt: new Date(),
      responseNotes: parsed.data.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(invitesTable.id, invite.id))
    .returning() as any);

  return c.json(success(updated), 200);
});
