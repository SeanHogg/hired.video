/**
 * KV "pending work" markers — lets the 5-minute cron tick decide what to do
 * WITHOUT touching Postgres, so an idle platform lets Neon suspend.
 *
 * One key per queue (`work:pending:<queue>`, value = epoch ms the queue is
 * next due). Never one key per item.
 *
 *   - Writers (anything that enqueues / schedules work) call
 *     `signalWork(queue)` after their INSERT/UPDATE. It only writes when the
 *     queue is not already due — so a busy queue costs reads, not writes.
 *   - The tick reads every marker (`readWorkMarkers`) and runs only the
 *     queues whose marker is due. No due marker → zero DB queries.
 *   - After a run the tick re-derives each queue's real next-due time in ONE
 *     query and `settleWorkMarker` rewrites a marker only when it moved
 *     (deleted when the queue drained; set when the next item is far out).
 *   - The hourly cron re-derives every marker from Postgres too, so a writer
 *     that forgot to signal (or a KV write that failed) costs at most an
 *     hour of latency, never lost work.
 *
 * KV is eventually consistent (~60s) and best-effort; every function here
 * swallows KV errors. Missing binding (dev/tests) → every queue reads as due,
 * which is the pre-marker behaviour.
 */
import { getKvNamespace } from "../../utils/edge-cache.js";

export const WORK_QUEUES = [
  "followups", // the ONE sequence engine: nurture drips + recruiter outreach
  "campaigns",
  "job-queue",
  "event-reminders",
  "token-packs",
  "social-publish",
  "partner-payouts",
  "recruiter-agent-followups",
] as const;
export type WorkQueue = (typeof WORK_QUEUES)[number];

/** A queue whose next item is due within this window is treated as due
 *  now — it will be picked up by the very next tick anyway, and leaving the
 *  marker "due" avoids a write. */
export const WORK_DUE_SLACK_MS = 5 * 60 * 1000;

const markerKey = (queue: WorkQueue) => `work:pending:${queue}`;

/** Marker values per queue: epoch ms, or null when no marker is set. */
export type WorkMarkers = Map<WorkQueue, number | null>;

function parseMarker(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Writer side: "this queue has work due at `dueAt` (default now)". Writes
 * only when no marker exists or the existing one is later than `dueAt`.
 * Never throws; safe to await on a request path (one KV read, rarely a put).
 */
export async function signalWork(queue: WorkQueue, dueAt: Date = new Date()): Promise<void> {
  const kv = getKvNamespace();
  if (!kv) return;
  try {
    const current = parseMarker(await kv.get(markerKey(queue)));
    const due = dueAt.getTime();
    if (current != null && current <= due) return;
    await kv.put(markerKey(queue), String(due));
  } catch {
    // Best-effort — the hourly reconcile re-derives every marker.
  }
}

/** Read every marker. `null` result = KV unavailable (treat all as due). */
export async function readWorkMarkers(queues: readonly WorkQueue[] = WORK_QUEUES): Promise<WorkMarkers | null> {
  const kv = getKvNamespace();
  if (!kv) return null;
  try {
    const values = await Promise.all(queues.map((q) => kv.get(markerKey(q))));
    return new Map(queues.map((q, i) => [q, parseMarker(values[i] ?? null)]));
  } catch {
    return null;
  }
}

/** Queues whose marker is due at `now`. With no marker map (KV down / dev)
 *  every queue is due. */
export function dueQueues(markers: WorkMarkers | null, now: number, queues: readonly WorkQueue[] = WORK_QUEUES): WorkQueue[] {
  if (!markers) return [...queues];
  return queues.filter((q) => {
    const at = markers.get(q);
    return at != null && at <= now;
  });
}

/**
 * Rewrite one marker from the queue's real next-due time. Writes only on a
 * change of state:
 *   - nothing pending            → delete (if a marker existed)
 *   - due now / within the slack → leave a due marker (set one if missing
 *                                   or later)
 *   - due later                  → put that time (if different)
 * Pure decision in `nextMarkerAction`; this applies it.
 */
export async function settleWorkMarker(
  queue: WorkQueue,
  current: number | null,
  nextDue: Date | null,
  now: number,
): Promise<void> {
  const kv = getKvNamespace();
  if (!kv) return;
  const action = nextMarkerAction(current, nextDue ? nextDue.getTime() : null, now);
  try {
    if (action.kind === "delete") await kv.delete(markerKey(queue));
    else if (action.kind === "put") await kv.put(markerKey(queue), String(action.value));
  } catch {
    // Best-effort — next settle / hourly reconcile retries.
  }
}

export type MarkerAction = { kind: "none" } | { kind: "delete" } | { kind: "put"; value: number };

export function nextMarkerAction(current: number | null, nextDueMs: number | null, now: number): MarkerAction {
  if (nextDueMs == null) return current == null ? { kind: "none" } : { kind: "delete" };
  if (nextDueMs <= now + WORK_DUE_SLACK_MS) {
    return current != null && current <= now ? { kind: "none" } : { kind: "put", value: now };
  }
  return current === nextDueMs ? { kind: "none" } : { kind: "put", value: nextDueMs };
}

// ---------------------------------------------------------------------------
// Idle back-off for interval sweeps
// ---------------------------------------------------------------------------
//
// Sweeps with no cheap "next due" signal (explicit-scan backfill, paid-media
// report resume) defer themselves to the top of the next hour when a run
// finds nothing to do. The key self-expires (absolute KV expiration), so
// there is one put per idle hour and no delete.

const idleKey = (sweep: string) => `work:idle:${sweep}`;

/** True while `sweep` is deferred. KV unavailable → never deferred. */
export async function isSweepDeferred(sweep: string): Promise<boolean> {
  const kv = getKvNamespace();
  if (!kv) return false;
  try {
    return (await kv.get(idleKey(sweep))) != null;
  } catch {
    return false;
  }
}

/** Defer `sweep` until just before the top of the next UTC hour, so the
 *  :00 interval run (shared with the hourly cron, while Neon is awake
 *  anyway) sees the key gone. Two minutes of lead absorbs KV's edge-cache
 *  staleness; KV's expiration must be ≥ 60s ahead, else the hour after. */
export async function deferSweepToNextHour(sweep: string, now: Date = new Date()): Promise<void> {
  const kv = getKvNamespace();
  if (!kv) return;
  try {
    await kv.put(idleKey(sweep), "1", { expiration: Math.floor(idleUntilMs(now.getTime()) / 1000) });
  } catch {
    // Best-effort — the sweep simply runs again next interval.
  }
}

const HOUR_MS = 60 * 60 * 1000;
const IDLE_LEAD_MS = 2 * 60 * 1000;

export function idleUntilMs(nowMs: number): number {
  let until = Math.ceil((nowMs + 1) / HOUR_MS) * HOUR_MS - IDLE_LEAD_MS;
  while (until - nowMs < 60_000) until += HOUR_MS;
  return until;
}
