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

import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "./db/index.js";
import { getEmailProvider, sendGenericEmail } from "./services/adapters/email.js";
import { auditModelCatalog, formatModelDriftEmailHtml } from "./services/adapters/model-catalog-audit.js";
import { scrapeAllActiveSources } from "./services/job/scraper.js";
import { scoreAllCandidatesForJob, scoreAllJobsForCandidate } from "./services/company/recruiter-match.js";
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
import { runCounterRecompute } from "./services/maintenance/counter-recompute.js";
import { payoutReleaseWorker } from "./services/payout/ReleaseWorker.js";
import { engagementPayoutService } from "./services/articles/EngagementPayoutService.js";

// ---------------------------------------------------------------------------
// Follow-up drip processor (#15)
// ---------------------------------------------------------------------------

async function processFollowUps(): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Load all active enrollments that are due, plus their sequence steps
  const due = await db
    .select({
      enrollment: schema.followUpEnrollments,
      sequence: schema.followUpSequences,
    })
    .from(schema.followUpEnrollments)
    .innerJoin(
      schema.followUpSequences,
      eq(schema.followUpEnrollments.sequenceId, schema.followUpSequences.id),
    )
    .where(
      and(
        eq(schema.followUpEnrollments.status, "active"),
        isNotNull(schema.followUpEnrollments.nextSendAt),
        lte(schema.followUpEnrollments.nextSendAt, now),
      ),
    )
    .limit(100);

  if (due.length === 0) return;

  const provider = getEmailProvider();

  for (const { enrollment, sequence } of due) {
    try {
      // Fetch the next step to send (currentStep is 0-indexed offset of next step)
      const nextStepIndex = enrollment.currentStep;
      const [step] = await db
        .select()
        .from(schema.followUpSteps)
        .where(
          and(
            eq(schema.followUpSteps.sequenceId, enrollment.sequenceId),
            eq(schema.followUpSteps.stepOrder, nextStepIndex + 1),
          ),
        )
        .limit(1);

      if (!step) {
        // No more steps — mark enrollment complete
        await db
          .update(schema.followUpEnrollments)
          .set({ status: "completed", completedAt: now, updatedAt: now } as any)
          .where(eq(schema.followUpEnrollments.id, enrollment.id));
        continue;
      }

      // Substitute template variables
      const ctx = (enrollment.context ?? {}) as Record<string, string>;
      const name = enrollment.recipientName ?? ctx.name ?? "there";
      const body = step.bodyTemplate
        .replace(/\{\{name\}\}/gi, name)
        .replace(/\{\{company\}\}/gi, ctx.company ?? "")
        .replace(/\{\{(\w+)\}\}/g, (_m, k) => ctx[k] ?? "");

      let sendStatus: "sent" | "failed" = "sent";
      let errorMessage: string | undefined;

      if (step.channel === "email") {
        if (provider) {
          try {
            await provider.send({
              to: enrollment.recipientEmail,
              subject: step.subject,
              html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
            });
          } catch (err: any) {
            sendStatus = "failed";
            errorMessage = String(err?.message ?? err);
          }
        } else {
          console.warn(`[scheduled] No email provider — skipping follow-up to ${enrollment.recipientEmail}`);
          sendStatus = "failed";
          errorMessage = "No email provider configured";
        }
      }
      // channel === "message" would use in-app messaging; left as a no-op for now

      // Log the send attempt
      await db.insert(schema.followUpLogs).values({
        enrollmentId: enrollment.id,
        stepId: step.id,
        status: sendStatus,
        errorMessage: errorMessage ?? null,
      } as any);

      if (sendStatus === "sent") {
        // Advance to the next step
        const nextStep = await db
          .select()
          .from(schema.followUpSteps)
          .where(
            and(
              eq(schema.followUpSteps.sequenceId, enrollment.sequenceId),
              eq(schema.followUpSteps.stepOrder, nextStepIndex + 2),
            ),
          )
          .limit(1);

        const nextSendAt = nextStep[0]
          ? new Date(now.getTime() + nextStep[0].delayDays * 24 * 60 * 60 * 1000)
          : null;

        await db
          .update(schema.followUpEnrollments)
          .set({
            currentStep: nextStepIndex + 1,
            nextSendAt: nextSendAt ?? undefined,
            status: nextStep[0] ? "active" : "completed",
            completedAt: nextStep[0] ? undefined : now,
            updatedAt: now,
          } as any)
          .where(eq(schema.followUpEnrollments.id, enrollment.id));
      }
    } catch (err) {
      console.error(`[scheduled] Error processing enrollment ${enrollment.id}:`, err);
    }
  }

  console.log(`[scheduled] Processed ${due.length} follow-up enrollment(s).`);
}

