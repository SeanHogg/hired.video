/**
 * In-video lead forms (#140) + knowledge checks (#201) — use cases behind
 * routes/studio-features/forms.ts. Callers authorise the owner-side calls
 * first (may the actor act on the project?); every authoring write
 * invalidates the project's public engagement cache, which serves active
 * forms to viewers. A submission lands in `studio_video_form_submissions`
 * AND mirrors into `marketing_leads` for the unified lead inbox.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import {
  createStudioVideoFormsRepository,
  type StudioVideoFormPatch,
  type StudioVideoFormRow,
  type StudioVideoFormSubmissionRow,
} from "../../repositories/studioVideoFormsRepository.js";
import { MarketingRepository } from "../../repositories/marketingRepository.js";
import { passesGate } from "../learning/scoring.js";
import { invalidatePublicEngagement, viewerMaySubmitToProject } from "./public-engagement.js";

const repo = () => createStudioVideoFormsRepository(getDb());
const formNotFound = () => new DomainError(404, "NOT_FOUND", "Form not found");

/** Default knowledge-check pass mark when the form sets none. */
const DEFAULT_PASSING_SCORE_PCT = 80;

export interface CreateVideoFormInput {
  title: string;
  description?: string | null;
  positionSeconds: number;
  fields: unknown[];
  requireToContinue: boolean;
  redirectUrl?: string | null;
  submitButtonText?: string;
  formType?: string;
  answerKey?: Record<string, unknown> | null;
  passingScorePct?: number | null;
  maxAttempts?: number | null;
  remediationJumpToSceneId?: string | null;
  courseLessonId?: string | null;
}

export function listProjectForms(projectId: string): Promise<StudioVideoFormRow[]> {
  return repo().listByProject(projectId);
}

export function getVideoForm(id: string): Promise<StudioVideoFormRow | null> {
  return repo().findById(id);
}

export async function createVideoForm(
  userId: string,
  projectId: string,
  input: CreateVideoFormInput,
): Promise<StudioVideoFormRow> {
  const form = await repo().insert({
    userId,
    projectId,
    title: input.title,
    description: input.description ?? null,
    positionSeconds: input.positionSeconds,
    fields: input.fields,
    requireToContinue: input.requireToContinue,
    redirectUrl: input.redirectUrl ?? null,
    submitButtonText: input.submitButtonText ?? "Continue",
    formType: input.formType ?? "lead_capture",
    answerKey: input.answerKey ?? null,
    passingScorePct: input.passingScorePct ?? null,
    maxAttempts: input.maxAttempts ?? null,
    remediationJumpToSceneId: input.remediationJumpToSceneId ?? null,
    courseLessonId: input.courseLessonId ?? null,
  });
  invalidatePublicEngagement(projectId);
  return form;
}

/** Patch one form of `projectId`; null when the row is gone. */
export async function updateVideoForm(
  projectId: string,
  id: string,
  patch: StudioVideoFormPatch,
): Promise<StudioVideoFormRow | null> {
  const updated = await repo().update(id, patch);
  if (updated) invalidatePublicEngagement(projectId);
  return updated;
}

/** The deleted id, or null when the row is gone. */
export async function deleteVideoForm(projectId: string, id: string): Promise<string | null> {
  const deleted = await repo().deleteById(id);
  if (deleted) invalidatePublicEngagement(projectId);
  return deleted;
}

export function listFormSubmissions(formId: string): Promise<StudioVideoFormSubmissionRow[]> {
  return repo().listSubmissions(formId);
}

// ─── Submit ──────────────────────────────────────────────────────────────────

export interface KnowledgeCheckGrade {
  scoreRaw: number | null;
  scoreMax: number | null;
  passed: boolean | null;
  remediationJumpToSceneId: string | null;
}

/** #201 — grade a knowledge-check submission against the stored answer key
 *  (case- and whitespace-insensitive). Lead-capture forms, or a check with no
 *  key, grade to all-null. The pass gate routes through the shared scoring
 *  seam (#1642) so rounding matches every other "did the learner pass?". */
