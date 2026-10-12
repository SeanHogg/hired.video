/**
 * Annotations on a review — sticky notes, highlights and comments: list
 * (read-through edge cache), create, edit/resolve and delete. Accepting a
 * suggestion mutates the reviewed content, so it lives with the proposal path
 * (review-proposals.ts), not here.
 */
import type {
  CreateAnnotationInput,
  ResumeReviewAnnotationDTO,
  UpdateAnnotationInput,
} from "../../../../shared/resume-feedback.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import {
  ANNOTATION_CACHE_TTL,
  annotationCacheKey,
  authorNamesByAnnotation,
  nameForAuthor,
} from "./annotation-authors.js";
import type { ResumeFeedbackServiceDeps } from "./deps.js";
import type { ReviewAccessPolicy } from "./review-access.js";
import { toAnnotationDTO } from "./review-dto.js";
import { ResumeFeedbackServiceError } from "./review-errors.js";

export class ReviewAnnotations {
  constructor(
    private readonly deps: ResumeFeedbackServiceDeps,
    private readonly access: ReviewAccessPolicy,
  ) {}

  async listAnnotations(
    reviewId: string,
    actor: string | null,
    token?: string,
  ): Promise<ResumeReviewAnnotationDTO[]> {
    const { review } = await this.access.resolveAccess({ reviewId }, actor, token);
    return getOrSetCached({
      key: annotationCacheKey(reviewId),
      ttlSeconds: ANNOTATION_CACHE_TTL,
      loader: async () => {
        const rows = await this.deps.repo.listAnnotations(reviewId);
        const names = await authorNamesByAnnotation(this.deps.repo, review, rows);
        return rows.map((r) => toAnnotationDTO(r, names.get(r.id) ?? null));
      },
    });
  }

  async createAnnotation(
    reviewId: string,
    actor: string | null,
    input: CreateAnnotationInput,
    token?: string,
  ): Promise<ResumeReviewAnnotationDTO> {
    const { review, role } = await this.access.resolveAccess({ reviewId }, actor, token);
    if (review.status === "completed" || review.status === "cancelled") {
      throw new ResumeFeedbackServiceError("INVALID_STATE", `Review is ${review.status}`);
    }
    // A reviewer's first annotation activates a pending review.
    if (role === "reviewer" && review.status === "pending") {
      await this.deps.repo.updateReview(reviewId, { status: "active" });
    }
    const pageId = input.anchor.type === "canvas" ? input.anchor.pageId : null;
    const row = await this.deps.repo.insertAnnotation({
      // Null for an external guest acting via a share token (no account).
      authorId: actor ?? null,
      reviewId,
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
    return toAnnotationDTO(row, await nameForAuthor(this.deps.repo, row.authorId, review));
  }

  async updateAnnotation(
    annotationId: string,
    actor: string,
    patch: UpdateAnnotationInput,
  ): Promise<ResumeReviewAnnotationDTO> {
    const { annotation, review } = await this.access.loadAnnotation(annotationId, actor);
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
    return toAnnotationDTO(updated!, await nameForAuthor(this.deps.repo, updated!.authorId, review));
  }

  async deleteAnnotation(annotationId: string, actor: string): Promise<void> {
    const { annotation, review, role } = await this.access.loadAnnotation(annotationId, actor);
    if (annotation.authorId !== actor && role !== "owner") {
      throw new ResumeFeedbackServiceError("FORBIDDEN", "Cannot delete this note");
    }
    await this.deps.repo.deleteAnnotation(annotationId);
    invalidateCachedKey(annotationCacheKey(review.id));
  }
}
