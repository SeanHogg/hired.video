/**
 * Review payload validation + wire mappers.
 *
 *   validateReviewPayload  descriptor-driven validation + key whitelisting
 *   toReviewDto / toReviewCommentDto  row → API shape
 *   buildReviewEmbedPayload  the small card the feed renderer reads
 */

import { z } from "zod";
import type { SubjectDescriptor } from "../../../../shared/reviews/subject-descriptors.js";
import type { ReviewContent, ReviewRow } from "../../repositories/reviewsRepository.js";
import type { ReviewCommentRow } from "../../repositories/reviewCommentsRepository.js";
import { DomainError } from "../../domains/errors.js";

const ReviewPayloadSchema = z.object({
  overallRating: z.number().int().min(1).max(5),
  title: z.string().trim().min(5).max(200),
  body: z.string().trim().max(4000).nullish(),
  subRatings: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
  metadata: z.record(z.string(), z.union([z.string().max(4000), z.null()])).optional(),
});

/** Validate a payload against a subject descriptor and return the
 *  normalized content. Throws a 400 DomainError on invalid input. */
export function validateReviewPayload(raw: unknown, descriptor: SubjectDescriptor): ReviewContent {
  const parsed = ReviewPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError(400, "BAD_REQUEST", "Invalid review payload", parsed.error.flatten());
  }
  const data = parsed.data;

  // Whitelist sub-rating keys against the descriptor — extra axes are
  // dropped silently rather than 400'd, so a stale frontend doesn't
  // hard-fail when the registry adds a new optional axis.
  const allowedAxes = new Set(descriptor.subRatings.map((a) => a.key));
  const cleanSubRatings: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.subRatings ?? {})) {
    if (allowedAxes.has(k)) cleanSubRatings[k] = v;
  }

  // Same whitelisting for metadata. Body sections (pros/cons/advice)
  // are also valid metadata keys.
  const allowedMeta = new Set<string>(descriptor.metadataFields.map((f) => f.key));
  for (const section of descriptor.bodySections) {
    if (section.key !== "body") allowedMeta.add(section.key);
  }
  const cleanMeta: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(data.metadata ?? {})) {
    if (allowedMeta.has(k)) cleanMeta[k] = v ?? null;
  }

  return {
    overallRating: data.overallRating,
    title: data.title,
    body: data.body ?? null,
    subRatings: cleanSubRatings,
    metadata: cleanMeta,
  };
}

export function toReviewDto(row: ReviewRow) {
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    userId: row.userId,
    overallRating: row.overallRating,
    title: row.title,
    body: row.body,
    subRatings: row.subRatings as Record<string, number>,
    metadata: row.metadata as Record<string, string | null>,
    isVerified: row.isVerified,
    verificationMethod: row.verificationMethod,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type ReviewDto = ReturnType<typeof toReviewDto>;

export function toReviewCommentDto(row: ReviewCommentRow) {
  return {
    id: row.id,
    reviewId: row.reviewId,
    userId: row.userId,
    parentId: row.parentId,
    body: row.body,
    isSubjectOwner: row.isSubjectOwner,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type ReviewCommentDto = ReturnType<typeof toReviewCommentDto>;

/** Build the embed payload that the feed renderer reads. Kept small —
 *  enough for a card preview. The full review is fetched on expand. */
export function buildReviewEmbedPayload(
  review: ReviewRow,
  descriptor: SubjectDescriptor,
): Record<string, unknown> {
  const excerptSource = review.body || (review.metadata as Record<string, string | null>)?.pros || "";
  return {
    kind: "review",
    subjectType: review.subjectType,
    subjectId: review.subjectId,
    subjectPath: descriptor.subjectPath(review.subjectId),
    subjectNoun: descriptor.noun,
    overallRating: review.overallRating,
    title: review.title,
    excerpt: excerptSource.length > 240 ? excerptSource.slice(0, 237) + "…" : excerptSource,
    isVerified: review.isVerified,
    verificationMethod: review.verificationMethod,
  };
}
