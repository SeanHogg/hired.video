/**
 * Cloudflare Cron Trigger handler (#3, #15)
 *
 * Processes two background queues every invocation:
 *   1. Follow-up drip sequences — advance enrollments whose `nextSendAt` is due
 *   2. Generic job queue (`queueJobToProcess`) — process pending background jobs
 *
 * Triggered by the `scheduled()` export in worker.ts.
 * Configure in wrangler.toml:
 *   [[triggers]]
 *   crons = ["*\/5 * * * *"]
 */

import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "./db/index.js";
import { sendGenericEmail } from "./services/adapters/email.js";
import { auditModelCatalog, formatModelDriftEmailHtml } from "./services/adapters/model-catalog-audit.js";
import { scrapeAllActiveSources } from "./services/job/scraper.js";
import { workers as registeredWorkers } from "./workers/registry.js";
import { isWorkerDue, runWorker } from "./workers/runner.js";
import { runMonthClose } from "./domains/services-processing/month-close.js";
import { runFraudSweep } from "./services/gamification/fraud-sweep.js";
import { buildRepos } from "./repositories/index.js";
import { EventReminderService } from "./services/event/EventReminderService.js";
import { EventBlastService } from "./services/event/EventBlastService.js";
import { buildApiDeps } from "./services/apiDeps.js";
import {
  closePartnerPoolForLastMonth,
  dispatchDuePartnerPayouts,
} from "./services/articles/partner-pool.js";
import { TremendousClient } from "./services/tremendous/client.js";
import { seedSuperAdminAndCompany } from "./seed.js";
import { runRetentionSweep } from "./services/maintenance/retention-sweep.js";
import { runGeocoderRefresh, buildGeocoderRefreshDeps } from "./services/location/geocoder-refresh.js";
import { runCounterRecompute } from "./services/maintenance/counter-recompute.js";
import { payoutReleaseWorker } from "./services/payout/ReleaseWorker.js";
import { engagementPayoutService } from "./services/articles/EngagementPayoutService.js";
import { CampaignService } from "./services/campaigns/CampaignService.js";
import { processFollowUps, processRecruiterOutreach } from "./services/outreach/drip-processors.js";
import { processJobQueue } from "./services/queue/job-queue-processor.js";

// Follow-up drips + recruiter outreach live in services/outreach/drip-processors.ts;
// the generic job queue lives in services/queue/job-queue-processor.ts.

// ---------------------------------------------------------------------------
// Email campaign send loop (migration 0204)
// ---------------------------------------------------------------------------
// Every /5 tick: promote due `scheduled` campaigns to `sending`, then drain a
// bounded batch of pending recipients per in-flight campaign through the email
// provider. Idempotent + resumable (recipient population is ON CONFLICT DO
// NOTHING; a campaign stays `sending` until its queue empties). Bounded by
// CampaignService's per-tick caps so it never blows the Worker CPU budget.

