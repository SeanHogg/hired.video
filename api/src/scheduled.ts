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

import { and, asc, eq, isNotNull, lt, lte, sql } from "drizzle-orm";
import { getDb, schema } from "./db/index.js";
import { getEmailProvider } from "./services/adapters/email.js";
import { scrapeAllActiveSources } from "./services/job/scraper.js";
import { scoreAllCandidatesForJob, scoreAllJobsForCandidate } from "./services/company/recruiter-match.js";
import { runReconciliationPass } from "./services/sourcing/reconciliation.js";
import { resolve as runSourcingResolver } from "./services/sourcing/resolver.js";

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
    case "sourcing.reconcile": {
      // Nightly pass: scan unclaimed sourced_people and flag candidates.
      const limit = typeof payload.limit === "number" ? payload.limit : 500;
      const result = await runReconciliationPass(getDb(), limit);
      console.log(`[scheduled] Reconciliation: scanned ${result.scanned}, flagged ${result.flagged}`);
      break;
    }
    case "sourcing.refresh_stale": {
      // Re-run the resolver against any person_sources rows past their stale_at.
      const limit = typeof payload.limit === "number" ? payload.limit : 100;
      const refreshed = await refreshStaleSources(limit);
      console.log(`[scheduled] Refreshed ${refreshed} stale sources`);
      break;
    }
    case "sourcing.lookup": {
      // Bulk on-demand sourcing — recruiter-saved-search hook can enqueue these.
      const { kind, value, name, company, userId } = payload as Record<string, unknown>;
      if (!kind) throw new Error("Missing query.kind");
      const query: any =
        kind === "name_company"
          ? { kind, name: String(name), company: String(company) }
          : { kind, value: String(value) };
      const out = await runSourcingResolver(getDb(), {} as Record<string, unknown>, query, {
        userId: typeof userId === "string" ? userId : null,
      });
      console.log(`[scheduled] sourcing.lookup status=${out.status} cost=${out.costCents}`);
      break;
    }
    default:
      // Unknown job types are logged but not failed — allows future types to drain gracefully
      console.warn(`[scheduled] Unknown job type: ${job.type}`);
  }
}

// ---------------------------------------------------------------------------
// Sourcing — refresh stale source records
// ---------------------------------------------------------------------------

async function refreshStaleSources(limit: number): Promise<number> {
  const db = getDb();
  const now = new Date();
  const stale = await db
    .select({
      personId: schema.personSources.personId,
      integrationId: schema.personSources.integrationId,
      payload: schema.personSources.payload,
    })
    .from(schema.personSources)
    .where(
      and(isNotNull(schema.personSources.staleAt), lt(schema.personSources.staleAt, now)),
    )
    .limit(limit);
  let refreshed = 0;
  for (const row of stale) {
    const [person] = await db
      .select()
      .from(schema.sourcedPeople)
      .where(eq(schema.sourcedPeople.id, row.personId))
      .limit(1);
    if (!person || person.isRedacted) continue;
    // Pick the cheapest signal we have to re-resolve.
    let query: any = null;
    if (person.primaryEmail) query = { kind: "email", value: person.primaryEmail };
    else if (person.primaryLinkedinUrl) query = { kind: "linkedin_url", value: person.primaryLinkedinUrl };
    else if (person.primaryGithubLogin) query = { kind: "github_login", value: person.primaryGithubLogin };
    if (!query) continue;
    await runSourcingResolver(db, {} as Record<string, unknown>, query, { bypassCache: true });
    refreshed++;
  }
  return refreshed;
}

// ---------------------------------------------------------------------------
// Sourcing — nightly reconciliation pass
// ---------------------------------------------------------------------------

async function nightlyReconcile(): Promise<void> {
  // Cheap to run: scoped at 500/invocation. The cron schedule decides cadence.
  // Skip silently when the table is empty (most envs at first launch).
  const result = await runReconciliationPass(getDb(), 500);
  if (result.scanned > 0) {
    console.log(`[scheduled] Sourcing reconciliation: scanned=${result.scanned} flagged=${result.flagged}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runScheduled(): Promise<void> {
  await Promise.allSettled([
    processFollowUps(),
    processJobQueue(),
    scrapeAllActiveSources(),
    nightlyReconcile(),
  ]);
}
