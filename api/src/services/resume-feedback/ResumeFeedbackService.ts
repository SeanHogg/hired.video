/**
 * ResumeFeedbackService — orchestrates the resume-review aggregate: the
 * feedback engagement, its annotations (sticky notes / highlights / comments),
 * and reviewer-proposed draft revisions.
 *
 * Access model (NOT the workspace `canActFor` delegation — feedback is
 * deliberately narrower):
 *   • owner    — `actor === review.ownerId`. Full control; accepts/dismisses
 *                feedback and proposals.
 *   • reviewer — `actor === review.reviewerId`, OR a valid `shareToken`. Gets
 *                review-scoped READ of the resume content + authoring of
 *                annotations / proposals within THIS review only. Never gains
 *                general resume access.
 * A self-share link is claimed by the first authenticated visitor (sets
 * `reviewerId`). Coaching reviews are pre-bound to the coach as reviewer.
 *
 * The annotation list is served through the read-through edge cache and
 * invalidated on every annotation write (per the caching rule).
 */
import {
  REVIEW_SOURCES,
  type CreateReviewInput,
  type CreateAnnotationInput,
  type UpdateAnnotationInput,
  type SubmitReviewInput,
  type ProposeDraftInput,
  type ResumeReviewDTO,
  type ResumeReviewAnnotationDTO,
  type ProposedDraftDTO,
  type AnnotationAnchor,
  type SuggestedEdit,
} from "../../../../shared/resume-feedback.js";
import type {
  IResumeFeedbackRepository,
  ResumeReviewRow,
  ResumeReviewAnnotationRow,
  ResumeVersionRow,
} from "../../repositories/resumeFeedbackRepository.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { applySuggestedEdit, validateProposedDraft, ContentEditError } from "./content-edit.js";

export interface ResumeFeedbackServiceDeps {
  repo: IResumeFeedbackRepository;
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

export type ResumeFeedbackErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INVALID_STATE"
  | "CONFLICT";

export class ResumeFeedbackServiceError extends Error {
  constructor(public readonly code: ResumeFeedbackErrorCode, message: string) {
    super(message);
    this.name = "ResumeFeedbackServiceError";
  }
}

export type ReviewRole = "owner" | "reviewer";

export interface ReviewAccess {
  review: ResumeReviewRow;
  role: ReviewRole;
}

export interface ReviewDetail {
  role: ReviewRole;
  review: ResumeReviewDTO;
  resume: { id: string; title: string; content: unknown };
  annotations: ResumeReviewAnnotationDTO[];
  proposals: ProposedDraftDTO[];
}

const ANNOTATION_CACHE_TTL = 120;
const annotationCacheKey = (reviewId: string) => `resume-feedback:annotations:${reviewId}`;

export class ResumeFeedbackService {
  constructor(private readonly deps: ResumeFeedbackServiceDeps) {}

  // ── Reviews ────────────────────────────────────────────────────────────────

  async createReview(ownerId: string, input: CreateReviewInput): Promise<ResumeReviewDTO> {
    const resume = await this.deps.repo.findResumeContentSlice(input.resumeId);
    if (!resume) throw new ResumeFeedbackServiceError("NOT_FOUND", "Resume not found");
    if (resume.userId !== ownerId) {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Not your resume");
    }

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

    const expiresAt = input.expiresInDays
      ? new Date(this.deps.now().getTime() + input.expiresInDays * 86_400_000)
      : null;

    const row = await this.deps.repo.insertReview({
      resumeId: input.resumeId,
      ownerId,
      reviewerId: input.reviewerUserId ?? null,
      reviewerEmail: input.reviewerEmail ?? null,
      shareToken: this.generateToken(),
      source: input.source,
      coachingInquiryId: input.coachingInquiryId ?? null,
      title: input.title ?? null,
      status: "pending",
      message: input.message ?? null,
      expiresAt,
    });
    return this.toReviewDTO(row, { includeToken: true });
  }

  async listOwnerReviews(ownerId: string): Promise<ResumeReviewDTO[]> {
    const rows = await this.deps.repo.listReviewsForOwner(ownerId);
    return this.hydrateCounts(rows, { includeToken: true });
  }

  async listReviewerReviews(reviewerId: string): Promise<ResumeReviewDTO[]> {
    const rows = await this.deps.repo.listReviewsForReviewer(reviewerId);
    return this.hydrateCounts(rows, { includeToken: false });
  }

