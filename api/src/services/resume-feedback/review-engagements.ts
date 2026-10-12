/**
 * The review engagement's lifecycle: an owner opens a review (or invites
 * many reviewers at once), lists their reviews, and completes / cancels them;
 * the reviewer submits. Status flow: pending → active → submitted →
 * completed | cancelled.
 */
import {
  DEFAULT_REVIEW_EXPIRY_HOURS,
  type CreateReviewInput,
  type InviteReviewersInput,
  type ResumeReviewDTO,
  type SubmitReviewInput,
} from "../../../../shared/resume-feedback.js";
import type { ResumeReviewRow } from "../../repositories/resumeFeedbackRepository.js";
import type { ResumeFeedbackServiceDeps } from "./deps.js";
import type { ReviewAccessPolicy } from "./review-access.js";
import { toReviewDTO } from "./review-dto.js";
import { ResumeFeedbackServiceError } from "./review-errors.js";
import { subjectColumns } from "./review-subjects.js";

export class ReviewEngagements {
  constructor(
    private readonly deps: ResumeFeedbackServiceDeps,
    private readonly access: ReviewAccessPolicy,
  ) {}

  async createReview(ownerId: string, input: CreateReviewInput): Promise<ResumeReviewDTO> {
    await this.assertResumeOwner(input.resumeId, ownerId);

    if (input.source === "coaching") {
      if (!input.coachingInquiryId || !input.reviewerUserId) {
        throw new ResumeFeedbackServiceError(
          "VALIDATION_ERROR",
          "Coaching reviews require coachingInquiryId and reviewerUserId",
        );
      }
    }
    if (input.reviewerUserId && input.reviewerUserId === ownerId) {
      throw new ResumeFeedbackServiceError("VALIDATION_ERROR", "Cannot review your own resume");
    }

    const row = await this.deps.repo.insertReview({
      ...subjectColumns({ type: "resume", id: input.resumeId }),
      ownerId,
      reviewerId: input.reviewerUserId ?? null,
      reviewerEmail: input.reviewerEmail ?? null,
      reviewerName: input.reviewerName ?? null,
      shareToken: this.generateToken(),
      source: input.source,
      coachingInquiryId: input.coachingInquiryId ?? null,
      title: input.title ?? null,
      status: "pending",
      message: input.message ?? null,
      expiresAt: this.computeExpiry({
        source: input.source,
        expiresInHours: input.expiresInHours,
        expiresInDays: input.expiresInDays,
      }),
    });
    return toReviewDTO(row, { includeToken: true });
  }

  /**
   * Batch invite: share ONE resume with many reviewers at once. Each invitee
   * (a platform user by id, or an external person by email) gets their OWN
   * review — its own share link + feedback thread — so feedback stays
   * attributable per person and one reviewer's revoke/expiry never touches
   * another's. Returns the created reviews (token included) so the caller can
   * fan out invite emails + notifications.
   */
  async inviteReviewers(ownerId: string, input: InviteReviewersInput): Promise<ResumeReviewDTO[]> {
    await this.assertResumeOwner(input.resumeId, ownerId);
    const expiresAt = this.computeExpiry({
      source: "self_share",
      expiresInHours: input.expiresInHours,
    });
    // One review per invitee, written in ONE multi-row insert.
    const rows = await this.deps.repo.insertReviews(
      input.invitees
        .filter((invitee) => !(invitee.userId && invitee.userId === ownerId)) // can't review your own resume
        .map((invitee) => ({
          ...subjectColumns({ type: "resume", id: input.resumeId }),
          ownerId,
          reviewerId: invitee.userId ?? null,
          reviewerEmail: invitee.email ?? null,
          reviewerName: invitee.name ?? null,
          shareToken: this.generateToken(),
          source: "self_share",
          coachingInquiryId: null,
          title: input.title ?? null,
          status: "pending",
          message: input.message ?? null,
          expiresAt,
        })),
    );
    return rows.map((row) => toReviewDTO(row, { includeToken: true }));
  }

  async listOwnerReviews(ownerId: string): Promise<ResumeReviewDTO[]> {
    const rows = await this.deps.repo.listReviewsForOwner(ownerId);
    return this.hydrateCounts(rows, { includeToken: true });
  }

