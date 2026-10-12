/**
 * Review rows → the shared DTOs (shared/resume-feedback.ts). Pure mappers,
 * split out of ResumeFeedbackService so the service holds only orchestration.
 */
import type {
  AnnotationAnchor,
  ProposedDraftDTO,
  ResumeReviewAnnotationDTO,
  ResumeReviewDTO,
  SuggestedEdit,
} from "../../../../shared/resume-feedback.js";
import type {
  ResumeReviewAnnotationRow,
  ResumeReviewRow,
  ResumeVersionRow,
} from "../../repositories/resumeFeedbackRepository.js";
import { subjectOf } from "./review-subjects.js";

export function toReviewDTO(row: ResumeReviewRow, opts: { includeToken: boolean }): ResumeReviewDTO {
  const subject = subjectOf(row);
  return {
    id: row.id,
    subjectType: subject.type,
    subjectId: subject.id,
    resumeId: subject.type === "resume" ? subject.id : null,
    ownerId: row.ownerId,
    reviewerId: row.reviewerId,
    reviewerEmail: row.reviewerEmail,
    reviewerName: row.reviewerName ?? null,
    source: row.source as ResumeReviewDTO["source"],
    coachingInquiryId: row.coachingInquiryId,
    title: row.title,
    status: row.status as ResumeReviewDTO["status"],
    message: row.message,
    ...(opts.includeToken ? { shareToken: row.shareToken } : {}),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAnnotationDTO(
  row: ResumeReviewAnnotationRow,
  authorName: string | null,
): ResumeReviewAnnotationDTO {
  return {
    id: row.id,
    reviewId: row.reviewId,
    authorId: row.authorId,
    authorName,
    kind: row.kind as ResumeReviewAnnotationDTO["kind"],
    body: row.body,
    color: row.color,
    status: row.status as ResumeReviewAnnotationDTO["status"],
    pageId: row.pageId,
    anchor: row.anchor as AnnotationAnchor,
    suggestedEdit: (row.suggestedEdit as SuggestedEdit | null) ?? null,
    parentAnnotationId: row.parentAnnotationId,
    resolvedByUserId: row.resolvedByUserId,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProposalDTO(row: ResumeVersionRow): ProposedDraftDTO {
  return {
    versionId: row.id,
    reviewId: row.reviewId ?? null,
    proposedByUserId: row.proposedByUserId ?? row.userId,
    label: row.label,
    proposalStatus: (row.proposalStatus ?? "proposed") as ProposedDraftDTO["proposalStatus"],
    createdAt: row.createdAt.toISOString(),
  };
}
