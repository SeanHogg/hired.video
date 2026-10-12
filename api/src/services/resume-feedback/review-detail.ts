/**
 * Opening a review: the full detail (reviewed content, annotations, proposals)
 * for whoever is allowed to see it, by id or by share link. A reviewer's first
 * open claims an unclaimed self-share link and flips `pending → active`.
 */
import type { ResumeReviewDetailDTO } from "../../../../shared/resume-feedback.js";
import { authorNamesByAnnotation } from "./annotation-authors.js";
import type { ResumeFeedbackServiceDeps } from "./deps.js";
import type { ReviewAccess, ReviewAccessPolicy } from "./review-access.js";
import { toAnnotationDTO, toProposalDTO, toReviewDTO } from "./review-dto.js";
import { ResumeFeedbackServiceError } from "./review-errors.js";

/** Alias of the shared contract so callers keep importing `ReviewDetail` from
 *  the service seam; the shape itself is the SSoT in `shared/resume-feedback`. */
export type ReviewDetail = ResumeReviewDetailDTO;

export class ReviewDetailReader {
  constructor(
    private readonly deps: ResumeFeedbackServiceDeps,
    private readonly access: ReviewAccessPolicy,
  ) {}

  async getReviewDetail(
    reviewId: string,
    actor: string | null,
    token?: string,
  ): Promise<ReviewDetail> {
    return this.buildDetail(await this.access.resolveAccess({ reviewId }, actor, token));
  }

  async getReviewByToken(token: string, actor: string | null): Promise<ReviewDetail> {
    const review = await this.deps.repo.findReviewByToken(token);
    if (!review) throw new ResumeFeedbackServiceError("NOT_FOUND", "Review link not found");
    return this.buildDetail(await this.access.resolveAccess({ review }, actor, token));
  }

  private async buildDetail(access: ReviewAccess): Promise<ReviewDetail> {
    let review = access.review;
    // A reviewer opening a pending review activates it.
    if (access.role === "reviewer" && review.status === "pending") {
      const updated = await this.deps.repo.updateReview(review.id, {
        status: "active",
      });
      if (updated) review = updated;
    }
    const { subject, adapter } = this.access.subjectFor(review);
    const doc = await adapter.load(subject.id);
    if (!doc) throw new ResumeFeedbackServiceError("NOT_FOUND", "Reviewed item not found");
    const [annotations, proposals] = await Promise.all([
      this.deps.repo.listAnnotations(review.id),
      this.deps.repo.listProposalsForReview(review.id),
    ]);
    const names = await authorNamesByAnnotation(this.deps.repo, review, annotations);
    return {
      role: access.role,
      review: toReviewDTO(review, { includeToken: access.role === "owner" }),
      resume: { id: doc.id, title: doc.title, content: doc.content },
      annotations: annotations.map((a) => toAnnotationDTO(a, names.get(a.id) ?? null)),
      proposals: proposals.map((p) => toProposalDTO(p)),
    };
  }
}
