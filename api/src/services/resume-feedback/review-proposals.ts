/**
 * The proposal path — everything a reviewer proposes that changes the
 * reviewed content, and the owner's decision on it:
 *   • a suggestedEdit on one annotation, applied through the subject adapter
 *     when the owner accepts it;
 *   • a full proposed draft (a `resume_versions` row), which the owner
 *     accepts (snapshot, then apply) or rejects.
 */
import type {
  ProposeDraftInput,
  ProposedDraftDTO,
  ResumeReviewAnnotationDTO,
  SuggestedEdit,
} from "../../../../shared/resume-feedback.js";
import { invalidateCachedKey } from "../../utils/edge-cache.js";
import { annotationCacheKey, nameForAuthor } from "./annotation-authors.js";
import { ContentEditError } from "./content-edit.js";
import type { ResumeFeedbackServiceDeps } from "./deps.js";
import type { ReviewAccessPolicy } from "./review-access.js";
import { toAnnotationDTO, toProposalDTO } from "./review-dto.js";
import { ResumeFeedbackServiceError } from "./review-errors.js";

export class ReviewProposals {
  constructor(
    private readonly deps: ResumeFeedbackServiceDeps,
    private readonly access: ReviewAccessPolicy,
  ) {}

  /** Owner accepts a suggestion: applies its `suggestedEdit` (if any) to the
   *  reviewed content, then marks the annotation accepted. */
  async acceptAnnotation(
    annotationId: string,
    ownerId: string,
  ): Promise<{ annotation: ResumeReviewAnnotationDTO; appliedEdit: boolean; reviewerId: string | null }> {
    const { annotation, review, role } = await this.access.loadAnnotation(annotationId, ownerId);
    if (role !== "owner") {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Only the owner can accept a suggestion");
    }
    let appliedEdit = false;
    const edit = annotation.suggestedEdit as SuggestedEdit | null;
    if (edit) {
      const { subject, adapter } = this.access.subjectFor(review);
      const doc = await adapter.load(subject.id);
      if (!doc) throw new ResumeFeedbackServiceError("NOT_FOUND", "Reviewed item not found");
      try {
        const next = adapter.applyEdit(doc.content, edit);
        await adapter.save(subject.id, next);
        appliedEdit = true;
      } catch (e) {
        if (e instanceof ContentEditError) {
          throw new ResumeFeedbackServiceError("CONFLICT", e.message);
        }
        throw e;
      }
    }
    const updated = await this.deps.repo.updateAnnotation(annotationId, {
      status: "accepted",
      resolvedByUserId: ownerId,
      resolvedAt: this.deps.now(),
    });
    invalidateCachedKey(annotationCacheKey(review.id));
    // reviewerId lets the route credit gamification points to the reviewer
    // who authored the accepted suggestion (#1952). Null for token-only
    // external reviewers with no platform account.
    return {
      annotation: toAnnotationDTO(updated!, await nameForAuthor(this.deps.repo, updated!.authorId, review)),
      appliedEdit,
      reviewerId: review.reviewerId ?? null,
    };
  }

  async proposeDraft(
    reviewId: string,
    actor: string,
    input: ProposeDraftInput,
    token?: string,
  ): Promise<ProposedDraftDTO> {
    const { review, role } = await this.access.resolveAccess({ reviewId }, actor, token);
    if (role !== "reviewer") {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Only the reviewer can propose a draft");
    }
    if (review.status === "completed" || review.status === "cancelled") {
      throw new ResumeFeedbackServiceError("INVALID_STATE", `Review is ${review.status}`);
    }
    // Proposals ride on resume_versions, so only a résumé takes a full draft.
    const resumeId = this.access.resumeIdOf(review);
    let resumeData;
    try {
      resumeData = this.access.subjectFor(review).adapter.validateDraft(input.resumeData);
    } catch (e) {
      if (e instanceof ContentEditError) {
        throw new ResumeFeedbackServiceError("VALIDATION_ERROR", e.message);
      }
      throw e;
    }
    const versionNumber = await this.deps.repo.nextVersionNumber(resumeId);
    const row = await this.deps.repo.insertProposedVersion({
      resumeId,
      userId: review.ownerId,
      versionNumber,
      label: input.label ?? "Coach proposal",
      resumeData: resumeData as any,
      isAutosave: false,
      proposedByUserId: actor,
      reviewId,
      proposalStatus: "proposed",
    });
    return toProposalDTO(row);
  }

  async listProposals(
    reviewId: string,
    actor: string | null,
    token?: string,
  ): Promise<ProposedDraftDTO[]> {
    await this.access.resolveAccess({ reviewId }, actor, token);
    const rows = await this.deps.repo.listProposalsForReview(reviewId);
    return rows.map((r) => toProposalDTO(r));
  }

  /** Owner accepts a proposed draft: snapshots current content (undoable),
   *  then applies the proposal to the resume. */
  async acceptProposal(versionId: string, ownerId: string): Promise<ProposedDraftDTO> {
    const { version, review } = await this.access.loadProposal(versionId, ownerId);
    const resumeId = this.access.resumeIdOf(review);
    const resume = await this.deps.repo.findResumeContentSlice(resumeId);
    if (!resume) throw new ResumeFeedbackServiceError("NOT_FOUND", "Resume not found");

    // Snapshot the pre-acceptance content so the owner can revert.
    const snapNumber = await this.deps.repo.nextVersionNumber(resumeId);
    await this.deps.repo.insertProposedVersion({
      resumeId,
      userId: ownerId,
      versionNumber: snapNumber,
      label: "Before coach proposal",
      resumeData: resume.content as any,
      isAutosave: false,
    });

    await this.deps.repo.updateResumeContent(resumeId, version.resumeData);
    const updated = await this.deps.repo.setProposalStatus(versionId, "accepted");
    return toProposalDTO(updated!);
  }

  async rejectProposal(versionId: string, ownerId: string): Promise<ProposedDraftDTO> {
    await this.access.loadProposal(versionId, ownerId);
    const updated = await this.deps.repo.setProposalStatus(versionId, "rejected");
    return toProposalDTO(updated!);
  }
}
