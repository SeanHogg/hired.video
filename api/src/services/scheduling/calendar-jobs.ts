/**
 * Daily / weekly / monthly cron jobs. Each is selected by the HOURLY cron
 * (cron-plan.ts `hourlyJobsFor`) — no window guards in here; each job runs
 * once in its hour. All are idempotent, so a retried invocation is safe.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import { sendGenericEmail } from "../adapters/email/senders/notifications.js";
import { auditModelCatalog, formatModelDriftEmailHtml } from "../adapters/model-catalog-audit.js";
import { runMonthClose } from "../../domains/services-processing/month-close.js";
import { runFraudSweep } from "../gamification/fraud-sweep.js";
import { buildRepos } from "../../repositories/index.js";
import { closePartnerPoolForLastMonth } from "../articles/partner-pool.js";
import { seedSuperAdminAndCompany } from "../../seed.js";
import { runRetentionSweep } from "../maintenance/retention-sweep.js";
import { runGeocoderRefresh, buildGeocoderRefreshDeps } from "../location/geocoder-refresh.js";
import { runCounterRecompute } from "../maintenance/counter-recompute.js";
import { payoutReleaseWorker } from "../payout/ReleaseWorker.js";
import { engagementPayoutService } from "../articles/EngagementPayoutService.js";
import { signalWork } from "./work-signals.js";

type Env = Record<string, string | undefined>;
const workerEnv = (): Env => (globalThis as { __ENV?: Env }).__ENV ?? {};

/** SuperAdmin + platform-company + sector-article seed (gap #1593) — a
 *  daily "fill in anything missing" reconciliation; never overwrites. */
export async function runSeedSuperAdmin(): Promise<void> {
  await seedSuperAdminAndCompany();
}

/** 04:xx maintenance, in order: retention sweep (gap #1602) → counter
 *  recompute (gap #1605) → gamification fraud sweep. Sequential so the three
 *  heaviest daily passes never share a Neon connection burst. */
export async function runDailyMaintenance(): Promise<void> {
  try {
    const summaries = await runRetentionSweep();
    const totalDeleted = summaries.reduce((sum, s) => sum + s.rowsDeleted, 0);
    if (totalDeleted > 0 || summaries.some((s) => s.errorMessage || s.cappedAtLimit)) {
      const breakdown = summaries
        .filter((s) => s.rowsDeleted > 0 || s.errorMessage || s.cappedAtLimit)
        .map((s) => `${s.table}=${s.rowsDeleted}/${s.batches}b${s.cappedAtLimit ? "(capped)" : ""}${s.errorMessage ? `(ERR: ${s.errorMessage})` : ""}`)
        .join(" ");
      logger.info(`[scheduled] retention sweep deleted ${totalDeleted} rows — ${breakdown}`);
    }
  } catch (err) {
    logger.error("[scheduled] retention sweep failed", err);
  }

  try {
    const summaries = await runCounterRecompute();
    const totalAdjusted = summaries.reduce((sum, s) => sum + s.rowsAdjusted, 0);
    if (totalAdjusted > 0 || summaries.some((s) => s.errorMessage)) {
      const breakdown = summaries
        .filter((s) => s.rowsAdjusted > 0 || s.errorMessage)
        .map((s) => `${s.table}.${s.column}=${s.rowsAdjusted}${s.errorMessage ? `(ERR: ${s.errorMessage})` : ""}`)
        .join(" ");
      logger.info(`[scheduled] counter recompute adjusted ${totalAdjusted} rows — ${breakdown}`);
    }
  } catch (err) {
    logger.error("[scheduled] counter recompute failed", err);
  }

  try {
    const db = getDb();
    const result = await runFraudSweep(buildRepos(db), db);
    logger.info("[scheduled] gamification fraud sweep", result);
  } catch (err) {
    logger.error("[scheduled] gamification fraud sweep failed", err);
  }
}

/** #1938 — diff every model USE_CASE_PROFILES asks for against the live
 *  gateway catalog; email the maintainer on PARTIAL drift only (all-missing
 *  is a matcher/format problem, not a retirement). */
