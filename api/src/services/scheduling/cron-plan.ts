/**
 * Cron plan — the cron expressions wrangler.toml registers and the pure
 * predicates that decide what each invocation does. Pure + exported so
 * scheduled-rotation.test.ts can pin the cadence (gaps #1589, #1617: a
 * "run everything every tick" regression blew the Worker CPU budget, and
 * the old single /5 cron kept Neon awake 24/7).
 *
 * Workers Free allows only a handful of Cron Triggers per account, so the
 * plan uses three and dispatches by `event.cron`:
 *
 *   TICK      every 5 min   KV-gated work queues only — an idle tick makes
 *                           zero Postgres queries (work-queues.ts)
 *   INTERVAL  every 15 min  registered workers (KV next-due gate), explicit-
 *                           scan backfill + paid-media resume (idle back-off),
 *                           job-board scrape on :00/:30
 *   HOURLY    hh:02         config snapshot (KV-deduped), the marker-gated
 *                           hourly queues (posting agent, off-platform
 *                           metrics), the marker reconcile on RECONCILE
 *                           hours only, and the daily / weekly / monthly
 *                           jobs selected by UTC hour + date below. :02 so
 *                           it never overlaps a TICK invocation. An idle
 *                           non-reconcile hour makes zero Postgres queries.
 *
 * Keep CRON_SCHEDULES and wrangler.toml [triggers].crons identical.
 */

export const CRON = {
  TICK: "*/5 * * * *",
  INTERVAL: "*/15 * * * *",
  HOURLY: "2 * * * *",
} as const;

export const CRON_SCHEDULES: readonly string[] = [CRON.TICK, CRON.INTERVAL, CRON.HOURLY];

export type CronKind = "tick" | "interval" | "hourly";

/** Map an invocation's `event.cron` to its plan. Unknown / absent (local
 *  `wrangler dev --test-scheduled`, an old deploy) → the TICK work. */
export function cronKind(cron: string | null | undefined): CronKind {
  switch (cron) {
    case CRON.INTERVAL:
      return "interval";
    case CRON.HOURLY:
      return "hourly";
    default:
      return "tick";
  }
}

// ---------------------------------------------------------------------------
// INTERVAL (/15) rotation
// ---------------------------------------------------------------------------

/** The heaviest sweep (scrapeAllActiveSources) runs on the :00 and :30
 *  INTERVAL invocations only. */
export function isHalfHourInterval(d: Date): boolean {
  return d.getUTCMinutes() % 30 < 5;
}

// ---------------------------------------------------------------------------
// HOURLY windows (the HOURLY cron fires once per UTC hour, at :02)
// ---------------------------------------------------------------------------

/** UTC hours the marker reconcile runs (and the idle-deferred interval
 *  sweeps wake). 04 is the maintenance hour, so one of the four shares a
 *  wake-up that happens anyway. Every 6h bounds the latency of a writer
 *  that forgot to `signalWork`. */
export const RECONCILE_HOURS: readonly number[] = [4, 10, 16, 22];

export function isReconcileHour(d: Date): boolean {
  return RECONCILE_HOURS.includes(d.getUTCHours());
}

const HOUR_MS = 60 * 60 * 1000;

/** Epoch ms of the top of the next reconcile hour strictly after `nowMs`. */
export function nextReconcileMs(nowMs: number): number {
  let t = Math.floor(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS;
  while (!RECONCILE_HOURS.includes(new Date(t).getUTCHours())) t += HOUR_MS;
  return t;
}

/** 03:xx — SuperAdmin / platform-company / sector-article seed (gap #1593). */
export function isSeedSuperAdminHour(d: Date): boolean {
  return d.getUTCHours() === 3;
}

/** 04:xx — retention sweep, then counter recompute, then the gamification
 *  fraud sweep, run in that order (gaps #1602, #1605). Once per day — the
 *  old /5 window guard let the fraud sweep fire six times. */
export function isMaintenanceHour(d: Date): boolean {
  return d.getUTCHours() === 4;
}

/** 05:xx — LLM model-catalog drift alarm (#1938) + geocoder refresh (#1161). */
export function isCatalogAndGeocoderHour(d: Date): boolean {
  return d.getUTCHours() === 5;
}

/** 06:xx — date-based placement stage events (#230). */
export function isPlacementStageHour(d: Date): boolean {
  return d.getUTCHours() === 6;
}

/** 1st of month, 00:xx–03:xx — monthly usage close (idempotent; four runs
 *  give a failed close three retries). */
export function isMonthlyCloseWindow(d: Date): boolean {
  return d.getUTCDate() === 1 && d.getUTCHours() < 4;
}

/** 1st of month, 02:xx — Partner Program pool close. */
export function isPartnerPoolCloseWindow(d: Date): boolean {
  return d.getUTCDate() === 1 && d.getUTCHours() === 2;
}

/** 1st of month, 03:xx — article engagement payout (#896). */
export function isArticleEngagementPayoutWindow(d: Date): boolean {
  return d.getUTCDate() === 1 && d.getUTCHours() === 3;
}

/** Tuesday 09:xx — weekly payout release (#773). */
export function isPayoutReleaseWindow(d: Date): boolean {
  return d.getUTCDay() === 2 && d.getUTCHours() === 9;
}

export type HourlyJob =
  | "reconcile-markers"
  | "config-snapshot"
  | "hourly-queues"
  | "seed-superadmin"
  | "maintenance"
  | "model-catalog-drift"
  | "geocoder-refresh"
  | "placement-stage-events"
  | "monthly-usage-close"
  | "partner-pool-close"
  | "article-engagement-payout"
  | "payout-release";

/** Every job the HOURLY invocation at `d` runs, in run order. */
export function hourlyJobsFor(d: Date): HourlyJob[] {
  const jobs: HourlyJob[] = [];
  if (isReconcileHour(d)) jobs.push("reconcile-markers");
  jobs.push("config-snapshot", "hourly-queues");
  if (isSeedSuperAdminHour(d)) jobs.push("seed-superadmin");
  if (isMaintenanceHour(d)) jobs.push("maintenance");
  if (isCatalogAndGeocoderHour(d)) jobs.push("model-catalog-drift", "geocoder-refresh");
  if (isPlacementStageHour(d)) jobs.push("placement-stage-events");
  if (isMonthlyCloseWindow(d)) jobs.push("monthly-usage-close");
  if (isPartnerPoolCloseWindow(d)) jobs.push("partner-pool-close");
  if (isArticleEngagementPayoutWindow(d)) jobs.push("article-engagement-payout");
  if (isPayoutReleaseWindow(d)) jobs.push("payout-release");
  return jobs;
}
