/**
 * Live-screening (ZipIntro-style) use cases behind routes/live-screen.ts.
 *
 * Recruiter side: declare a window, schedule candidates into back-to-back
 * slots (manually or from an AI agent run), read sessions back.
 * Public side: a candidate reads / answers their tokenised invite.
 *
 * Slot maths is the pure scheduler (live-screen-scheduler.ts); persistence
 * is repositories/liveScreeningRepository.ts. Failures throw DomainError.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import type { LiveScreeningInvite, LiveScreeningSession } from "../../db/schema/liveScreening.js";
import {
  findInviteByToken,
  findInvitedCandidateIds,
  findOwnedSession,
  findPublicSession,
  insertLiveScreeningSession,
  insertScheduledInvites,
  listRecruiterSessions,
  listSessionInvites,
  recordInviteResponse,
} from "../../repositories/liveScreeningRepository.js";
import {
  findLatestCompletedAgentRunForJob,
  findOwnedAgentRun,
  type AgentRunRow,
} from "../../repositories/recruiterAgentRepository.js";
import {
  buildBackToBackSchedule,
  generateInviteToken,
  windowCapacity,
  type ScheduleCandidate,
  type ScheduleResult,
} from "./live-screen-scheduler.js";

export interface CreateLiveScreenSessionInput {
  title: string;
  jobId: string | null;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  meetingUrl: string | null;
  criteria: Record<string, unknown>;
}

const sessionNotFound = () => new DomainError(404, "NOT_FOUND", "Session not found");
const inviteNotFound = () => new DomainError(404, "NOT_FOUND", "Invite not found");

export async function createLiveScreenSession(recruiterId: string, input: CreateLiveScreenSessionInput) {
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (!(end > start)) throw new DomainError(400, "VALIDATION_ERROR", "endTime must be after startTime");

  const row = await insertLiveScreeningSession(getDb(), {
    recruiterId,
    jobId: input.jobId,
    title: input.title,
    startTime: start,
    endTime: end,
    slotMinutes: input.slotMinutes,
    meetingUrl: input.meetingUrl,
    criteria: input.criteria,
    status: input.meetingUrl ? "scheduled" : "draft",
  });
  return { ...row, capacity: windowCapacity(start, end, input.slotMinutes) };
}

export function listLiveScreenSessions(recruiterId: string): Promise<LiveScreeningSession[]> {
  return listRecruiterSessions(getDb(), recruiterId);
}

export async function getLiveScreenSessionDetail(recruiterId: string, sessionId: string) {
  const db = getDb();
  const session = await findOwnedSession(db, recruiterId, sessionId);
  if (!session) throw sessionNotFound();
  const invites = await listSessionInvites(db, session.id);
  return { session, invites };
}

/** Schedule `candidates` into the session's window; one multi-row insert. */
async function scheduleIntoSession(
  session: LiveScreeningSession,
  candidates: ScheduleCandidate[],
): Promise<Omit<ScheduleResult, "slots"> & { invites: LiveScreeningInvite[] }> {
  const schedule = buildBackToBackSchedule(
    new Date(session.startTime),
    new Date(session.endTime),
    session.slotMinutes,
    candidates,
  );
  const invites = await insertScheduledInvites(getDb(), session.id, schedule.slots, generateInviteToken);
  return {
    capacity: schedule.capacity,
    scheduled: schedule.scheduled,
    unscheduled: schedule.unscheduled,
    invites,
  };
}

export async function scheduleLiveScreenCandidates(
  recruiterId: string,
  sessionId: string,
  candidates: ScheduleCandidate[],
) {
  const session = await findOwnedSession(getDb(), recruiterId, sessionId);
  if (!session) throw sessionNotFound();
  return scheduleIntoSession(
    session,
    candidates.map((cnd) => ({
      candidateId: cnd.candidateId,
      candidateName: cnd.candidateName,
      candidateEmail: cnd.candidateEmail ?? null,
    })),
  );
}

/**
 * ZipIntro parity #1208: fill the session from the top-scored candidates of
 * an agent run — the explicit `runId`, else the latest completed run for the
 * session's job (a run for a different role must not fill this role's
 * slots). Candidates already invited are skipped on a re-run.
 */
export async function autoMatchLiveScreenSession(
  recruiterId: string,
  sessionId: string,
  opts: { runId?: string; limit: number },
) {
  const db = getDb();
  const session = await findOwnedSession(db, recruiterId, sessionId);
  if (!session) throw sessionNotFound();

  let run: AgentRunRow | null = null;
  if (opts.runId) run = await findOwnedAgentRun(recruiterId, opts.runId);
  else if (session.jobId) run = await findLatestCompletedAgentRunForJob(recruiterId, session.jobId);
  if (!run) {
    throw new DomainError(404, "NOT_FOUND", "No agent run found for this session. Run /agent/source first or pass runId explicitly.");
  }

  const results = Array.isArray(run.results) ? run.results : [];
  if (results.length === 0) throw new DomainError(400, "INVALID_STATE", "Agent run has no scored candidates");

  const alreadyInvited = await findInvitedCandidateIds(db, session.id);
  const ranked: ScheduleCandidate[] = results
    .filter((r) => r.candidateId && !alreadyInvited.has(r.candidateId))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, opts.limit)
    .map((r) => ({
      candidateId: r.candidateId,
      candidateName: r.name ?? "Candidate",
      candidateEmail: r.email ?? null,
    }));

  if (ranked.length === 0) {
    return { capacity: 0, scheduled: 0, unscheduled: [], invites: [], sourceRunId: run.id };
  }
  return { sourceRunId: run.id, ...(await scheduleIntoSession(session, ranked)) };
}

/** Public invite view — the meeting URL is revealed only once accepted. */
export async function getPublicLiveScreenInvite(token: string) {
  const db = getDb();
  const invite = await findInviteByToken(db, token);
  if (!invite) throw inviteNotFound();
  const session = await findPublicSession(db, invite.sessionId);
  return {
    invite: {
      id: invite.id,
      candidateName: invite.candidateName,
      slotStart: invite.slotStart,
      slotEnd: invite.slotEnd,
      status: invite.status,
      respondedAt: invite.respondedAt,
    },
    session: session
      ? { ...session, meetingUrl: invite.status === "accepted" ? session.meetingUrl : null }
      : null,
  };
}

export async function respondToLiveScreenInvite(
  token: string,
  action: "accept" | "decline",
  notes: string | undefined,
): Promise<LiveScreeningInvite> {
  const db = getDb();
  const invite = await findInviteByToken(db, token);
  if (!invite) throw inviteNotFound();
  if (invite.status !== "pending") throw new DomainError(400, "INVALID_STATE", `Already ${invite.status}`);
  return recordInviteResponse(db, invite.id, action === "accept" ? "accepted" : "declined", notes ?? null);
}