// ---------------------------------------------------------------------------
// Generic background job queue processor (#3)
// ---------------------------------------------------------------------------

async function processJobQueue(): Promise<void> {
  const db = getDb();
  const now = new Date();

  const pending = await db
    .select()
    .from(schema.queueJobToProcess)
    .where(
      and(
        eq(schema.queueJobToProcess.status, "pending"),
        lte(schema.queueJobToProcess.attempts, sql`${schema.queueJobToProcess.maxAttempts} - 1`),
      ),
    )
    .orderBy(asc(schema.queueJobToProcess.priority), asc(schema.queueJobToProcess.createdAt))
    .limit(50);

  if (pending.length === 0) return;

  for (const job of pending) {
    // Mark as processing
    await db
      .update(schema.queueJobToProcess)
      .set({ status: "processing", attempts: job.attempts + 1, lastAttemptAt: now, updatedAt: now } as any)
      .where(eq(schema.queueJobToProcess.id, job.id));

    try {
      await dispatchQueueJob(job);

      await db
        .update(schema.queueJobToProcess)
        .set({ status: "completed", completedAt: now, updatedAt: now } as any)
        .where(eq(schema.queueJobToProcess.id, job.id));
    } catch (err: any) {
      const failed = job.attempts + 1 >= job.maxAttempts;
      await db
        .update(schema.queueJobToProcess)
        .set({
          status: failed ? "failed" : "pending",
          error: String(err?.message ?? err),
          failedAt: failed ? now : undefined,
          updatedAt: now,
        } as any)
        .where(eq(schema.queueJobToProcess.id, job.id));
    }
  }

  console.log(`[scheduled] Processed ${pending.length} background job(s).`);
}

async function dispatchQueueJob(job: typeof schema.queueJobToProcess.$inferSelect): Promise<void> {
  const payload = job.payload as Record<string, unknown>;
  switch (job.type) {
    case "send_email": {
      const provider = getEmailProvider();
      if (!provider) throw new Error("No email provider configured");
      await provider.send({
        to: String(payload.to),
        subject: String(payload.subject),
        html: String(payload.html ?? payload.body ?? ""),
      });
      break;
    }
    case "recruiter_score_candidates": {
      const { recruiterId, jobId } = payload;
      if (!recruiterId || !jobId) throw new Error("Missing recruiterId or jobId");
      const result = await scoreAllCandidatesForJob(String(recruiterId), String(jobId));
      console.log(`[scheduled] Scored ${result.scored} candidates for job ${jobId} (${result.skipped} skipped)`);
      break;
    }
    case "recruiter_score_jobs": {
      const { recruiterId: rId, candidateId: cId } = payload;
      if (!rId || !cId) throw new Error("Missing recruiterId or candidateId");
      const result = await scoreAllJobsForCandidate(String(rId), String(cId));
      console.log(`[scheduled] Scored ${result.scored} jobs for candidate ${cId} (${result.skipped} skipped)`);
      break;
    }
    default:
      // Unknown job types are logged but not failed — allows future types to drain gracefully
      console.warn(`[scheduled] Unknown job type: ${job.type}`);
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
// land outside US-peak hours. Each table is bounded to maxRowsPerRun
// per run so a single tick can't blow the CPU budget; remaining rows
// drain over subsequent days. Idempotent — older-than-threshold is the
// only predicate, so re-runs with no eligible rows are no-ops.
async function processRetentionSweep(): Promise<void> {
  if (!isRetentionSweepWindow(new Date())) return;
  try {
    const summaries = await runRetentionSweep();
    const totalDeleted = summaries.reduce((sum, s) => sum + s.rowsDeleted, 0);
    if (totalDeleted > 0) {
      const breakdown = summaries
        .filter((s) => s.rowsDeleted > 0 || s.errorMessage)
        .map((s) => `${s.table}=${s.rowsDeleted}${s.cappedAtLimit ? "(capped)" : ""}${s.errorMessage ? `(ERR: ${s.errorMessage})` : ""}`)
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
 *   - every /5 tick:    followups, job queue, event reminders,
 *                       partner-payout dispatch (each bounded by
 *                       small per-call limits)
 *   - every /15 tick:   registered workers dispatcher (each worker
 *                       additionally gates itself via isWorkerDue)
 *   - every /30 tick:   scrapeAllActiveSources (HTTP fan-out +
 *                       RSS/JSON parsing — the heaviest sweep)
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
  ];
  if (isQuarterTick(now)) sweeps.push(processRegisteredWorkers());
  if (isHalfTick(now))    sweeps.push(scrapeAllActiveSources());
  await Promise.allSettled(sweeps);
}