export async function runModelCatalogDrift(): Promise<void> {
  const env = workerEnv();
  const audit = await auditModelCatalog(env as never);
  if (!audit.gatewayChecked) {
    logger.warn("[scheduled] model-catalog drift: gateway unconfigured/unreachable — skipped");
    return;
  }
  if (audit.missing.length === 0) {
    logger.info(`[scheduled] model-catalog drift: all ${audit.models.length} configured models resolvable`);
    return;
  }
  if (audit.missing.length >= audit.models.length) {
    logger.warn(
      `[scheduled] model-catalog drift: ALL ${audit.models.length} models read missing — ` +
        "likely a catalog-format mismatch, not retirement; not alerting",
    );
    return;
  }
  logger.error("[scheduled] model-catalog drift detected", { missing: audit.missing });
  const recipient = env.SUPERADMIN_EMAIL ?? "seanhogg@gmail.com";
  const subject = `[hired.video] LLM model drift: ${audit.missing.length} configured model(s) missing from the gateway`;
  await sendGenericEmail(recipient, subject, formatModelDriftEmailHtml(audit), "hired.video model-catalog monitor")
    .catch((err) => {
      logger.error("[scheduled] model-catalog drift email failed", err);
      return false;
    });
}

/** #1161 — re-geocode popular-but-stale geocoder_cache rows + LRU-evict. */
export async function runGeocoderRefreshJob(): Promise<void> {
  const deps = buildGeocoderRefreshDeps(workerEnv() as never, buildRepos(getDb()).geocoderCache);
  logger.info("[scheduled] geocoder refresh", await runGeocoderRefresh(deps));
}

/** #230 — DATE-based placement stage events (started / first_day /
 *  guarantee_expires). Idempotent via placement_notification_log. */
export async function runPlacementStageEvents(): Promise<void> {
  const { buildPlacementNotificationService } = await import("../notifications/placement-notifications.js");
  const fired = await buildPlacementNotificationService(getDb()).sweepStageEvents(new Date());
  logger.info(`[scheduled] placement stage events fired=${fired}`);
}

/** Rolls usage_ledger into frozen usage_statements + one usage_invoices row
 *  per user; idempotent via unique constraints. */
export async function runMonthlyUsageClose(): Promise<void> {
  logger.info("[scheduled] month-close summary", await runMonthClose());
}

/** Partner Program pool close (gap #172): paid-sub revenue for the closing
 *  month → closePartnerPoolForLastMonth. New payout rows wake the
 *  `partner-payouts` queue marker. */
export async function runPartnerPoolClose(now: Date = new Date()): Promise<void> {
  const db = getDb();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1));
  let subscriberRevenueCents = 0;
  try {
    const [row] = await db
      .select({ total: sql<number>`COALESCE(SUM(${schema.usageInvoices.totalCents}), 0)::int` })
      .from(schema.usageInvoices)
      .where(
        and(
          eq(schema.usageInvoices.status, "paid"),
          sql`${schema.usageInvoices.periodStart} >= ${periodStart.toISOString().slice(0, 10)}`,
          sql`${schema.usageInvoices.periodStart} <  ${periodEnd.toISOString().slice(0, 10)}`,
        ),
      );
    subscriberRevenueCents = row?.total ?? 0;
  } catch (err) {
    // Still write a $0 pool row for the period (audit trail).
    logger.warn("[scheduled] partner pool: revenue read failed, defaulting to 0", err);
  }
  const result = await closePartnerPoolForLastMonth({ db, now, subscriberRevenueCents });
  logger.info("[scheduled] partner pool closed", result);
  await signalWork("partner-payouts");
}

/** #896 — credit article authors for the prior month's read-minutes. */
export async function runArticleEngagementPayout(now: Date = new Date()): Promise<void> {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1));
  const result = await engagementPayoutService.runForPeriod({
    periodStart,
    periodEnd,
    centsPer1kReadMinutes: 250,
    resumeExisting: true,
  });
  logger.info("[scheduled] article engagement payout", result);
}

/** #773 — convert ledger balance ≥ threshold into payouts + provider calls. */
export async function runPayoutRelease(): Promise<void> {
  logger.info("[scheduled] payout release", await payoutReleaseWorker.tick({ env: workerEnv() as never }));
}