export function gradeKnowledgeCheck(
  form: Pick<StudioVideoFormRow, "formType" | "answerKey" | "passingScorePct" | "remediationJumpToSceneId">,
  answers: Record<string, string>,
): KnowledgeCheckGrade {
  if (form.formType !== "knowledge_check" || !form.answerKey) {
    return { scoreRaw: null, scoreMax: null, passed: null, remediationJumpToSceneId: null };
  }
  const key = form.answerKey as Record<string, { correctAnswer: string; points?: number }>;
  let earned = 0;
  let max = 0;
  for (const [fieldKey, spec] of Object.entries(key)) {
    const pts = spec.points ?? 1;
    max += pts;
    if (String(answers[fieldKey] ?? "").trim().toLowerCase() ===
        String(spec.correctAnswer).trim().toLowerCase()) {
      earned += pts;
    }
  }
  const threshold = form.passingScorePct ?? DEFAULT_PASSING_SCORE_PCT;
  const passed = passesGate({ scoreRaw: earned, scoreMin: 0, scoreMax: max }, threshold);
  return {
    scoreRaw: earned,
    scoreMax: max,
    passed,
    remediationJumpToSceneId: passed ? null : (form.remediationJumpToSceneId ?? null),
  };
}

export interface SubmitVideoFormInput {
  answers: Record<string, string>;
  timestampSec?: number;
  videoId?: string;
  referrer?: string;
}

/** A viewer's submission from the playback overlay / embedded player.
 *  Malformed, unknown and inactive forms, and projects the viewer may not
 *  submit to, all answer 404; a missing required field answers 400. */
export async function submitVideoForm(
  formId: string,
  viewerId: string | null,
  input: SubmitVideoFormInput,
  ipCountry: string | null,
) {
  if (!UUID_LIKE_REGEX.test(formId)) throw formNotFound();
  const db = getDb();
  const forms = createStudioVideoFormsRepository(db);
  const form = await forms.findById(formId);
  if (!form || !form.isActive) throw formNotFound();
  if (!(await viewerMaySubmitToProject(viewerId, form.projectId))) throw formNotFound();

  const fields = (form.fields as Array<{ key: string; required: boolean; type: string }>) || [];
  for (const f of fields) {
    if (f.required && !input.answers[f.key]) {
      throw new DomainError(400, "VALIDATION_ERROR", `Required field missing: ${f.key}`);
    }
  }

  const email = input.answers["email"] ?? null;
  const name = input.answers["name"] ?? null;
  const company = input.answers["company"] ?? null;
  const grade = gradeKnowledgeCheck(form, input.answers);

  const submission = await forms.insertSubmission({
    formId,
    projectId: form.projectId,
    videoId: input.videoId ?? null,
    viewerEmail: email,
    viewerName: name,
    answers: input.answers,
    timestampSec: input.timestampSec ?? null,
    referrer: input.referrer ?? null,
    ipCountry,
    scoreRaw: grade.scoreRaw,
    scoreMax: grade.scoreMax,
    passed: grade.passed,
  });

  // Mirror into the global lead inbox (#54 / #38).
  if (email) {
    await new MarketingRepository(db).insertMarketingLead({
      email,
      name,
      company,
      source: "video-form",
      metadata: {
        formId,
        projectId: form.projectId,
        formTitle: form.title,
        timestampSec: input.timestampSec ?? null,
      },
    }).catch(() => { /* ignore duplicate-email FKs */ });
  }

  return {
    id: submission.id,
    redirectUrl: form.redirectUrl,
    // #201 — knowledge-check fields. Null for lead-capture forms.
    formType: form.formType,
    scoreRaw: grade.scoreRaw,
    scoreMax: grade.scoreMax,
    passed: grade.passed,
    remediationJumpToSceneId: grade.remediationJumpToSceneId,
  };
}
