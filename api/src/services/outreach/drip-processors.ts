/**
 * Cron-driven drip processors (extracted from scheduled.ts):
 *   - processFollowUps          — follow-up nurture drips (#15)
 *   - processRecruiterOutreach  — recruiter outreach sequences (#2015)
 *
 * Batching (neon-http = one HTTP round-trip per query):
 *   - consent is resolved for every due recipient up front via
 *     MarketingConsentService.filterMailable (2 queries total, was 2/row);
 *   - follow-up steps for every due sequence are prefetched in ONE query
 *     (was 2 step SELECTs per enrollment);
 *   - status transitions that do NOT follow a send (no-step → completed,
 *     unsubscribed, undeliverable) are flushed as one `inArray` UPDATE per
 *     status at the end of the tick;
 *   - outreach timeline interactions are flushed as one multi-row insert.
 *
 * Deliberately still per-row: the post-send log + "advance enrollment"
 * write. Keeping those immediately after each send bounds the re-send
 * window if the Worker is killed mid-tick to the one in-flight recipient
 * (a deferred batch would re-send every already-mailed recipient).
 */

import { getDb } from "../../db/index.js";
import { getEmailProvider } from "../adapters/email.js";
import { buildRepos } from "../../repositories/index.js";
import { MarketingConsentService } from "../email/MarketingConsentService.js";
import { personalizeMessage } from "./personalize.js";
import {
  DripQueuesRepository,
  type CandidateInteractionInsert,
} from "../../repositories/dripQueuesRepository.js";

const DUE_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Emails (as stored) that may receive a null-category (master switch +
 *  hard suppression) send. */
async function mailableEmailSet(
  consent: MarketingConsentService,
  emails: Array<string | null | undefined>,
): Promise<Set<string>> {
  const unique = [...new Set(emails.filter((e): e is string => Boolean(e)))];
  const allowed = await consent.filterMailable(unique.map((email) => ({ email })), null);
  return new Set(allowed.map((r) => r.email));
}

// ---------------------------------------------------------------------------
// Follow-up drip processor (#15)
// ---------------------------------------------------------------------------

