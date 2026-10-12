/**
 * Streak-at-risk reminder worker (#2068 GAP-8).
 *
 * Once per day, finds learners whose daily engagement streak is alive but
 * whose last active day was YESTERDAY (UTC) — i.e. they have not logged any
 * streak-advancing activity today and will lose the streak at midnight. Sends
 * a single best-effort "your N-day streak is about to break" notification so
 * the streak mechanic actually drives a return visit.
 *
 * Dedup is structural: the candidate set is exactly the users whose
 * `lastActivityDate == yesterday`, and the worker's cadence is ~24h, so each
 * at-risk user is nudged at most once per day. No per-row marker needed.
 *
 * Only streaks of length ≥ MIN_STREAK are worth saving (a 1-day "streak" is
 * just today's activity). Notifications are preference-gated by
 * NotificationService.notify.
 */

import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { NotificationService } from "../services/notifications/notificationService.js";
import type { WorkerDefinition, WorkerRunContext } from "./types.js";
import { chunk } from "../utils/chunk.js";

const DAILY_MS = 24 * 60 * 60 * 1000;
const MIN_STREAK = 2;
const MAX_PER_RUN = 2000;
const NOTIFY_CONCURRENCY = 20;

/** YYYY-MM-DD (UTC) for `d`. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function run(ctx: WorkerRunContext): Promise<void> {
  const db = getDb();
  const repos = buildRepos(db);
  const now = new Date();
  const yesterday = ymd(new Date(now.getTime() - DAILY_MS));

  const atRisk = await repos.points.findStreaksAtRisk(yesterday, MIN_STREAK, MAX_PER_RUN);
  ctx.recordScanned(atRisk.length);
  if (atRisk.length === 0) return;

  // Each notification carries its own payload (streak count, refId), so
  // they can't share one bulk insert; send in bounded-concurrency waves
  // instead of 2000 sequential round-trips.
  for (const wave of chunk(atRisk, NOTIFY_CONCURRENCY)) {
    await Promise.all(
      wave.map(async ({ userId, currentStreak }) => {
        try {
          await NotificationService.notify({
            userId,
            type: "points",
            title: "Your streak is about to break",
            message: `Keep your ${currentStreak}-day streak alive — do anything today to extend it.`,
            url: "/learn/dashboard",
            refType: "streak",
            refId: userId,
          });
          ctx.recordChanged();
        } catch (err: any) {
          ctx.recordFailure(userId, `streak-reminder: ${err?.message ?? err}`);
        }
      }),
    );
  }
}

export const streakAtRiskReminderWorker: WorkerDefinition = {
  name: "streak-at-risk-reminder",
  displayName: "Streak-at-Risk Reminders",
  description:
    "Once daily, nudges learners whose engagement streak (≥2 days) will break today unless they return.",
  cadenceMs: DAILY_MS,
  batchSize: MAX_PER_RUN,
  run,
};
