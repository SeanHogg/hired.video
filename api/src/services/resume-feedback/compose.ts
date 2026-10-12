/**
 * The resume-feedback application port: one object the routes call, composed
 * from the focused use cases that share a single access policy. It holds no
 * logic of its own — each method is the use case's, bound.
 *
 *   review-access.ts      who may read/write a review, and what it is about
 *   review-engagements.ts create / invite / list / submit / complete / cancel
 *   review-detail.ts      open a review (by id or share link)
 *   review-annotations.ts notes, highlights, comments
 *   review-proposals.ts   suggested edits + proposed drafts, and accepting them
 */
import type { ResumeFeedbackServiceDeps } from "./deps.js";
import { ReviewAccessPolicy } from "./review-access.js";
import { ReviewAnnotations } from "./review-annotations.js";
import { ReviewDetailReader } from "./review-detail.js";
import { ReviewEngagements } from "./review-engagements.js";
import { ReviewProposals } from "./review-proposals.js";

export class ResumeFeedbackService {
  // Engagement lifecycle
  readonly createReview: ReviewEngagements["createReview"];
  readonly inviteReviewers: ReviewEngagements["inviteReviewers"];
  readonly listOwnerReviews: ReviewEngagements["listOwnerReviews"];
  readonly listResumeReviews: ReviewEngagements["listResumeReviews"];
  readonly listReviewerReviews: ReviewEngagements["listReviewerReviews"];
  readonly submitReview: ReviewEngagements["submitReview"];
  readonly completeReview: ReviewEngagements["completeReview"];
  readonly cancelReview: ReviewEngagements["cancelReview"];
  // Detail
  readonly getReviewDetail: ReviewDetailReader["getReviewDetail"];
  readonly getReviewByToken: ReviewDetailReader["getReviewByToken"];
  // Annotations
  readonly listAnnotations: ReviewAnnotations["listAnnotations"];
  readonly createAnnotation: ReviewAnnotations["createAnnotation"];
  readonly updateAnnotation: ReviewAnnotations["updateAnnotation"];
  readonly deleteAnnotation: ReviewAnnotations["deleteAnnotation"];
  // Proposals
  readonly acceptAnnotation: ReviewProposals["acceptAnnotation"];
  readonly proposeDraft: ReviewProposals["proposeDraft"];
  readonly listProposals: ReviewProposals["listProposals"];
  readonly acceptProposal: ReviewProposals["acceptProposal"];
  readonly rejectProposal: ReviewProposals["rejectProposal"];

  constructor(deps: ResumeFeedbackServiceDeps) {
    const access = new ReviewAccessPolicy(deps);
    const engagements = new ReviewEngagements(deps, access);
    const detail = new ReviewDetailReader(deps, access);
    const annotations = new ReviewAnnotations(deps, access);
    const proposals = new ReviewProposals(deps, access);

    this.createReview = engagements.createReview.bind(engagements);
    this.inviteReviewers = engagements.inviteReviewers.bind(engagements);
    this.listOwnerReviews = engagements.listOwnerReviews.bind(engagements);
    this.listResumeReviews = engagements.listResumeReviews.bind(engagements);
    this.listReviewerReviews = engagements.listReviewerReviews.bind(engagements);
    this.submitReview = engagements.submitReview.bind(engagements);
    this.completeReview = engagements.completeReview.bind(engagements);
    this.cancelReview = engagements.cancelReview.bind(engagements);

    this.getReviewDetail = detail.getReviewDetail.bind(detail);
    this.getReviewByToken = detail.getReviewByToken.bind(detail);

    this.listAnnotations = annotations.listAnnotations.bind(annotations);
    this.createAnnotation = annotations.createAnnotation.bind(annotations);
    this.updateAnnotation = annotations.updateAnnotation.bind(annotations);
    this.deleteAnnotation = annotations.deleteAnnotation.bind(annotations);

    this.acceptAnnotation = proposals.acceptAnnotation.bind(proposals);
    this.proposeDraft = proposals.proposeDraft.bind(proposals);
    this.listProposals = proposals.listProposals.bind(proposals);
    this.acceptProposal = proposals.acceptProposal.bind(proposals);
    this.rejectProposal = proposals.rejectProposal.bind(proposals);
  }
}
