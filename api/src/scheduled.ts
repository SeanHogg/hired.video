/**
 * Cloudflare Cron Trigger entry (worker.ts `scheduled()` → runScheduled).
 *
 * Dispatches by `event.cron` (services/scheduling/cron-plan.ts):
 *
 *   every 5 min   TICK      KV-gated work queues — drips, recruiter outreach,
 *                   campaigns, job queue, event reminders, token-pack
 *                   reconcile, social publish, partner payouts. An idle tick
 *                   reads KV only and makes ZERO Postgres queries, so Neon
 *                   can suspend (it used to run ~12–16 queries every 5 min,
 *                   keeping compute awake 24/7).
 *   every 15 min  INTERVAL  registered workers, explicit-scan backfill, paid-media
 *                   report resume, job-board scrape (:00/:30)
 *   hh:02         HOURLY  marker reconcile + every daily / weekly / monthly job
 *
 * Email sync is intentionally absent (gap #757): connected mailboxes sync
 * from the PWA (POST /api/inbox/external-emails/ingest).
 */
import { logger } from "./lib/logger.js";
import { cronKind } from "./services/scheduling/cron-plan.js";
import { runWorkQueueTick } from "./services/scheduling/work-queues.js";
import { runIntervalJobs } from "./services/scheduling/interval-jobs.js";
import { runHourlyJobs } from "./services/scheduling/hourly-jobs.js";

export async function runScheduled(cron?: string, now: Date = new Date()): Promise<void> {
  try {
    switch (cronKind(cron)) {
      case "interval":
        await runIntervalJobs(now);
        return;
      case "hourly":
        await runHourlyJobs(now);
        return;
      default: {
        const { ran, handled } = await runWorkQueueTick(now);
        if (ran.length > 0) logger.info("[scheduled] tick", { ran, handled });
      }
    }
  } catch (err) {
    logger.error(`[scheduled] ${cronKind(cron)} invocation failed`, err);
  }
}