  /** Full review detail for whoever is allowed to see it. Claims a self-share
   *  link on first authenticated visit and flips `pending → active`. */
  async getReviewDetail(
    reviewId: string,
    actor: string | null,
    token?: string,
  ): Promise<ReviewDetail> {
    const access = await this.resolveAccess({ reviewId }, actor, token);
    return this.buildDetail(access, actor);
  }

  async getReviewByToken(token: string, actor: string | null): Promise<ReviewDetail> {
    const review = await this.deps.repo.findReviewByToken(token);
    if (!review) throw new ResumeFeedbackServiceError("NOT_FOUND", "Review link not found");
    const access = await this.resolveAccess({ review }, actor, token);
    return this.buildDetail(access, actor);
  }

  async submitReview(
    reviewId: string,
    actor: string,
    input: SubmitReviewInput,
  ): Promise<ResumeReviewDTO> {
    const { review, role } = await this.resolveAccess({ reviewId }, actor);
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
    return this.toReviewDTO(updated!, { includeToken: false });
  }

  async completeReview(reviewId: string, ownerId: string): Promise<ResumeReviewDTO> {
    await this.assertOwner(reviewId, ownerId);
    const updated = await this.deps.repo.updateReview(reviewId, {
      status: "completed",
      completedAt: this.deps.now(),
    });
    return this.toReviewDTO(updated!, { includeToken: true });
  }

  async cancelReview(reviewId: string, ownerId: string): Promise<ResumeReviewDTO> {
    await this.assertOwner(reviewId, ownerId);
    const updated = await this.deps.repo.updateReview(reviewId, { status: "cancelled" });
    return this.toReviewDTO(updated!, { includeToken: true });
  }

  // ── Annotations ──────────────────────────────────────────────────────────────

  async listAnnotations(
    reviewId: string,
    actor: string | null,
    token?: string,
  ): Promise<ResumeReviewAnnotationDTO[]> {
    await this.resolveAccess({ reviewId }, actor, token);
    return getOrSetCached({
      key: annotationCacheKey(reviewId),
      ttlSeconds: ANNOTATION_CACHE_TTL,
      loader: async () => {
        const rows = await this.deps.repo.listAnnotations(reviewId);
        return rows.map((r) => this.toAnnotationDTO(r));
      },
    });
  }

  async createAnnotation(
    reviewId: string,
    actor: string,
    input: CreateAnnotationInput,
    token?: string,
  ): Promise<ResumeReviewAnnotationDTO> {
    const { review, role } = await this.resolveAccess({ reviewId }, actor, token);
    if (review.status === "completed" || review.status === "cancelled") {
      throw new ResumeFeedbackServiceError("INVALID_STATE", `Review is ${review.status}`);
    }
    // A reviewer's first annotation activates a pending review.
    if (role === "reviewer" && review.status === "pending") {
      await this.deps.repo.updateReview(reviewId, { status: "active" });
    }
    const pageId = input.anchor.type === "canvas" ? input.anchor.pageId : null;
    const row = await this.deps.repo.insertAnnotation({
      reviewId,
      authorId: actor,
      kind: input.kind,
      body: input.body,
      color: input.color ?? null,
      status: "open",
      pageId,
      anchor: input.anchor,
      suggestedEdit: input.suggestedEdit ?? null,
      parentAnnotationId: input.parentAnnotationId ?? null,
    });
    invalidateCachedKey(annotationCacheKey(reviewId));
    return this.toAnnotationDTO(row);
  }

  async updateAnnotation(
    annotationId: string,
    actor: string,
    patch: UpdateAnnotationInput,
  ): Promise<ResumeReviewAnnotationDTO> {
    const { annotation, review, role } = await this.loadAnnotation(annotationId, actor);
    // Body / colour edits: author only. Status transitions: either party,
    // EXCEPT `accepted` which goes through acceptAnnotation (it mutates content).
    if ((patch.body !== undefined || patch.color !== undefined) && annotation.authorId !== actor) {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Only the author can edit this note");
    }
    if (patch.status === "accepted") {
      throw new ResumeFeedbackServiceError(
        "VALIDATION_ERROR",
        "Use the accept endpoint to accept a suggestion",
      );
    }
    const resolved =
      patch.status === "resolved" || patch.status === "dismissed"
        ? { resolvedByUserId: actor, resolvedAt: this.deps.now() }
        : {};
    const updated = await this.deps.repo.updateAnnotation(annotationId, {
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...resolved,
    });
    invalidateCachedKey(annotationCacheKey(review.id));
    void role;
    return this.toAnnotationDTO(updated!);
  }

