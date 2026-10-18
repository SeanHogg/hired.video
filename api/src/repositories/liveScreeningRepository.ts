/**
 * Live-screening persistence (migration 0118) — `live_screening_sessions`
 * (recruiter-owned windows) and `live_screening_invites` (one per scheduled
 * slot, addressed publicly by a magic-link token). Writes are batch-shaped:
 * a schedule of N slots is ONE multi-row insert instead of N round-trips.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type {
  LiveScreeningInvite,
  LiveScreeningSession,
  NewLiveScreeningSession,
} from "../db/schema/liveScreening.js";
import type { ScheduledSlot } from "../services/recruiter/live-screen-scheduler.js";

const { liveScreeningInvites, liveScreeningSessions } = schema;

/** Public-safe session projection shown to a candidate on the invite page. */
export interface PublicLiveScreeningSession {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  slotMinutes: number;
  meetingUrl: string | null;
  status: string;
}

export async function insertLiveScreeningSession(
  db: Db,
  values: NewLiveScreeningSession,
): Promise<LiveScreeningSession> {
  const [row] = await db.insert(liveScreeningSessions).values(values).returning();
  return row;
}

/** The recruiter's 50 most recent sessions (newest window first). */
export async function listRecruiterSessions(db: Db, recruiterId: string): Promise<LiveScreeningSession[]> {
  return db
    .select()
    .from(liveScreeningSessions)
    .where(eq(liveScreeningSessions.recruiterId, recruiterId))
    .orderBy(desc(liveScreeningSessions.startTime))
    .limit(50);
}

/** A session the recruiter owns, or null. */
export async function findOwnedSession(
  db: Db,
  recruiterId: string,
  sessionId: string,
): Promise<LiveScreeningSession | null> {
  const [row] = await db
    .select()
    .from(liveScreeningSessions)
    .where(and(eq(liveScreeningSessions.id, sessionId), eq(liveScreeningSessions.recruiterId, recruiterId)))
    .limit(1);
  return row ?? null;
}

export async function findPublicSession(db: Db, sessionId: string): Promise<PublicLiveScreeningSession | null> {
  const [row] = await db
    .select({
      id: liveScreeningSessions.id,
      title: liveScreeningSessions.title,
      startTime: liveScreeningSessions.startTime,
      endTime: liveScreeningSessions.endTime,
      slotMinutes: liveScreeningSessions.slotMinutes,
      meetingUrl: liveScreeningSessions.meetingUrl,
      status: liveScreeningSessions.status,
    })
    .from(liveScreeningSessions)
    .where(eq(liveScreeningSessions.id, sessionId))
    .limit(1);
  return row ?? null;
}

/** Every invite of a session, in slot order. */
export async function listSessionInvites(db: Db, sessionId: string): Promise<LiveScreeningInvite[]> {
  return db
    .select()
    .from(liveScreeningInvites)
    .where(eq(liveScreeningInvites.sessionId, sessionId))
    .orderBy(asc(liveScreeningInvites.slotStart));
}

/** Candidate ids already invited to a session (null candidate ids skipped). */
export async function findInvitedCandidateIds(db: Db, sessionId: string): Promise<Set<string>> {
  const rows = await db
    .select({ candidateId: liveScreeningInvites.candidateId })
    .from(liveScreeningInvites)
    .where(eq(liveScreeningInvites.sessionId, sessionId));
  return new Set(rows.map((r) => r.candidateId).filter((id): id is string => !!id));
}

export async function findInviteByToken(db: Db, token: string): Promise<LiveScreeningInvite | null> {
  const [row] = await db
    .select()
    .from(liveScreeningInvites)
    .where(eq(liveScreeningInvites.inviteToken, token))
    .limit(1);
  return row ?? null;
}

/** Record the candidate's accept/decline on an invite; returns the updated row. */
export async function recordInviteResponse(
  db: Db,
  inviteId: string,
  status: "accepted" | "declined",
  notes: string | null,
): Promise<LiveScreeningInvite> {
  const now = new Date();
  const [row] = await db
    .update(liveScreeningInvites)
    .set({ status, respondedAt: now, responseNotes: notes, updatedAt: now })
    .where(eq(liveScreeningInvites.id, inviteId))
    .returning();
  return row;
}

/** Insert a pending invite per scheduled slot; returns rows in slot order.
 *  `makeToken` mints the per-invite magic-link token (must be unique). */
export async function insertScheduledInvites(
  db: Db,
  sessionId: string,
  slots: readonly ScheduledSlot[],
  makeToken: () => string,
): Promise<LiveScreeningInvite[]> {
  if (slots.length === 0) return [];
  const values = slots.map((slot) => ({
    sessionId,
    candidateId: slot.candidate.candidateId,
    candidateName: slot.candidate.candidateName,
    candidateEmail: slot.candidate.candidateEmail ?? null,
    slotStart: slot.slotStart,
    slotEnd: slot.slotEnd,
    inviteToken: makeToken(),
    status: "pending",
  }));
  const rows = await db.insert(liveScreeningInvites).values(values).returning();
  // Re-key by the unique invite token so the response order matches the
  // schedule regardless of RETURNING order.
  const byToken = new Map(rows.map((r) => [r.inviteToken, r]));
  return values
    .map((v) => byToken.get(v.inviteToken))
    .filter((r): r is LiveScreeningInvite => !!r);
}
