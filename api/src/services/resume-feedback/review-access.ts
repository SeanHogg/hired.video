/**
 * Who may read or write a review, and what it is about.
 *
 * Access model (NOT the workspace `canActFor` delegation — feedback is
 * deliberately narrower):
 *   • owner    — `actor === review.ownerId`. Full control; accepts/dismisses
 *                feedback and proposals.
 *   • reviewer — `actor === review.reviewerId`, OR a valid `shareToken`. Gets
 *                review-scoped READ of the reviewed content + authoring of
 *                annotations / proposals within THIS review only. Never gains
 *                general resume access.
 * A self-share link is claimed by the first authenticated visitor (sets
 * `reviewerId`). Coaching reviews are pre-bound to the coach as reviewer.
 */
import type { ReviewRole } from "../../../../shared/resume-feedback.js";
import type {
  ResumeReviewAnnotationRow,
  ResumeReviewRow,
  ResumeVersionRow,
} from "../../repositories/resumeFeedbackRepository.js";
import type { ResumeFeedbackServiceDeps } from "./deps.js";
import { ResumeFeedbackServiceError } from "./review-errors.js";
import {
  adapterFor,
  createReviewSubjectAdapters,
  subjectOf,
  type ReviewSubjectAdapter,
  type ReviewSubjectRef,
} from "./review-subjects.js";

export interface ReviewAccess {
  review: ResumeReviewRow;
  role: ReviewRole;
}

export class ReviewAccessPolicy {
  /** Per-kind content adapters (#2254) — résumé is the only one wired. */
  private readonly subjects: ReturnType<typeof createReviewSubjectAdapters>;

  constructor(private readonly deps: ResumeFeedbackServiceDeps) {
    this.subjects = createReviewSubjectAdapters(deps.repo);
  }

  async resolveAccess(
    locate: { reviewId: string } | { review: ResumeReviewRow },
    actor: string | null,
    token?: string,
  ): Promise<ReviewAccess> {
    let review =
      "review" in locate
        ? locate.review
        : await this.deps.repo.findReviewById(locate.reviewId);
    if (!review) throw new ResumeFeedbackServiceError("NOT_FOUND", "Review not found");

    // The owner ALWAYS retains access to their own review — expiry only gates
    // the reviewer's share link, never the owner's view of the feedback.
    if (actor && review.ownerId === actor) return { review, role: "owner" };

    const expired =
      !!review.expiresAt && review.expiresAt.getTime() < this.deps.now().getTime();
    if (expired) {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "This review link has expired");
    }

    if (actor && review.reviewerId && review.reviewerId === actor) {
      return { review, role: "reviewer" };
    }

    const tokenOk = !!token && token === review.shareToken;
    if (tokenOk) {
      // First authenticated visitor on an unclaimed self-share link claims it.
      if (actor && !review.reviewerId) {
        const claimed = await this.deps.repo.updateReview(review.id, { reviewerId: actor });
        if (claimed) review = claimed;
      }
      return { review, role: "reviewer" };
    }

    throw new ResumeFeedbackServiceError("FORBIDDEN", "You do not have access to this review");
  }

  async assertOwner(reviewId: string, actor: string): Promise<ResumeReviewRow> {
    const review = await this.deps.repo.findReviewById(reviewId);
    if (!review) throw new ResumeFeedbackServiceError("NOT_FOUND", "Review not found");
    if (review.ownerId !== actor) {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Only the owner can do this");
    }
    return review;
  }

  async loadAnnotation(
    annotationId: string,
    actor: string | null,
    token?: string,
  ): Promise<{ annotation: ResumeReviewAnnotationRow; review: ResumeReviewRow; role: ReviewRole }> {
    const annotation = await this.deps.repo.findAnnotationById(annotationId);
    if (!annotation) throw new ResumeFeedbackServiceError("NOT_FOUND", "Annotation not found");
    const { review, role } = await this.resolveAccess({ reviewId: annotation.reviewId }, actor, token);
    return { annotation, review, role };
  }

  /** A still-open proposal on a review the caller owns. */
  async loadProposal(
    versionId: string,
    ownerId: string,
  ): Promise<{ version: ResumeVersionRow; review: ResumeReviewRow }> {
    const version = await this.deps.repo.findVersionById(versionId);
    if (!version || !version.proposedByUserId || !version.reviewId) {
      throw new ResumeFeedbackServiceError("NOT_FOUND", "Proposal not found");
    }
    const review = await this.assertOwner(version.reviewId, ownerId);
    if (version.proposalStatus !== "proposed") {
      throw new ResumeFeedbackServiceError("INVALID_STATE", `Proposal is ${version.proposalStatus}`);
    }
    return { version, review };
  }

  /** The review's subject and the adapter for its kind; a kind with no
   *  adapter yet is refused (#2254 — only résumé is wired). */
  subjectFor(review: ResumeReviewRow): { subject: ReviewSubjectRef; adapter: ReviewSubjectAdapter } {
    const subject = subjectOf(review);
    const adapter = adapterFor(this.subjects, subject.type);
    if (!adapter || !subject.id) {
      throw new ResumeFeedbackServiceError("INVALID_STATE", `Reviews of a ${subject.type} are not supported yet`);
    }
    return { subject, adapter };
  }

  /** The résumé a résumé review is about — for the résumé-only paths
   *  (proposed drafts live in entity_versions). */
  resumeIdOf(review: ResumeReviewRow): string {
    const subject = subjectOf(review);
    if (subject.type !== "resume" || !subject.id) {
      throw new ResumeFeedbackServiceError("INVALID_STATE", "Only a résumé review takes a proposed draft");
    }
    return subject.id;
  }
}
