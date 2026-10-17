/**
 * Nurture follow-up sequences (/api/followups) — use cases over the ONE
 * sequence engine (follow_up_*, kind = 'nurture'). Sends are made by
 * processFollowUps (drip-processors.ts) on the "followups" work queue.
 * Route: routes/followups.ts. Throws DomainError on rule violations.
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { signalWork } from "../scheduling/work-signals.js";
import {
  FollowUpsRepository,
  type FollowUpEnrollmentRow,
  type FollowUpEnrollmentStatus,
} from "../../repositories/followUpsRepository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const StepSchema = z.object({
  stepOrder: z.number().int().min(1),
  delayDays: z.number().int().min(0),
  subject: z.string().min(1).max(500),
  bodyTemplate: z.string().min(1),
  channel: z.enum(["email", "message"]).default("email"),
  // Opt this step into AI rewrite of the rendered body at send time.
  aiPersonalize: z.boolean().default(false),
});

const CreateSequenceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  steps: z.array(StepSchema).min(1).max(10),
});

const EnrollSchema = z.object({
  sequenceId: UuidLikeSchema,
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  recipientUserId: UuidLikeSchema.optional(),
  context: z.record(z.string(), z.string()).optional(),
});

const TriggerSchema = z.object({
  trigger: z.string().min(1).max(100), // e.g. "signup", "job_match", "trial_expiring"
  sequenceId: UuidLikeSchema.optional(),
  sequenceName: z.string().optional(), // fallback: match by sequence name
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  recipientUserId: UuidLikeSchema.optional(),
  context: z.record(z.string(), z.string()).optional(),
});

const ENROLLMENT_ACTIONS: Record<string, FollowUpEnrollmentStatus> = {
  pause: "paused",
  resume: "active",
  cancel: "unsubscribed",
};

const repo = () => new FollowUpsRepository(getDb());

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new DomainError(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  return parsed.data;
}

const sequenceNotFound = () => new DomainError(404, "NOT_FOUND", "Sequence not found");

export const listSequences = (userId: string) => repo().listSequences(userId);

export async function createSequence(userId: string, body: unknown) {
  const input = parse(CreateSequenceSchema, body);
  return repo().insertSequenceWithSteps(userId, { name: input.name, description: input.description }, input.steps);
}

export async function getSequenceDetail(userId: string, id: string) {
  const r = repo();
  const sequence = await r.findSequence(id, userId);
  if (!sequence) throw sequenceNotFound();
  const [steps, enrollments] = await Promise.all([r.listSteps(sequence.id), r.listEnrollmentsForSequence(sequence.id)]);
  return { ...sequence, steps, enrollments };
}

export async function removeSequence(userId: string, id: string): Promise<{ deleted: true }> {
  const r = repo();
  const sequence = await r.findSequence(id, userId);
  if (!sequence) throw sequenceNotFound();
  await r.deleteSequence(sequence.id);
  return { deleted: true };
}

export async function enroll(userId: string, body: unknown): Promise<FollowUpEnrollmentRow> {
  const input = parse(EnrollSchema, body);
  const r = repo();
  const sequence = await r.findSequence(input.sequenceId, userId);
  if (!sequence) throw sequenceNotFound();

  const delayDays = await r.firstStepDelayDays(sequence.id);
  const nextSendAt = delayDays === null ? null : new Date(Date.now() + delayDays * DAY_MS);

  const enrollment = await r.insertEnrollment({
    sequenceId: input.sequenceId,
    userId,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    recipientUserId: input.recipientUserId,
    context: input.context ?? {},
    status: "active",
    currentStep: 0,
    nextSendAt: nextSendAt ?? undefined,
  });
  if (nextSendAt) await signalWork("followups", nextSendAt);
  return enrollment;
}

export const listEnrollments = (userId: string) => repo().listEnrollmentsForUser(userId);

export async function changeEnrollmentStatus(userId: string, id: string, action: string): Promise<FollowUpEnrollmentRow> {
  const status = ENROLLMENT_ACTIONS[action];
  if (!status) throw new DomainError(400, "VALIDATION_ERROR", "action must be pause | resume | cancel");
  const r = repo();
  const enrollmentId = await r.findEnrollmentId(id, userId);
  if (!enrollmentId) throw new DomainError(404, "NOT_FOUND", "Enrollment not found");
  const updated = await r.setEnrollmentStatus(enrollmentId, status);
  if (action === "resume") await signalWork("followups");
  return updated;
}

export type TriggerResult =
  | { created: false; body: { enrolled: false; reason: string; enrollmentId: string } }
  | { created: true; body: { enrolled: true; enrollmentId: string; nextSendAt: string } };

/** Behaviour-triggered enrollment (#29): resolve the sequence by id, then
 *  by name, then by the trigger name; skip when already actively enrolled. */
export async function triggerEnrollment(userId: string, body: unknown): Promise<TriggerResult> {
  const { trigger, sequenceId, sequenceName, recipientEmail, recipientName, recipientUserId, context } =
    parse(TriggerSchema, body);
  const r = repo();

  let resolvedId: string | null = null;
  if (sequenceId) resolvedId = await r.findActiveSequenceId(userId, { id: sequenceId });
  if (!resolvedId && sequenceName) resolvedId = await r.findActiveSequenceId(userId, { name: sequenceName });
  if (!resolvedId) resolvedId = await r.findActiveSequenceId(userId, { name: trigger });
  if (!resolvedId) throw new DomainError(404, "NOT_FOUND", `No active sequence found for trigger "${trigger}"`);

  const existingId = await r.findActiveEnrollmentId(resolvedId, recipientEmail);
  if (existingId) {
    return { created: false, body: { enrolled: false, reason: "Already enrolled in this sequence", enrollmentId: existingId } };
  }

  const delayDays = await r.firstStepDelayDays(resolvedId);
  const nextSendAt = delayDays === null ? new Date() : new Date(Date.now() + delayDays * DAY_MS);

  const enrollment = await r.insertEnrollment({
    sequenceId: resolvedId,
    userId,
    recipientEmail,
    recipientName: recipientName ?? null,
    recipientUserId: recipientUserId ?? null,
    context: { trigger, ...(context ?? {}) },
    status: "active",
    currentStep: 0,
    nextSendAt,
  });
  await signalWork("followups", nextSendAt);

  return { created: true, body: { enrolled: true, enrollmentId: enrollment.id, nextSendAt: nextSendAt.toISOString() } };
}
