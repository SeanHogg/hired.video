/**
 * Cron-driven sequence processor (extracted from scheduled.ts):
 *   - processFollowUps — the ONE sequence engine (follow_up_*, migration
 *     0636): nurture drips (#15) AND recruiter outreach cadences (#2015).
 *
 * Per-kind behaviour lives in SEQUENCE_KIND_POLICIES; everything else
 * (step lookup, {{var}} render, consent gate, AI personalization, send log,
 * advance) is shared.
 *
 * Batching (neon-http = one HTTP round-trip per query):
 *   - consent is resolved for every due recipient up front via
 *     MarketingConsentService.filterMailable (2 queries total, was 2/row);
 *   - steps for every due sequence are prefetched in ONE query;
 *   - candidate recipients are joined into the due query;
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
  type DueEnrollment,
} from "../../repositories/dripQueuesRepository.js";
import { logger } from "../../lib/logger.js";
import {
  FOLLOW_UP_SEQUENCE_KINDS,
  type FollowUpSequenceKind,
} from "../../../../shared/follow-up-sequences.js";

const DUE_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SUBJECT = "Following up";

interface SequenceKindPolicy {
  /** Status set when an email step can't be delivered (no address / opted out). */
  undeliverableStatus: "unsubscribed" | "completed";
  /** Advance past a step whose send failed (outreach) vs retry it next tick (nurture). */
  advanceOnSendFailure: boolean;
  /** Record each touch on the talent-pool candidate timeline. */
  recordInteraction: boolean;
}

const SEQUENCE_KIND_POLICIES: Record<FollowUpSequenceKind, SequenceKindPolicy> = {
  // CAN-SPAM: an unsubscribed/suppressed nurture recipient is stopped.
  nurture: { undeliverableStatus: "unsubscribed", advanceOnSendFailure: false, recordInteraction: false },
  // An undeliverable candidate ends the cadence so it never spins forever.
  recruiter_outreach: { undeliverableStatus: "completed", advanceOnSendFailure: true, recordInteraction: true },
};

function isSequenceKind(v: string): v is FollowUpSequenceKind {
  return (FOLLOW_UP_SEQUENCE_KINDS as readonly string[]).includes(v);
}

function policyFor(kind: string): SequenceKindPolicy {
  return SEQUENCE_KIND_POLICIES[isSequenceKind(kind) ? kind : "nurture"];
}

/** jsonb context → string vars (non-string values are ignored). */
function stringVars(ctx: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return out;
  for (const [k, v] of Object.entries(ctx)) if (typeof v === "string") out[k] = v;
  return out;
}

interface Recipient {
  email: string | null;
  name: string | null;
  vars: Record<string, string>;
}

/** Candidate recipients (outreach) read contact fields from the joined
 *  talent-pool row; email recipients (nurture) from the enrollment. */
function resolveRecipient(row: DueEnrollment): Recipient {
  const { enrollment } = row;
  const ctx = stringVars(enrollment.context);
  if (enrollment.talentPoolCandidateId) {
    const name = row.candidateName?.trim() || null;
    return {
      email: row.candidateEmail,
      name,
      vars: { ...ctx, name: name ?? "there", company: row.candidateCompany ?? "" },
    };
  }
  const name = enrollment.recipientName ?? ctx.name ?? null;
  return {
    email: enrollment.recipientEmail,
    name,
    vars: { ...ctx, name: name ?? "there", company: ctx.company ?? "" },
  };
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? vars[k.toLowerCase()] ?? "");
}

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