export async function processFollowUps(): Promise<void> {
  const db = getDb();
  const repo = new DripQueuesRepository(db);
  const now = new Date();

  // Load all active enrollments that are due, plus their sequence steps
  const due = await repo.listDueFollowUps(now, DUE_LIMIT);
  if (due.length === 0) return;

  const provider = getEmailProvider();
  // Nurture drips are marketing — honor the same opt-out gate campaigns use.
  // 1:1 sequences have no category, so we check the master switch + hard
  // suppression only (pass null category).
  const consent = new MarketingConsentService(buildRepos(db).emailConsent as any);
  const [stepsBySequence, mailable] = await Promise.all([
    repo.findStepsBySequence(due.map((d) => d.enrollment.sequenceId)),
    mailableEmailSet(consent, due.map((d) => d.enrollment.recipientEmail)),
  ]);

  const toComplete: string[] = [];
  const toUnsubscribe: string[] = [];

  try {
    for (const { enrollment } of due) {
      try {
        // Fetch the next step to send (currentStep is 0-indexed offset of next step)
        const nextStepIndex = enrollment.currentStep;
        const steps = stepsBySequence.get(enrollment.sequenceId);
        const step = steps?.get(nextStepIndex + 1);

        if (!step) {
          // No more steps — mark enrollment complete
          toComplete.push(enrollment.id);
          continue;
        }

        // Substitute template variables
        const ctx = (enrollment.context ?? {}) as Record<string, string>;
        const name = enrollment.recipientName ?? ctx.name ?? "there";
        let body = step.bodyTemplate
          .replace(/\{\{name\}\}/gi, name)
          .replace(/\{\{company\}\}/gi, ctx.company ?? "")
          .replace(/\{\{(\w+)\}\}/g, (_m, k) => ctx[k] ?? "");

        // AI message personalization (opt-in per step). Runs AFTER deterministic
        // {{var}} substitution; degrades to the rendered body on any failure so a
        // model outage never blocks the drip.
        if (step.aiPersonalize) {
          const env = (globalThis as any).__ENV ?? {};
          body = await personalizeMessage(env, undefined, {
            body,
            recipientName: enrollment.recipientName ?? ctx.name ?? null,
            subject: step.subject,
            context: ctx,
          });
        }

        let sendStatus: "sent" | "failed" = "sent";
        let errorMessage: string | undefined;

        if (step.channel === "email") {
          // CAN-SPAM: an unsubscribed/suppressed recipient must not receive
          // marketing nurture. Stop the enrollment so we don't re-attempt.
          if (!mailable.has(enrollment.recipientEmail)) {
            toUnsubscribe.push(enrollment.id);
            continue;
          }
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
        await repo.insertFollowUpLog({
          enrollmentId: enrollment.id,
          stepId: step.id,
          status: sendStatus,
          errorMessage: errorMessage ?? null,
        });

        if (sendStatus === "sent") {
          // Advance to the next step (prefetched — no extra SELECT)
          const nextStep = steps?.get(nextStepIndex + 2);
          await repo.advanceFollowUpEnrollment(
            enrollment.id,
            {
              currentStep: nextStepIndex + 1,
              nextSendAt: nextStep ? new Date(now.getTime() + nextStep.delayDays * DAY_MS) : null,
              completed: !nextStep,
            },
            now,
          );
        }
      } catch (err) {
        console.error(`[scheduled] Error processing enrollment ${enrollment.id}:`, err);
      }
    }
  } finally {
    await Promise.all([
      repo.setFollowUpEnrollmentsStatus(toComplete, "completed", now),
      repo.setFollowUpEnrollmentsStatus(toUnsubscribe, "unsubscribed", now),
    ]).catch((err) => console.error("[scheduled] follow-up status flush failed:", err));
  }

  console.log(`[scheduled] Processed ${due.length} follow-up enrollment(s).`);
}

// ---------------------------------------------------------------------------
// Recruiter outreach sender (#2015)
// Mirrors processFollowUps but for recruiter_outreach_enrollments, whose steps
// live as a JSONB array on the sequence. Reuses the shared personalizeMessage
// helper and the same MarketingConsentService gate as the nurture drip.
// ---------------------------------------------------------------------------

type OutreachStep = {
  channel: "email" | "message" | "sms";
  delayDays: number;
  subject?: string;
  body: string;
  aiPersonalize?: boolean;
};

export async function processRecruiterOutreach(): Promise<void> {
  const db = getDb();
  const repo = new DripQueuesRepository(db);
  const now = new Date();

  // Join the candidate in the same query so the per-row loop never N+1s for
  // recipient email/name/company.
  const due = await repo.listDueOutreach(now, DUE_LIMIT);
  if (due.length === 0) return;

  const provider = getEmailProvider();
  const consent = new MarketingConsentService(buildRepos(db).emailConsent as any);
  const env = (globalThis as any).__ENV ?? {};
  const mailable = await mailableEmailSet(consent, due.map((r) => r.candidateEmail));

  const toComplete: string[] = [];
  const interactions: CandidateInteractionInsert[] = [];

  try {
    for (const row of due) {
      const { enrollment, sequence } = row;
      try {
        const steps = (sequence.steps ?? []) as OutreachStep[];
        const step = steps[enrollment.currentStep];

        if (!step) {
          toComplete.push(enrollment.id);
          continue;
        }

        const name = row.candidateName?.trim() || "there";
        const company = row.candidateCompany ?? "";
        let body = step.body
          .replace(/\{\{name\}\}/gi, name)
          .replace(/\{\{company\}\}/gi, company)
          .replace(/\{\{(\w+)\}\}/g, () => "");

        if (step.channel === "email") {
          // No address to reach, or recipient suppressed → stop the sequence so it
          // doesn't spin forever on an undeliverable candidate.
          if (!row.candidateEmail || !mailable.has(row.candidateEmail)) {
            toComplete.push(enrollment.id);
            continue;
          }
          if (step.aiPersonalize) {
            body = await personalizeMessage(env, undefined, {
              body,
              recipientName: name,
              subject: step.subject,
              context: { company },
            });
          }
          if (provider) {
            await provider
              .send({
                to: row.candidateEmail,
                subject: step.subject || "Following up",
                html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
              })
              .catch((err: any) =>
                console.error(`[outreach] send failed for ${enrollment.id}:`, err?.message ?? err),
              );
          }
        }
        // channel "message" / "sms" have no live transport yet — they advance the
        // sequence (logged as an interaction) without delivery.

        // Record the touch on the candidate timeline (reuses candidate_interactions;
        // flushed as one multi-row insert at the end of the tick).
        interactions.push({
          recruiterId: enrollment.recruiterId,
          candidateId: enrollment.recruiterId, // placeholder until candidate links an account
          talentPoolId: enrollment.talentPoolCandidateId,
          type: "outreach_sent",
          subject: step.subject || `Outreach step ${enrollment.currentStep + 1}`,
          notes: body.slice(0, 500),
          metadata: { sequenceId: sequence.id, step: enrollment.currentStep, channel: step.channel },
        });

        // Advance to the next step (or complete).
        const nextStep = steps[enrollment.currentStep + 1];
        await repo.advanceOutreachEnrollment(
          enrollment.id,
          {
            currentStep: enrollment.currentStep + 1,
            nextSendAt: nextStep ? new Date(now.getTime() + (nextStep.delayDays || 0) * DAY_MS) : null,
            completed: !nextStep,
          },
          now,
        );
      } catch (err) {
        console.error(`[scheduled] Error processing outreach enrollment ${enrollment.id}:`, err);
      }
    }
  } finally {
    await Promise.all([
      repo.completeOutreachEnrollments(toComplete, now),
      repo.insertCandidateInteractions(interactions),
    ]).catch((err) => console.error("[scheduled] outreach flush failed:", err));
  }

  console.log(`[scheduled] Processed ${due.length} recruiter outreach enrollment(s).`);
}
