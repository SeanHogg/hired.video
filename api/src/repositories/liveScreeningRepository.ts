/**
 * Live-screening persistence (migration 0118) — batch-shaped writes for the
 * recruiter scheduling routes. A schedule of N slots is ONE multi-row insert
 * instead of N sequential round-trips.
 */
import { schema, type Db } from "../db/index.js";
import type { LiveScreeningInvite } from "../db/schema/liveScreening.js";
import type { ScheduledSlot } from "../services/recruiter/live-screen-scheduler.js";

const { liveScreeningInvites } = schema;

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
