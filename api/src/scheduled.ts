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
import { getEmailProvider } from "./services/adapters/email.js";
import { scrapeAllActiveSources } from "./services/job/scraper.js";
import { scoreAllCandidatesForJob, scoreAllJobsForCandidate } from "./services/company/recruiter-match.js";
import { workers as registeredWorkers } from "./workers/registry.js";
import { isWorkerDue, runWorker } from "./workers/runner.js";
import { runMonthClose } from "./domains/services-processing/month-close.js";
import { runFraudSweep } from "./services/gamification/fraud-sweep.js";
import { processAccountPurge } from "./services/user/account-purge.js";
import { buildRepos } from "./repositories/index.js";

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
  const now = new Date();
  if (now.getUTCHours() !== 4 || now.getUTCMinutes() < 30) return;
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
// Account purge — hard-delete soft-deleted users past the retention window
// ---------------------------------------------------------------------------
// Closes the gap between PrivacyPolicy.tsx (which promises permanent purge
// after 36 months) and deleteAccount() (which only soft-deletes). The
// processAccountPurge helper self-gates to a once-per-day UTC window so
// the /5 cron tick doesn't run it 288 times.

async function processAccountPurgeSafe(): Promise<void> {
  try {
    const result = await processAccountPurge();
    if (!result.skippedNotDue) {
      console.log("[scheduled] account-purge sweep", result);
    }
  } catch (err) {
    console.error("[scheduled] account-purge sweep failed:", err);
  }
}

async function processMonthlyUsageClose(): Promise<void> {
  const now = new Date();
  const isFirstOfMonth = now.getUTCDate() === 1;
  const isMorningWindow = now.getUTCHours() < 4;
  if (!isFirstOfMonth || !isMorningWindow) return;
  try {
    const summary = await runMonthClose();
    console.log("[scheduled] month-close summary", summary);
  } catch (err) {
    console.error("[scheduled] month-close failed:", err);
  }
}

export async function runScheduled(): Promise<void> {
  // Email sync intentionally absent — the cron sweep was removed in
  // gap #757. Connected mailboxes now sync exclusively via the PWA
  // (frontend/lib/email-integration/sync-client.ts → POST
  // /api/inbox/external-emails/ingest). Service Worker `periodicSync`
  // is the planned mechanism for syncing while the tab is closed
  // (tracked as gap #758).
  await Promise.allSettled([
    processFollowUps(),
    processJobQueue(),
    scrapeAllActiveSources(),
    processRegisteredWorkers(),
    processMonthlyUsageClose(),
    processGamificationFraudSweep(),
    processAccountPurgeSafe(),
  ]);
}