async function processCampaigns(): Promise<void> {
  try {
    const service = CampaignService.create(getDb());
    const result = await service.processDue(new Date());
    if (result.promoted > 0 || result.processed > 0) {
      console.log(
        `[scheduled] campaigns: promoted=${result.promoted} processed=${result.processed} ` +
          `sent=${result.sent} failed=${result.failed}`,
      );
    }
  } catch (err) {
    console.error("[scheduled] campaign send loop failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Generic batch-worker dispatcher
// ---------------------------------------------------------------------------
//
// The /5 cron tick fires every 5 minutes; each registered worker has its
// own cadence and is gated against the latest worker_runs row. Manual
// "run now" triggers from the admin UI bypass this gate via runWorker()
// directly, so the tick only fires due cron-triggered runs here.

async function processRegisteredWorkers(): Promise<void> {
  const now = new Date();
  for (const worker of registeredWorkers) {
    try {
      const due = await isWorkerDue(worker, now);
      if (!due) continue;
      const summary = await runWorker(worker, "cron", null);
      console.log(
        `[scheduled] ran worker ${worker.name}: ${summary.status} ` +
          `scanned=${summary.itemsScanned} changed=${summary.itemsChanged} ` +
          `failed=${summary.itemsFailed}`,
      );
    } catch (err) {
      console.error(`[scheduled] Worker ${worker.name} dispatch failed:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Monthly Usage Close
// ---------------------------------------------------------------------------
// Rolls the usage_ledger into frozen `usage_statements` and emits one
// `usage_invoices` row per user (Free invoices land as $0). Runs every
// scheduled tick but only does work between 00:00 and 04:00 UTC on day 1 of
// the month so the cron stays cheap; idempotent via unique constraints.

// ---------------------------------------------------------------------------
// Gamification fraud sweep
// ---------------------------------------------------------------------------
// Runs once per day between 04:30 and 05:00 UTC. Iterates users with
// gamification activity and applies the Phase-4 fraud heuristics
// (rapid_redemption, sybil_signup_ip, refund_then_redeem). The /5 cron
// tick is the trigger; a window guard keeps it from firing 288 times
// per day.

// ---------------------------------------------------------------------------
// Geocoder cache refresh + eviction (#1161)
// ---------------------------------------------------------------------------
// Once per day (05:45–05:50 UTC window guard so the /5 tick fires it once):
// re-geocode popular-but-stale geocoder_cache rows + LRU-evict the stale tail.
export function isGeocoderRefreshWindow(d: Date): boolean {
  return d.getUTCHours() === 5 && d.getUTCMinutes() >= 45 && d.getUTCMinutes() < 50;
}

// ---------------------------------------------------------------------------
// Placement stage-event sweep (#230)
// ---------------------------------------------------------------------------
// Once per day (06:00–06:05 UTC window so the /5 tick fires it once): fire the
// DATE-based placement stage events (started / first_day / guarantee_expires)
// to their subscribers. Idempotent via placement_notification_log.
export function isPlacementStageWindow(d: Date): boolean {
  return d.getUTCHours() === 6 && d.getUTCMinutes() >= 0 && d.getUTCMinutes() < 5;
}

async function processPlacementStageEvents(): Promise<void> {
  if (!isPlacementStageWindow(new Date())) return;
  try {
    const { buildPlacementNotificationService } = await import(
      "./services/notifications/placement-notifications.js"
    );
    const fired = await buildPlacementNotificationService(getDb()).sweepStageEvents(new Date());
    console.log(`[scheduled] placement stage events fired=${fired}`);
  } catch (err) {
    console.error("[scheduled] placement stage sweep failed:", err);
  }
}

// Records which production capabilities are configured on the live release
// (services/observability/config-snapshot.ts). Deduped internally, so the
// per-tick cost is one in-isolate comparison.
async function processConfigSnapshot(): Promise<void> {
  try {
    const { recordConfigSnapshot } = await import("./services/observability/config-snapshot.js");
    if (await recordConfigSnapshot(buildRepos(getDb()).audit)) {
      console.log("[scheduled] config snapshot recorded");
    }
  } catch (err) {
    console.error("[scheduled] config snapshot failed:", err);
  }
}

async function processGeocoderRefresh(): Promise<void> {
  if (!isGeocoderRefreshWindow(new Date())) return;
  try {
    const env = (globalThis as any).__ENV ?? {};
    const repos = buildRepos(getDb());
    const deps = buildGeocoderRefreshDeps(env, repos.geocoderCache);
    const result = await runGeocoderRefresh(deps);
    console.log("[scheduled] geocoder refresh", result);
  } catch (err) {
    console.error("[scheduled] geocoder refresh failed:", err);
  }
}

async function processGamificationFraudSweep(): Promise<void> {
  if (!isFraudSweepWindow(new Date())) return;
  try {
    const db = getDb();
    const repos = buildRepos(db);
    const result = await runFraudSweep(repos, db);
    console.log("[scheduled] gamification fraud sweep", result);
  } catch (err) {
    console.error("[scheduled] gamification fraud sweep failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Event reminder cadence + post-event connect prompts (gap #1244)
// ---------------------------------------------------------------------------
// Every /5 cron tick, scan upcoming public events whose start time falls
// inside any of the reminder windows (1w / 24h / 1h / start). The
// `event_reminders_sent` unique constraint guarantees idempotency, so
// re-runs are safe. Same path fires the post-event "connect with people
// you met" prompt for events that just ended.

async function processEventReminders(): Promise<void> {
  try {
    const env = (globalThis as any).__ENV ?? {};
    const deps = buildApiDeps(env);
    const reminder = new EventReminderService(deps);
    const blast = new EventBlastService(deps);

    const result = await reminder.runCadence(getDb());
    if (result.scanned > 0) {
      console.log(
        `[scheduled] event reminders: scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped}`,
      );
    }

    // Post-event connect prompt: events that ended in the last 2 hours.
    // Drives the "Connect with the people you met" notification + the
    // gamification points loop downstream.
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const db = getDb();
    const justEnded = await db
      .select({ id: schema.scheduledEvents.id })
      .from(schema.scheduledEvents)
      .where(
        and(
          sql`${schema.scheduledEvents.type} IN ('event', 'coffee')`,
          isNotNull(schema.scheduledEvents.endAt),
          lte(schema.scheduledEvents.endAt, now),
          sql`${schema.scheduledEvents.endAt} >= ${twoHoursAgo.toISOString()}`,
          sql`${schema.scheduledEvents.cancelledAt} IS NULL`,
        ),
      )
      .limit(50);

    for (const ev of justEnded) {
      try {
        await blast.sendPostEventConnectPrompt(ev.id);
      } catch (err) {
        console.error(`[scheduled] post-event prompt for ${ev.id} failed:`, err);
      }
    }
  } catch (err) {
    console.error("[scheduled] event reminders failed:", err);
  }
}

async function processMonthlyUsageClose(): Promise<void> {
  if (!isMonthlyCloseWindow(new Date())) return;
  try {
    const summary = await runMonthClose();
    console.log("[scheduled] month-close summary", summary);
  } catch (err) {
    console.error("[scheduled] month-close failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Partner Program monthly close + Tremendous dispatch (gap #172 / #174)
// ---------------------------------------------------------------------------
//
// Two paths:
//   • Pool close: 1st of the month, 02:00 UTC window. Reads paid-sub
//     revenue from invoices, calls closePartnerPoolForLastMonth().
//   • Dispatch loop: every /5 tick. Sends Tremendous gift cards for
//     payout rows whose 60-day hold has expired AND whose user balance
//     is ≥ $50.

async function processPartnerProgramPool(): Promise<void> {
  const now = new Date();
  if (!isPartnerPoolCloseWindow(now)) return;
  try {
    const db = getDb();
    // Subscriber revenue for the closing month — paid sub charges from
    // billing.usageInvoices. Defaults to zero if the table is empty so
    // we still write a $0 pool row for the period (audit trail).
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1));
    let subscriberRevenueCents = 0;
    try {
      const [row] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${schema.usageInvoices.totalCents}), 0)::int`,
        })
        .from(schema.usageInvoices)
        .where(
          and(
            eq(schema.usageInvoices.status, "paid"),
            sql`${schema.usageInvoices.periodStart} >= ${periodStart.toISOString().slice(0, 10)}`,
            sql`${schema.usageInvoices.periodStart} <  ${periodEnd.toISOString().slice(0, 10)}`,
          ),
        );
      subscriberRevenueCents = row?.total ?? 0;
    } catch (e) {
      console.warn("[scheduled] partner pool: revenue read failed, defaulting to 0:", e);
    }
    const result = await closePartnerPoolForLastMonth({
      db,
      now,
      subscriberRevenueCents,
    });
    console.log("[scheduled] partner pool closed", result);
  } catch (err) {
    console.error("[scheduled] partner pool close failed:", err);
  }
}

async function processPartnerProgramDispatch(): Promise<void> {
  try {
    const env = (globalThis as any).__ENV ?? {};
    if (!env.TREMENDOUS_API_KEY || !env.TREMENDOUS_FUNDING_SOURCE_ID || !env.TREMENDOUS_CAMPAIGN_ID) {
      return;
    }
    const tremendous = new TremendousClient({
      apiKey: env.TREMENDOUS_API_KEY,
      baseUrl: env.TREMENDOUS_BASE_URL,
      fundingSourceId: env.TREMENDOUS_FUNDING_SOURCE_ID,
      campaignId: env.TREMENDOUS_CAMPAIGN_ID,
    });
    const result = await dispatchDuePartnerPayouts({
      db: getDb(),
      tremendous,
      now: new Date(),
    });
    if (result.dispatched > 0 || result.failed > 0) {
      console.log("[scheduled] partner payouts dispatched", result);
    }
  } catch (err) {
    console.error("[scheduled] partner payouts dispatch failed:", err);
  }
}

// ---------------------------------------------------------------------------
// SuperAdmin + platform-company + sector-article seed (gap #1593)
// ---------------------------------------------------------------------------
// Runs once per day inside the 03:30 UTC /5 window. Previously called from
// the fetch path on every request, which (because `executionModel` is
// stateless) re-ran on every Cloudflare isolate cold-start — silently
// resetting the superadmin password and costing a PBKDF2 hash + UPDATE on
// each cold request. seedSuperAdminAndCompany is now idempotent and never
// overwrites an existing user, so this is purely a "fill in anything
// missing" daily reconciliation.
async function processSeedSuperAdmin(): Promise<void> {
  if (!isSeedSuperAdminWindow(new Date())) return;
  try {
    await seedSuperAdminAndCompany();
  } catch (err) {
    console.error("[scheduled] superadmin seed failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Retention sweep (gap #1602)
// ---------------------------------------------------------------------------
// Once-daily DELETE pass against the append-only / ephemeral tables
// enumerated in `services/maintenance/retention-sweep.ts`. The 04:15
// UTC /5 window aligns with the fraud sweep cadence (04:30) so both
// land outside US-peak hours. The sweep deletes in bounded batches until
// every table is drained or RETENTION_TIME_BUDGET_MS is spent, so one
// tick can't run away; any backlog left (logged as "capped") drains on
// subsequent days. Idempotent — older-than-threshold is the only
// predicate, so re-runs with no eligible rows are no-ops.
// Home-wall explicit-scan backfill (migration 0505). Public videos written
// without a request context (mediaRepository insert/update), posted before
// the gate, changed since their last scan, or left unscreened by a classifier
// outage get scanned here — a small bounded batch per /15 tick, since each
// scan is one or more model calls. Unscanned videos stay off the wall
// (fail closed) until then.
export const EXPLICIT_SCAN_BATCH = 5;
async function processExplicitScanBackfill(): Promise<void> {
  try {
    const { backfillVideoScans } = await import("./services/moderation/explicit/review.js");
    const { createExplicitScanDeps } = await import("./services/moderation/explicit/deps.js");
    const env = (globalThis as { __ENV?: Parameters<typeof createExplicitScanDeps>[0] }).__ENV;
    const { scanned } = await backfillVideoScans(createExplicitScanDeps(env), EXPLICIT_SCAN_BATCH);
    if (scanned > 0) console.log(`[scheduled] explicit-scan backfill scanned ${scanned} videos`);
  } catch (err) {
    console.error("[scheduled] explicit-scan backfill failed:", err);
  }
}

// Token-pack reconcile (gap #2352): re-check a bounded batch of purchases
// still `pending` because the provider couldn't confirm them at checkout, and
// credit the approved ones (idempotent per transaction). Every /5 tick; a
// no-op query when nothing is pending.
async function processTokenPackReconcile(): Promise<void> {
  try {
    const { buildTokenPackReconcileDeps } = await import("./services/billing/token-packs/tokenPackDeps.js");
    const { reconcilePendingTokenPacks } = await import("./services/billing/token-packs/tokenPackReconcile.js");
    const env = (globalThis as { __ENV?: Record<string, string | undefined> }).__ENV ?? {};
    const summary = await reconcilePendingTokenPacks(buildTokenPackReconcileDeps(env));
    if (summary.scanned > 0) console.log("[scheduled] token-pack reconcile", summary);
  } catch (err) {
    console.error("[scheduled] token-pack reconcile failed:", err);
  }
}

// Pending Microsoft Ads reports (Reporting v13 is submit → poll → download):
// each open report advances one step per tick, at most 3 per run, so a
// tick never waits on the vendor. A manual insights pull resumes them too.
async function processPaidMediaReportResume(): Promise<void> {
  try {
    const { resumePendingInsightReports } = await import("./services/paid-media/sync.js");
    const env = (globalThis as { __ENV?: Record<string, string | undefined> }).__ENV ?? {};
    await resumePendingInsightReports({ env: env as never }, 3);
  } catch (err) {
    console.error("[scheduled] paid-media report resume failed:", err);
  }
}

// Scheduled social posts (#2047) + off-platform reach sync (#2048) — bodies in services/distribution/.
async function processSocialPublishJobs(): Promise<void> {
  try {
    const { processSocialPublishJobs: drain } = await import("./services/distribution/process-publish-jobs.js");
    const env = (globalThis as { __ENV?: Record<string, string | undefined> }).__ENV ?? {};
    await drain(env as never);
  } catch (err) {
    console.error("[scheduled] social publish jobs failed:", err);
  }
}

async function processExternalPostMetrics(): Promise<void> {
  try {
    const { processExternalPostMetrics: sync } = await import("./services/distribution/metrics/sync-post-metrics.js");
    const env = (globalThis as { __ENV?: Record<string, string | undefined> }).__ENV ?? {};
    await sync(env as never);
  } catch (err) {
    console.error("[scheduled] external post metrics failed:", err);
  }
}

// AI Posting Agent (#2300) — expire drafts, plan new posts for enabled users
async function processPostingAgent(): Promise<void> {
  try {
    const { processPostingAgent: run } = await import("./services/distribution/process-posting-agent.js");
    const env = (globalThis as { __ENV?: Record<string, string | undefined> }).__ENV ?? {};
    await run(env as never);
  } catch (err) {
    console.error("[scheduled] posting agent failed:", err);
  }
}

async function processRetentionSweep(): Promise<void> {
  if (!isRetentionSweepWindow(new Date())) return;
  try {
    const summaries = await runRetentionSweep();
    const totalDeleted = summaries.reduce((sum, s) => sum + s.rowsDeleted, 0);
    // Log on errors / an unfinished backlog too, not only on deletes — a
    // table that errors on its first batch or never drains must be visible.
    if (totalDeleted > 0 || summaries.some((s) => s.errorMessage || s.cappedAtLimit)) {
      const breakdown = summaries
        .filter((s) => s.rowsDeleted > 0 || s.errorMessage || s.cappedAtLimit)
        .map((s) => `${s.table}=${s.rowsDeleted}/${s.batches}b${s.cappedAtLimit ? "(capped)" : ""}${s.errorMessage ? `(ERR: ${s.errorMessage})` : ""}`)
        .join(" ");
      console.log(`[scheduled] retention sweep deleted ${totalDeleted} rows — ${breakdown}`);
    }
  } catch (err) {
    console.error("[scheduled] retention sweep failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Counter cache recompute (gap #1605)
// ---------------------------------------------------------------------------
// Once-daily UPDATE pass over the denormalised count columns enumerated in
// `services/maintenance/counter-recompute.ts`. The 04:20 UTC /5 window
// sits between retention (04:15) and fraud (04:30). Each policy only
// touches rows whose cached value drifted from the recomputed count, so
// the pass is cheap when the counters are already accurate.
async function processCounterRecompute(): Promise<void> {
  const now = new Date();
  if (now.getUTCHours() !== 4 || now.getUTCMinutes() < 20 || now.getUTCMinutes() >= 25) return;
  try {
    const summaries = await runCounterRecompute();
    const totalAdjusted = summaries.reduce((sum, s) => sum + s.rowsAdjusted, 0);
    if (totalAdjusted > 0 || summaries.some((s) => s.errorMessage)) {
      const breakdown = summaries
        .filter((s) => s.rowsAdjusted > 0 || s.errorMessage)
        .map((s) => `${s.table}.${s.column}=${s.rowsAdjusted}${s.errorMessage ? `(ERR: ${s.errorMessage})` : ""}`)
        .join(" ");
      console.log(`[scheduled] counter recompute adjusted ${totalAdjusted} rows — ${breakdown}`);
    }
  } catch (err) {
    console.error("[scheduled] counter recompute failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Pure tick-rotation + window-guard predicates (gap #1617 — extracted from
// inline code so they're unit-testable). The /5 cron tick calls these to
// decide which sweeps fire on the current minute. Keeping these pure +
// side-effect-free + exported is the only way to lock down the rotation
// against accidental "fires every tick" regressions (which is what caused
// gap #1589 — all nine sweeps fanned out per /5 tick and blew CPU).
// ---------------------------------------------------------------------------

/** True when the heavy registered-workers dispatcher should fire on the
 *  current tick. /15 cadence: :00, :15, :30, :45 (with /5 jitter window). */
export function isQuarterTick(d: Date): boolean {
  return d.getUTCMinutes() % 15 < 5;
}

/** True when the heaviest sweep (scrapeAllActiveSources) should fire on
 *  the current tick. /30 cadence: :00, :30 (with /5 jitter window). */
export function isHalfTick(d: Date): boolean {
  return d.getUTCMinutes() % 30 < 5;
}

/** True inside the daily 03:30–03:35 UTC window — the seed reconciliation
 *  window (gap #1593). One /5 tick per day satisfies this. */
export function isSeedSuperAdminWindow(d: Date): boolean {
  return d.getUTCHours() === 3 && d.getUTCMinutes() >= 30 && d.getUTCMinutes() < 35;
}

/** True inside the daily 04:15–04:20 UTC window — the retention sweep
 *  window (gap #1602). */
export function isRetentionSweepWindow(d: Date): boolean {
  return d.getUTCHours() === 4 && d.getUTCMinutes() >= 15 && d.getUTCMinutes() < 20;
}

/** True inside the daily 04:30–05:00 UTC window — the fraud sweep window. */
export function isFraudSweepWindow(d: Date): boolean {
  return d.getUTCHours() === 4 && d.getUTCMinutes() >= 30;
}

/** True inside the daily 05:15–05:20 UTC window — the LLM model-catalog drift
 *  check (#1938). One /5 tick per day; sits clear of the seed/retention/fraud
 *  windows above. */
export function isModelCatalogDriftWindow(d: Date): boolean {
  return d.getUTCHours() === 5 && d.getUTCMinutes() >= 15 && d.getUTCMinutes() < 20;
}

/** True inside the monthly close window: 1st of month, 00:00–04:00 UTC. */
export function isMonthlyCloseWindow(d: Date): boolean {
  return d.getUTCDate() === 1 && d.getUTCHours() < 4;
}

/** True inside the partner-pool close window: 1st of month, 02:00–02:05 UTC. */
export function isPartnerPoolCloseWindow(d: Date): boolean {
  return d.getUTCDate() === 1 && d.getUTCHours() === 2 && d.getUTCMinutes() < 5;
}

/** True inside the weekly payout-release window: Tuesday 09:00–09:05 UTC.
 *  #773 — converts ledger balance ≥ minPayoutThresholdCents into actual
 *  `payouts` rows + provider calls. The /5 jitter window means the worker
 *  fires exactly once per Tuesday. */
export function isPayoutReleaseWindow(d: Date): boolean {
  return d.getUTCDay() === 2 && d.getUTCHours() === 9 && d.getUTCMinutes() < 5;
}

/** True inside the monthly article-engagement payout window: 1st of month,
 *  03:00–03:05 UTC. #896 — credits article authors based on the prior
 *  period's read-minutes. */
export function isArticleEngagementPayoutWindow(d: Date): boolean {
  return d.getUTCDate() === 1 && d.getUTCHours() === 3 && d.getUTCMinutes() < 5;
}

// ---------------------------------------------------------------------------
// #773 payout release worker
// ---------------------------------------------------------------------------
async function processPayoutRelease(): Promise<void> {
  if (!isPayoutReleaseWindow(new Date())) return;
  try {
    const env = (globalThis as any).__ENV ?? {};
    const result = await payoutReleaseWorker.tick({ env });
    console.log("[scheduled] payout release", result);
  } catch (err) {
    console.error("[scheduled] payout release failed:", err);
  }
}

// ---------------------------------------------------------------------------
// #896 article engagement payout
// ---------------------------------------------------------------------------
async function processArticleEngagementPayout(): Promise<void> {
  const now = new Date();
  if (!isArticleEngagementPayoutWindow(now)) return;
  try {
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1));
    const result = await engagementPayoutService.runForPeriod({
      periodStart,
      periodEnd,
      centsPer1kReadMinutes: 250,
      resumeExisting: true,
    });
    console.log("[scheduled] article engagement payout", result);
  } catch (err) {
    console.error("[scheduled] article engagement payout failed:", err);
  }
}

// ---------------------------------------------------------------------------
// #1938 LLM model-catalog drift alarm
// ---------------------------------------------------------------------------
// Once a day, diff every model our USE_CASE_PROFILES chains ask for against
// the live gateway catalog and email the maintainer when a pinned model has
// gone retired — the guard that would have caught #1937 (claude-3-haiku
// retiring out from under the paid terminal) before it 503'd tailoring.
async function processModelCatalogDrift(): Promise<void> {
  if (!isModelCatalogDriftWindow(new Date())) return;
  try {
    const env = (globalThis as any).__ENV ?? {};
    const audit = await auditModelCatalog(env);

    if (!audit.gatewayChecked) {
      console.warn("[scheduled] model-catalog drift: gateway unconfigured/unreachable — skipped");
      return;
    }
    if (audit.missing.length === 0) {
      console.log(`[scheduled] model-catalog drift: all ${audit.models.length} configured models resolvable`);
      return;
    }
    // Alert ONLY on partial drift. If EVERY configured model reads missing the
    // cause is almost certainly a catalog-format mismatch in the matcher, not
    // a 100%-simultaneous retirement — emailing that daily would train the
    // maintainer to ignore the alarm. Targeted retirement (the #1937 shape:
    // 1–2 models gone, the rest fine) is exactly the partial case.
    if (audit.missing.length >= audit.models.length) {
      console.warn(
        `[scheduled] model-catalog drift: ALL ${audit.models.length} models read missing — ` +
          "likely a catalog-format mismatch, not retirement; not alerting",
      );
      return;
    }

    console.error("[scheduled] model-catalog drift detected:", audit.missing);
    const recipient = env.SUPERADMIN_EMAIL ?? "seanhogg@gmail.com";
    const subject = `[hired.video] LLM model drift: ${audit.missing.length} configured model(s) missing from the gateway`;
    await sendGenericEmail(recipient, subject, formatModelDriftEmailHtml(audit), "hired.video model-catalog monitor")
      .catch((err) => {
        console.error("[scheduled] model-catalog drift email failed:", err);
        return false;
      });
  } catch (err) {
    console.error("[scheduled] model-catalog drift check failed:", err);
  }
}

/** Tick rotation — distributes the always-running sweeps across the /5
 *  cron cadence so a single invocation doesn't blow the Cloudflare
 *  Worker CPU budget. The old behaviour ran all nine sweeps every
 *  tick (`Promise.allSettled([... 9 sweeps ...])`) and routinely
 *  surfaced `Worker exceeded CPU time limit` in production tail
 *  (2026-05-26, gap #1701). The date-gated sweeps (month close,
 *  fraud sweep, partner pool) already self-gate inside their own
 *  bodies and are always called — the rotation is for the heavy
 *  always-on work (scraper, registered workers).
 *
 *  Cadence:
 *   - every /5 tick:    followups, recruiter outreach, job queue, event reminders,
 *                       partner-payout dispatch, token-pack reconcile, scheduled social
 *                       posts (≤ 3 jobs) (each bounded by
 *                       small per-call limits)
 *   - every /15 tick:   registered workers dispatcher (each worker
 *                       additionally gates itself via isWorkerDue);
 *                       explicit-scan backfill (≤ EXPLICIT_SCAN_BATCH videos);
 *                       pending Microsoft Ads reports (≤ 3, one step each)
 *   - every /30 tick:   scrapeAllActiveSources (HTTP fan-out +
 *                       RSS/JSON parsing — the heaviest sweep); off-platform
 *                       post metrics sync (≤ 6 posts)
 *   - every tick:       month close, fraud sweep, partner pool
 *                       (date-window guards short-circuit cheaply)
 */
export async function runScheduled(): Promise<void> {
  // Email sync intentionally absent — the cron sweep was removed in
  // gap #757. Connected mailboxes now sync exclusively via the PWA
  // (frontend/lib/email-integration/sync-client.ts → POST
  // /api/inbox/external-emails/ingest). Service Worker `periodicSync`
  // is the planned mechanism for syncing while the tab is closed
  // (tracked as gap #758).
  const now = new Date();
  const sweeps: Array<Promise<unknown>> = [
    processFollowUps(),
    processRecruiterOutreach(),
    processCampaigns(),
    processJobQueue(),
    processEventReminders(),
    processPartnerProgramDispatch(),
    processMonthlyUsageClose(),
    processGamificationFraudSweep(),
    processPartnerProgramPool(),
    processSeedSuperAdmin(),
    processRetentionSweep(),
    processCounterRecompute(),
    processPayoutRelease(),
    processArticleEngagementPayout(),
    processModelCatalogDrift(),
    processGeocoderRefresh(),
    processPlacementStageEvents(),
    processConfigSnapshot(),
    processTokenPackReconcile(),
    processSocialPublishJobs(),
    isQuarterTick(now) && !isHalfTick(now) ? processPostingAgent() : Promise.resolve(),
  ];
  if (isQuarterTick(now)) sweeps.push(processRegisteredWorkers());
  if (isQuarterTick(now)) sweeps.push(processExplicitScanBackfill());
  if (isQuarterTick(now)) sweeps.push(processPaidMediaReportResume());
  if (isHalfTick(now))    sweeps.push(scrapeAllActiveSources());
  if (isHalfTick(now))    sweeps.push(processExternalPostMetrics());
  await Promise.allSettled(sweeps);
}
