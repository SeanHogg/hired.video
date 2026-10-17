/**
 * Recruiter outreach sequences (gap #1357) — multi-step email/message/sms
 * cadences and candidate enrollments. Enrollment schedules step 0 from its
 * `delayDays`; later steps are advanced by the sequence engine
 * (services/outreach/drip-processors.ts, work queue "followups").
 * Route: routes/recruiter/sequences.ts.
 */
import { z } from "zod";
import { DomainError } from "../../domains/errors.js";
import { signalWork } from "../scheduling/work-signals.js";
import {
  deleteOutreachSequence,
  findOutreachSequence,
  findOutreachSequenceOwner,
  insertOutreachEnrollment,
  insertOutreachSequence,
  listOutreachEnrollments,
  listOutreachSequences,
  type OutreachEnrollmentRow,
} from "../../repositories/outreachSequencesRepository.js";
import type { JsonBody } from "./talent-pool.js";
import { FOLLOW_UP_STEP_CHANNELS } from "../../../../shared/follow-up-sequences.js";

export const OutreachStepSchema = z.object({
  channel: z.enum(FOLLOW_UP_STEP_CHANNELS),
  delayDays: z.number().int().min(0).max(365),
  subject: z.string().optional(),
  body: z.string().min(1),
  // Opt this step into AI personalization at send time (processFollowUps).
  aiPersonalize: z.boolean().optional(),
});

export const OutreachSequenceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  steps: z.array(OutreachStepSchema).min(1).max(10),
  isActive: z.boolean().optional(),
});

const sequenceNotFound = () => new DomainError(404, "NOT_FOUND", "Sequence not found");

export async function createOutreachSequence(recruiterId: string, rawBody: unknown) {
  const parsed = OutreachSequenceSchema.safeParse(rawBody);
  if (!parsed.success) throw new DomainError(400, "VALIDATION_ERROR", "Invalid sequence", parsed.error.flatten());
  return insertOutreachSequence({
    recruiterId,
    name: parsed.data.name,
    description: parsed.data.description,
    steps: parsed.data.steps,
    isActive: parsed.data.isActive ?? true,
  });
}

export const getOutreachSequences = listOutreachSequences;

export async function removeOutreachSequence(recruiterId: string, id: string): Promise<{ deleted: true }> {
  const owner = await findOutreachSequenceOwner(id);
  if (!owner || owner !== recruiterId) throw sequenceNotFound();
  await deleteOutreachSequence(id);
  return { deleted: true };
}

/** Enroll a pool candidate; a unique conflict reports `duplicate`. */
export async function enrollInOutreachSequence(
  recruiterId: string,
  sequenceId: string,
  body: JsonBody,
): Promise<{ row: OutreachEnrollmentRow } | { duplicate: true }> {
  const candidateId = String(body?.talentPoolCandidateId ?? "");
  if (!candidateId) throw new DomainError(400, "VALIDATION_ERROR", "talentPoolCandidateId required");

  const seq = await findOutreachSequence(sequenceId);
  if (!seq || seq.recruiterId !== recruiterId) throw sequenceNotFound();

  const firstStep = seq.steps[0] ?? { delayDays: 0 };
  const nextSendAt = new Date(Date.now() + (firstStep.delayDays ?? 0) * 86_400_000);

  try {
    const row = await insertOutreachEnrollment({
      sequenceId,
      recruiterId,
      talentPoolCandidateId: candidateId,
      status: "active",
      currentStep: 0,
      nextSendAt,
    });
    await signalWork("followups", nextSendAt);
    return { row };
  } catch {
    return { duplicate: true };
  }
}

export async function getOutreachEnrollments(recruiterId: string, sequenceId: string) {
  const owner = await findOutreachSequenceOwner(sequenceId);
  if (!owner || owner !== recruiterId) throw sequenceNotFound();
  return listOutreachEnrollments(sequenceId);
}