  /** Owner: every feedback session on ONE of my resumes (the per-resume manager
   *  surface). Scoped to the caller by `ownerId` so a non-owner gets nothing,
   *  never another user's reviews. Tokens included so the owner can copy links. */
  async listResumeReviews(ownerId: string, resumeId: string): Promise<ResumeReviewDTO[]> {
    const rows = (await this.deps.repo.listReviewsForResume(resumeId)).filter(
      (r) => r.ownerId === ownerId,
    );
    return this.hydrateCounts(rows, { includeToken: true });
  }

  async listReviewerReviews(reviewerId: string): Promise<ResumeReviewDTO[]> {
    const rows = await this.deps.repo.listReviewsForReviewer(reviewerId);
    return this.hydrateCounts(rows, { includeToken: false });
  }

  async submitReview(
    reviewId: string,
    actor: string | null,
    input: SubmitReviewInput,
    token?: string,
  ): Promise<ResumeReviewDTO> {
    const { review, role } = await this.access.resolveAccess({ reviewId }, actor, token);
    if (role !== "reviewer") {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Only the reviewer can submit feedback");
    }
    if (review.status === "completed" || review.status === "cancelled") {
      throw new ResumeFeedbackServiceError("INVALID_STATE", `Review is ${review.status}`);
    }
    const updated = await this.deps.repo.updateReview(reviewId, {
      status: "submitted",
      submittedAt: this.deps.now(),
      message: input.message ?? review.message,
    });
    return toReviewDTO(updated!, { includeToken: false });
  }

  async completeReview(reviewId: string, ownerId: string): Promise<ResumeReviewDTO> {
    await this.access.assertOwner(reviewId, ownerId);
    const updated = await this.deps.repo.updateReview(reviewId, {
      status: "completed",
      completedAt: this.deps.now(),
    });
    return toReviewDTO(updated!, { includeToken: true });
  }

  async cancelReview(reviewId: string, ownerId: string): Promise<ResumeReviewDTO> {
    await this.access.assertOwner(reviewId, ownerId);
    const updated = await this.deps.repo.updateReview(reviewId, { status: "cancelled" });
    return toReviewDTO(updated!, { includeToken: true });
  }

  private async assertResumeOwner(resumeId: string, ownerId: string): Promise<void> {
    const resume = await this.deps.repo.findResumeContentSlice(resumeId);
    if (!resume) throw new ResumeFeedbackServiceError("NOT_FOUND", "Resume not found");
    if (resume.userId !== ownerId) {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Not your resume");
    }
  }

  /** Resolve a review's expiry. Explicit hours win over explicit days; a
   *  self-share link with no override gets the default comment window so every
   *  share link eventually expires. Coaching engagements have no default. */
  private computeExpiry(opts: {
    source: string;
    expiresInHours?: number;
    expiresInDays?: number;
  }): Date | null {
    const explicitMs =
      opts.expiresInHours != null
        ? opts.expiresInHours * 3_600_000
        : opts.expiresInDays != null
          ? opts.expiresInDays * 86_400_000
          : null;
    const ttlMs =
      explicitMs ?? (opts.source === "self_share" ? DEFAULT_REVIEW_EXPIRY_HOURS * 3_600_000 : null);
    return ttlMs != null ? new Date(this.deps.now().getTime() + ttlMs) : null;
  }

  private generateToken(): string {
    const bytes = this.deps.randomBytes(32);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex;
  }

  private async hydrateCounts(
    rows: ResumeReviewRow[],
    opts: { includeToken: boolean },
  ): Promise<ResumeReviewDTO[]> {
    const counts = await this.deps.repo.annotationCountsForReviews(rows.map((r) => r.id));
    const byId = new Map(counts.map((c) => [c.reviewId, c]));
    return rows.map((r) => {
      const c = byId.get(r.id);
      return {
        ...toReviewDTO(r, opts),
        openAnnotationCount: c?.open ?? 0,
        totalAnnotationCount: c?.total ?? 0,
      };
    });
  }
}