  /** Owner accepts a suggestion: applies its `suggestedEdit` (if any) to the
   *  resume content, then marks the annotation accepted. */
  async acceptAnnotation(
    annotationId: string,
    ownerId: string,
  ): Promise<{ annotation: ResumeReviewAnnotationDTO; appliedEdit: boolean }> {
    const { annotation, review, role } = await this.loadAnnotation(annotationId, ownerId);
    if (role !== "owner") {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Only the owner can accept a suggestion");
    }
    let appliedEdit = false;
    const edit = annotation.suggestedEdit as SuggestedEdit | null;
    if (edit) {
      const resume = await this.deps.repo.findResumeContentSlice(review.resumeId);
      if (!resume) throw new ResumeFeedbackServiceError("NOT_FOUND", "Resume not found");
      try {
        const next = applySuggestedEdit(resume.content, edit);
        await this.deps.repo.updateResumeContent(review.resumeId, next);
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
    return { annotation: this.toAnnotationDTO(updated!), appliedEdit };
  }

  async deleteAnnotation(annotationId: string, actor: string): Promise<void> {
    const { annotation, review, role } = await this.loadAnnotation(annotationId, actor);
    if (annotation.authorId !== actor && role !== "owner") {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Cannot delete this note");
    }
    await this.deps.repo.deleteAnnotation(annotationId);
    invalidateCachedKey(annotationCacheKey(review.id));
  }

  // ── Proposed draft revisions ────────────────────────────────────────────────

  async proposeDraft(
    reviewId: string,
    actor: string,
    input: ProposeDraftInput,
    token?: string,
  ): Promise<ProposedDraftDTO> {
    const { review, role } = await this.resolveAccess({ reviewId }, actor, token);
    if (role !== "reviewer") {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Only the reviewer can propose a draft");
    }
    if (review.status === "completed" || review.status === "cancelled") {
      throw new ResumeFeedbackServiceError("INVALID_STATE", `Review is ${review.status}`);
    }
    let resumeData;
    try {
      resumeData = validateProposedDraft(input.resumeData);
    } catch (e) {
      if (e instanceof ContentEditError) {
        throw new ResumeFeedbackServiceError("VALIDATION_ERROR", e.message);
      }
      throw e;
    }
    const versionNumber = await this.deps.repo.nextVersionNumber(review.resumeId);
    const row = await this.deps.repo.insertProposedVersion({
      resumeId: review.resumeId,
      userId: review.ownerId,
      versionNumber,
      label: input.label ?? "Coach proposal",
      resumeData: resumeData as any,
      isAutosave: false,
      proposedByUserId: actor,
      reviewId,
      proposalStatus: "proposed",
    });
    return this.toProposalDTO(row);
  }

  async listProposals(
    reviewId: string,
    actor: string | null,
    token?: string,
  ): Promise<ProposedDraftDTO[]> {
    await this.resolveAccess({ reviewId }, actor, token);
    const rows = await this.deps.repo.listProposalsForReview(reviewId);
    return rows.map((r) => this.toProposalDTO(r));
  }

  /** Owner accepts a proposed draft: snapshots current content (undoable),
   *  then applies the proposal to the resume. */
  async acceptProposal(versionId: string, ownerId: string): Promise<ProposedDraftDTO> {
    const { version, review } = await this.loadProposal(versionId, ownerId);
    const resume = await this.deps.repo.findResumeContentSlice(review.resumeId);
    if (!resume) throw new ResumeFeedbackServiceError("NOT_FOUND", "Resume not found");

    // Snapshot the pre-acceptance content so the owner can revert.
    const snapNumber = await this.deps.repo.nextVersionNumber(review.resumeId);
    await this.deps.repo.insertProposedVersion({
      resumeId: review.resumeId,
      userId: ownerId,
      versionNumber: snapNumber,
      label: "Before coach proposal",
      resumeData: resume.content as any,
      isAutosave: false,
    });

    await this.deps.repo.updateResumeContent(review.resumeId, version.resumeData);
    const updated = await this.deps.repo.setProposalStatus(versionId, "accepted");
    return this.toProposalDTO(updated!);
  }

  async rejectProposal(versionId: string, ownerId: string): Promise<ProposedDraftDTO> {
    await this.loadProposal(versionId, ownerId);
    const updated = await this.deps.repo.setProposalStatus(versionId, "rejected");
    return this.toProposalDTO(updated!);
  }

  // ── Access resolution ────────────────────────────────────────────────────────

  private async resolveAccess(
    locate: { reviewId: string } | { review: ResumeReviewRow },
    actor: string | null,
    token?: string,
  ): Promise<ReviewAccess> {
    let review =
      "review" in locate
        ? locate.review
        : await this.deps.repo.findReviewById(locate.reviewId);
    if (!review) throw new ResumeFeedbackServiceError("NOT_FOUND", "Review not found");

    if (review.expiresAt && review.expiresAt.getTime() < this.deps.now().getTime()) {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "This review link has expired");
    }

    if (actor && review.ownerId === actor) return { review, role: "owner" };
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

  private async assertOwner(reviewId: string, actor: string): Promise<ResumeReviewRow> {
    const review = await this.deps.repo.findReviewById(reviewId);
    if (!review) throw new ResumeFeedbackServiceError("NOT_FOUND", "Review not found");
    if (review.ownerId !== actor) {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Only the owner can do this");
    }
    return review;
  }

  private async loadAnnotation(
    annotationId: string,
    actor: string | null,
    token?: string,
  ): Promise<{ annotation: ResumeReviewAnnotationRow; review: ResumeReviewRow; role: ReviewRole }> {
    const annotation = await this.deps.repo.findAnnotationById(annotationId);
    if (!annotation) throw new ResumeFeedbackServiceError("NOT_FOUND", "Annotation not found");
    const { review, role } = await this.resolveAccess({ reviewId: annotation.reviewId }, actor, token);
    return { annotation, review, role };
  }

  private async loadProposal(
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

  private async buildDetail(access: ReviewAccess, actor: string | null): Promise<ReviewDetail> {
    let review = access.review;
    // A reviewer opening a pending review activates it.
    if (access.role === "reviewer" && review.status === "pending") {
      const updated = await this.deps.repo.updateReview(review.id, {
        status: "active",
      });
      if (updated) review = updated;
    }
    const resume = await this.deps.repo.findResumeContentSlice(review.resumeId);
    if (!resume) throw new ResumeFeedbackServiceError("NOT_FOUND", "Resume not found");
    const [annotations, proposals] = await Promise.all([
      this.deps.repo.listAnnotations(review.id),
      this.deps.repo.listProposalsForReview(review.id),
    ]);
    void actor;
    return {
      role: access.role,
      review: this.toReviewDTO(review, { includeToken: access.role === "owner" }),
      resume: { id: resume.id, title: resume.title, content: resume.content },
      annotations: annotations.map((a) => this.toAnnotationDTO(a)),
      proposals: proposals.map((p) => this.toProposalDTO(p)),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async hydrateCounts(
    rows: ResumeReviewRow[],
    opts: { includeToken: boolean },
  ): Promise<ResumeReviewDTO[]> {
    const counts = await this.deps.repo.annotationCountsForReviews(rows.map((r) => r.id));
    const byId = new Map(counts.map((c) => [c.reviewId, c]));
    return rows.map((r) => {
      const c = byId.get(r.id);
      return {
        ...this.toReviewDTO(r, opts),
        openAnnotationCount: c?.open ?? 0,
        totalAnnotationCount: c?.total ?? 0,
      };
    });
  }

  private generateToken(): string {
    const bytes = this.deps.randomBytes(32);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex;
  }

  private toReviewDTO(row: ResumeReviewRow, opts: { includeToken: boolean }): ResumeReviewDTO {
    return {
      id: row.id,
      resumeId: row.resumeId,
      ownerId: row.ownerId,
      reviewerId: row.reviewerId,
      reviewerEmail: row.reviewerEmail,
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

  private toAnnotationDTO(row: ResumeReviewAnnotationRow): ResumeReviewAnnotationDTO {
    return {
      id: row.id,
      reviewId: row.reviewId,
      authorId: row.authorId,
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

  private toProposalDTO(row: ResumeVersionRow): ProposedDraftDTO {
    return {
      versionId: row.id,
      reviewId: row.reviewId ?? null,
      proposedByUserId: row.proposedByUserId ?? row.userId,
      label: row.label,
      proposalStatus: (row.proposalStatus ?? "proposed") as ProposedDraftDTO["proposalStatus"],
      createdAt: row.createdAt.toISOString(),
    };
  }
}

// Re-export so consumers can validate against the source enum.
export { REVIEW_SOURCES };