/** Returns how many due enrollments were handled (0 = nothing was due). */
export async function processFollowUps(): Promise<number> {
  const db = getDb();
  const repo = new DripQueuesRepository(db);
  const now = new Date();

  const due = await repo.listDueEnrollments(now, DUE_LIMIT);
  if (due.length === 0) return 0;

  const provider = getEmailProvider();
  const env = (globalThis as any).__ENV ?? {};
  // Sequences are marketing/outreach — honor the same opt-out gate campaigns
  // use. 1:1 sequences have no category, so we check the master switch +
  // hard suppression only (pass null category).
  const consent = new MarketingConsentService(buildRepos(db).emailConsent as any);
  const recipients = due.map(resolveRecipient);
  const [stepsBySequence, mailable] = await Promise.all([
    repo.findStepsBySequence(due.map((d) => d.enrollment.sequenceId)),
    mailableEmailSet(consent, recipients.map((r) => r.email)),
  ]);

  const toComplete: string[] = [];
  const toUnsubscribe: string[] = [];
  const interactions: CandidateInteractionInsert[] = [];

  try {
    for (const [i, row] of due.entries()) {
      const { enrollment, sequence } = row;
      const recipient = recipients[i];
      const policy = policyFor(sequence.kind);
      try {
        // currentStep = how many steps were sent; step_order is 1-based.
        const steps = stepsBySequence.get(enrollment.sequenceId);
        const step = steps?.get(enrollment.currentStep + 1);
        if (!step) {
          toComplete.push(enrollment.id);
          continue;
        }

        let body = renderTemplate(step.bodyTemplate, recipient.vars);
        const subject = step.subject || DEFAULT_SUBJECT;
        let sendStatus: "sent" | "failed" = "sent";
        let errorMessage: string | null = null;

        if (step.channel === "email") {
          if (!recipient.email || !mailable.has(recipient.email)) {
            (policy.undeliverableStatus === "unsubscribed" ? toUnsubscribe : toComplete).push(enrollment.id);
            continue;
          }
          // AI personalization (opt-in per step) runs AFTER the deterministic
          // render and degrades to it on any failure.
          if (step.aiPersonalize) {
            body = await personalizeMessage(env, undefined, {
              body,
              recipientName: recipient.name,
              subject: step.subject ?? undefined,
              context: recipient.vars,
            });
          }
          if (provider) {
            try {
              await provider.send({ to: recipient.email, subject, html: `<p>${body.replace(/\n/g, "<br>")}</p>` });
            } catch (err: unknown) {
              sendStatus = "failed";
              errorMessage = err instanceof Error ? err.message : String(err);
              logger.error("[scheduled] sequence send failed", { enrollmentId: enrollment.id, error: err });
            }
          } else {
            logger.warn("[scheduled] No email provider — skipping sequence step", { enrollmentId: enrollment.id });
            sendStatus = "failed";
            errorMessage = "No email provider configured";
          }
        }
        // channel "message" / "sms" have no live transport yet — they advance
        // the sequence (logged) without delivery.

        await repo.insertFollowUpLog({ enrollmentId: enrollment.id, stepId: step.id, status: sendStatus, errorMessage });

        if (policy.recordInteraction && enrollment.talentPoolCandidateId) {
          interactions.push({
            recruiterId: enrollment.userId,
            candidateId: enrollment.userId, // placeholder until candidate links an account
            talentPoolId: enrollment.talentPoolCandidateId,
            type: "outreach_sent",
            subject: step.subject || `Outreach step ${enrollment.currentStep + 1}`,
            notes: body.slice(0, 500),
            metadata: { sequenceId: sequence.id, step: enrollment.currentStep, channel: step.channel },
          });
        }

        if (sendStatus === "sent" || policy.advanceOnSendFailure) {
          const nextStep = steps?.get(enrollment.currentStep + 2);
          await repo.advanceFollowUpEnrollment(
            enrollment.id,
            {
              currentStep: enrollment.currentStep + 1,
              nextSendAt: nextStep ? new Date(now.getTime() + (nextStep.delayDays || 0) * DAY_MS) : null,
              completed: !nextStep,
            },
            now,
          );
        }
      } catch (err) {
        logger.error("[scheduled] Error processing enrollment", { enrollmentId: enrollment.id, error: err });
      }
    }
  } finally {
    await Promise.all([
      repo.setFollowUpEnrollmentsStatus(toComplete, "completed", now),
      repo.setFollowUpEnrollmentsStatus(toUnsubscribe, "unsubscribed", now),
      repo.insertCandidateInteractions(interactions),
    ]).catch((err) => logger.error("[scheduled] sequence status flush failed", err));
  }

  logger.info("[scheduled] Processed sequence enrollments", { count: due.length });
  return due.length;
}
