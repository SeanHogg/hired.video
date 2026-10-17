/**
 * OutreachSequencesRepository — recruiter outreach sequences (gap #1357)
 * on the ONE sequence engine (`follow_up_*` rows with
 * kind = 'recruiter_outreach', migration 0636).
 *
 * Maps engine rows back to the original /api/recruiter/sequences response
 * shape (steps as an inline array, `recruiterId`, `enrolledAt`, `metadata`)
 * so the web app and the Chrome extension see no change.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { FollowUpStepChannel } from "../../../shared/follow-up-sequences.js";

const { followUpSequences, followUpSteps, followUpEnrollments } = schema;

const KIND = "recruiter_outreach";

type SequenceRow = typeof followUpSequences.$inferSelect;
type StepRow = typeof followUpSteps.$inferSelect;
type EnrollmentRow = typeof followUpEnrollments.$inferSelect;

export interface OutreachStep {
  channel: FollowUpStepChannel;
  delayDays: number;
  subject?: string;
  body: string;
  /** Opt this step into AI rewrite of the rendered body at send time. */
  aiPersonalize?: boolean;
}

export interface OutreachSequenceRow {
  id: string;
  recruiterId: string;
  name: string;
  description: string | null;
  steps: OutreachStep[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutreachSequenceInsert {
  recruiterId: string;
  name: string;
  description?: string | null;
  steps: OutreachStep[];
  isActive?: boolean;
}

export interface OutreachEnrollmentRow {
  id: string;
  sequenceId: string;
  recruiterId: string;
  talentPoolCandidateId: string;
  status: string;
  currentStep: number;
  nextSendAt: Date | null;
  enrolledAt: Date;
  completedAt: Date | null;
  metadata: unknown;
}

export interface OutreachEnrollmentInsert {
  sequenceId: string;
  recruiterId: string;
  talentPoolCandidateId: string;
  status: string;
  currentStep: number;
  nextSendAt: Date | null;
}

function isChannel(v: string): v is FollowUpStepChannel {
  return v === "email" || v === "message" || v === "sms";
}

function toStep(row: StepRow): OutreachStep {
  const step: OutreachStep = {
    channel: isChannel(row.channel) ? row.channel : "email",
    delayDays: row.delayDays,
    body: row.bodyTemplate,
  };
  if (row.subject) step.subject = row.subject;
  if (row.aiPersonalize) step.aiPersonalize = true;
  return step;
}

function toSequence(row: SequenceRow, steps: StepRow[]): OutreachSequenceRow {
  return {
    id: row.id,
    recruiterId: row.userId,
    name: row.name,
    description: row.description,
    steps: [...steps].sort((a, b) => a.stepOrder - b.stepOrder).map(toStep),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEnrollment(row: EnrollmentRow): OutreachEnrollmentRow {
  return {
    id: row.id,
    sequenceId: row.sequenceId,
    recruiterId: row.userId,
    talentPoolCandidateId: row.talentPoolCandidateId ?? "",
    status: row.status,
    currentStep: row.currentStep,
    nextSendAt: row.nextSendAt,
    enrolledAt: row.createdAt,
    completedAt: row.completedAt,
    metadata: row.context ?? {},
  };
}

async function stepsBySequence(sequenceIds: string[]): Promise<Map<string, StepRow[]>> {
  const out = new Map<string, StepRow[]>();
  if (sequenceIds.length === 0) return out;
  const rows = await getDb()
    .select()
    .from(followUpSteps)
    .where(inArray(followUpSteps.sequenceId, sequenceIds))
    .orderBy(asc(followUpSteps.stepOrder));
  for (const row of rows) out.set(row.sequenceId, [...(out.get(row.sequenceId) ?? []), row]);
  return out;
}

const isOutreach = (id: string) => and(eq(followUpSequences.id, id), eq(followUpSequences.kind, KIND));

export async function insertOutreachSequence(values: OutreachSequenceInsert): Promise<OutreachSequenceRow> {
  const db = getDb();
  const [seq] = await db
    .insert(followUpSequences)
    .values({
      userId: values.recruiterId,
      kind: KIND,
      name: values.name,
      description: values.description ?? null,
      isActive: values.isActive ?? true,
    })
    .returning();
  const steps: StepRow[] = values.steps.length
    ? await db
        .insert(followUpSteps)
        .values(
          values.steps.map((s, i) => ({
            sequenceId: seq.id,
            stepOrder: i + 1,
            delayDays: s.delayDays,
            subject: s.subject ?? null,
            bodyTemplate: s.body,
            channel: s.channel,
            aiPersonalize: s.aiPersonalize ?? false,
          })),
        )
        .returning()
    : [];
  return toSequence(seq, steps);
}

export async function listOutreachSequences(recruiterId: string): Promise<OutreachSequenceRow[]> {
  const rows = await getDb()
    .select()
    .from(followUpSequences)
    .where(and(eq(followUpSequences.userId, recruiterId), eq(followUpSequences.kind, KIND)))
    .orderBy(desc(followUpSequences.updatedAt));
  const steps = await stepsBySequence(rows.map((r) => r.id));
  return rows.map((r) => toSequence(r, steps.get(r.id) ?? []));
}

export async function findOutreachSequence(id: string): Promise<OutreachSequenceRow | null> {
  const [row] = await getDb().select().from(followUpSequences).where(isOutreach(id)).limit(1);
  if (!row) return null;
  const steps = await stepsBySequence([row.id]);
  return toSequence(row, steps.get(row.id) ?? []);
}

/** Owner of a sequence (null when the sequence does not exist). */
export async function findOutreachSequenceOwner(id: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ userId: followUpSequences.userId })
    .from(followUpSequences)
    .where(isOutreach(id))
    .limit(1);
  return row ? row.userId : null;
}

export async function deleteOutreachSequence(id: string): Promise<void> {
  await getDb().delete(followUpSequences).where(isOutreach(id));
}

/** Throws on the (sequence, candidate) unique conflict — caller treats as duplicate. */
export async function insertOutreachEnrollment(values: OutreachEnrollmentInsert): Promise<OutreachEnrollmentRow> {
  const [row] = await getDb()
    .insert(followUpEnrollments)
    .values({
      sequenceId: values.sequenceId,
      userId: values.recruiterId,
      talentPoolCandidateId: values.talentPoolCandidateId,
      status: values.status,
      currentStep: values.currentStep,
      nextSendAt: values.nextSendAt,
      context: {},
    })
    .returning();
  return toEnrollment(row);
}

export async function listOutreachEnrollments(sequenceId: string): Promise<OutreachEnrollmentRow[]> {
  const rows = await getDb()
    .select()
    .from(followUpEnrollments)
    .where(eq(followUpEnrollments.sequenceId, sequenceId))
    .orderBy(desc(followUpEnrollments.createdAt));
  return rows.map(toEnrollment);
}
