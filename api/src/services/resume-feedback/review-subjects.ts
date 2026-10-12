/**
 * Review subjects (#2254) — the per-kind content adapter behind the ONE
 * review engine. A review names what it is about with `subject_type` +
 * `subject_id`; the service reads, edits and proposes through the adapter
 * for that kind, never a table of its own. Résumé is the only kind wired
 * today: a job or article review is one more adapter here (its load / apply
 * / validate / save), not a new service.
 */
import {
  isWiredReviewSubject,
  type ReviewSubjectType,
  type SuggestedEdit,
  type WiredReviewSubjectType,
} from "../../../../shared/resume-feedback.js";
import type { IResumeFeedbackRepository, ResumeReviewRow } from "../../repositories/resumeFeedbackRepository.js";
import { applySuggestedEdit, validateProposedDraft } from "./content-edit.js";

export interface ReviewSubjectRef {
  type: ReviewSubjectType;
  id: string;
}

/** The reviewed document as the review surface shows it. */
export interface ReviewSubjectContent {
  id: string;
  ownerId: string;
  title: string;
  content: unknown;
}

export interface ReviewSubjectAdapter {
  load(id: string): Promise<ReviewSubjectContent | null>;
  /** Apply one accepted suggestion; throws ContentEditError when it no longer applies. */
  applyEdit(content: unknown, edit: SuggestedEdit): unknown;
  /** Narrow a reviewer's full proposed draft; throws ContentEditError when invalid. */
  validateDraft(raw: unknown): unknown;
  save(id: string, content: unknown): Promise<void>;
}

/**
 * What a review row is about. Rows written before 0513 carry only
 * `resume_id`, so a missing subject reads as that résumé.
 */
export function subjectOf(row: Pick<ResumeReviewRow, "subjectType" | "subjectId" | "resumeId">): ReviewSubjectRef {
  const type = (row.subjectType ?? "resume") as ReviewSubjectType;
  const id = row.subjectId ?? row.resumeId ?? "";
  return { type, id };
}

/** The columns a new review row gets for `subject` (the résumé FK only for a résumé). */
export function subjectColumns(subject: ReviewSubjectRef): {
  subjectType: ReviewSubjectType;
  subjectId: string;
  resumeId: string | null;
} {
  return { subjectType: subject.type, subjectId: subject.id, resumeId: subject.type === "resume" ? subject.id : null };
}

export function createReviewSubjectAdapters(
  repo: IResumeFeedbackRepository,
): Record<WiredReviewSubjectType, ReviewSubjectAdapter> {
  return {
    resume: {
      async load(id) {
        const slice = await repo.findResumeContentSlice(id);
        return slice ? { id: slice.id, ownerId: slice.userId, title: slice.title, content: slice.content } : null;
      },
      applyEdit: applySuggestedEdit,
      validateDraft: validateProposedDraft,
      save: (id, content) => repo.updateResumeContent(id, content),
    },
  };
}

/** The adapter for `type`, or null when that kind is not wired yet. */
export function adapterFor(
  adapters: Record<WiredReviewSubjectType, ReviewSubjectAdapter>,
  type: string,
): ReviewSubjectAdapter | null {
  return isWiredReviewSubject(type) ? adapters[type] : null;
}
