/** Workforce Phase 1 — time entries (punch in / out, week reads). */

import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { resolveEmployeeCompanyId } from "./tenancy.js";

const { taskTimeEntries } = schema;

export interface PunchInRequest {
  taskId?: string | null;
  notes?: string | null;
  billable?: boolean;
}

/** Open a new time entry for the employee. Refuses if there's already
 *  an active entry (the punch-state invariant — at most one open row
 *  per user). UI surfaces this as "you're already punched in to <task>". */
export async function punchIn(
  userId: string,
  req: PunchInRequest,
  db = getDb(),
) {
  const companyId = await resolveEmployeeCompanyId(userId, db);
  if (!companyId) {
    throw new ForbiddenError("Only active employees can punch in");
  }
  const active = await getActiveTimeEntry(userId, db);
  if (active) {
    throw new ForbiddenError("You're already punched in — punch out first");
  }
  const [row] = await db.insert(taskTimeEntries).values({
    taskId: req.taskId ?? null,
    userId,
    companyId,
    startedAt: new Date(),
    billable: req.billable ?? true,
    notes: req.notes ?? null,
    status: "open",
  } as any).returning();
  return row;
}

/** Close the user's active time entry. Idempotent: a no-op (return null)
 *  if nothing is open. Computes duration_sec from started_at..now. */
export async function punchOut(userId: string, db = getDb()) {
  const active = await getActiveTimeEntry(userId, db);
  if (!active) return null;
  const endedAt = new Date();
  const durationSec = Math.max(
    0,
    Math.floor((endedAt.getTime() - new Date(active.startedAt).getTime()) / 1000),
  );
  const [row] = await db.update(taskTimeEntries)
    .set({
      endedAt,
      durationSec,
      status: "closed",
      updatedAt: endedAt,
    } as any)
    .where(eq(taskTimeEntries.id, active.id))
    .returning();
  return row;
}

/** The unique open row for a user, or null if not punched in. */
export async function getActiveTimeEntry(userId: string, db = getDb()) {
  const [row] = await db.select().from(taskTimeEntries)
    .where(and(
      eq(taskTimeEntries.userId, userId),
      isNull(taskTimeEntries.endedAt),
    ))
    .limit(1);
  return row ?? null;
}

/** Entries in the week starting periodStart (Monday). End-exclusive. */
export async function getWeekEntries(
  userId: string,
  periodStart: string, // YYYY-MM-DD
  db = getDb(),
) {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return await db.select().from(taskTimeEntries)
    .where(and(
      eq(taskTimeEntries.userId, userId),
      gte(taskTimeEntries.startedAt, start),
      lt(taskTimeEntries.startedAt, end),
    ))
    .orderBy(taskTimeEntries.startedAt);
}
