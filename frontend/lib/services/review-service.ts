/**
 * Polymorphic Reviews Service
 *
 * One service covers every reviewable subject (company, promo_project,
 * service, voice_clone). Form/sub-rating shape per type lives in
 * shared/reviews/subject-descriptors.ts. Reads are public; writes
 * may require Pro (descriptor decides).
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { SubjectType } from "@shared/reviews/subject-descriptors";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RatingSchema = z.number().int().min(1).max(5);

export const ReviewSchema = z.object({
  id: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  userId: z.string(),
  overallRating: RatingSchema,
  title: z.string(),
  body: z.string().nullish(),
  // Sub-axis ratings keyed by the descriptor's axis keys.
  subRatings: z.record(z.string(), RatingSchema).default({}),
  // Free-form per-type metadata (employmentStatus, jobTitle, pros, cons, …).
  metadata: z.record(z.string(), z.union([z.string(), z.null()])).default({}),
  isVerified: z.boolean().default(false),
  verificationMethod: z.string().nullish(),
  status: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export const ReviewListSchema = z.object({
  items: z.array(ReviewSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

// Aggregate: overall + axis-keyed averages (open-ended record because
// the axis set is per-subject-type), plus 1..5 distribution.
export const ReviewAggregateSchema = z.object({
  total: z.number(),
  averages: z
    .object({ overall: z.number().nullable() })
    .catchall(z.number().nullable()),
  distribution: z.object({
    1: z.number(),
    2: z.number(),
    3: z.number(),
    4: z.number(),
    5: z.number(),
  }),
});

export const ReviewCommentSchema = z.object({
  id: z.string(),
  reviewId: z.string(),
  userId: z.string(),
  parentId: z.string().nullish(),
  body: z.string(),
  isSubjectOwner: z.boolean(),
  status: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type Review = z.infer<typeof ReviewSchema>;
export type ReviewList = z.infer<typeof ReviewListSchema>;
export type ReviewAggregate = z.infer<typeof ReviewAggregateSchema>;
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

// Input for create/edit. Shape is descriptor-driven on the server, but
// callers pass the union of all possible fields here — server drops
// any not declared by the descriptor.
export interface ReviewInput {
  overallRating: number;
  title: string;
  body?: string | null;
  subRatings?: Record<string, number>;
  metadata?: Record<string, string | null>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReviewService {
  async list(subjectType: SubjectType, subjectId: string, page = 1, limit = 10): Promise<ReviewList> {
    const res = await apiClient.get<ReviewList>(
      `/api/reviews/${subjectType}/${subjectId}?page=${page}&limit=${limit}`,
      ReviewListSchema,
    );
    return res.data;
  }

  async aggregate(subjectType: SubjectType, subjectId: string): Promise<ReviewAggregate> {
    const res = await apiClient.get<ReviewAggregate>(
      `/api/reviews/${subjectType}/${subjectId}/aggregate`,
      ReviewAggregateSchema,
    );
    return res.data;
  }

  async mine(subjectType: SubjectType, subjectId: string): Promise<Review | null> {
    const responseSchema = z.object({ review: ReviewSchema.nullable() });
    const res = await apiClient.get<z.infer<typeof responseSchema>>(
      `/api/reviews/${subjectType}/${subjectId}/me`,
      responseSchema,
    );
    return res.data.review ?? null;
  }

  async upsert(subjectType: SubjectType, subjectId: string, input: ReviewInput): Promise<Review> {
    const responseSchema = z.object({ review: ReviewSchema });
    const res = await apiClient.post<z.infer<typeof responseSchema>>(
      `/api/reviews/${subjectType}/${subjectId}`,
      input,
      responseSchema,
    );
    return res.data.review;
  }

  async update(reviewId: string, input: ReviewInput): Promise<Review> {
    const responseSchema = z.object({ review: ReviewSchema });
    const res = await apiClient.put<z.infer<typeof responseSchema>>(
      `/api/reviews/${reviewId}`,
      input,
      responseSchema,
    );
    return res.data.review;
  }

  async delete(reviewId: string): Promise<void> {
    await apiClient.delete(`/api/reviews/${reviewId}`);
  }

  // -------------- Comments --------------

  async listComments(reviewId: string): Promise<ReviewComment[]> {
    const responseSchema = z.object({ items: z.array(ReviewCommentSchema) });
    const res = await apiClient.get<z.infer<typeof responseSchema>>(
      `/api/reviews/${reviewId}/comments`,
      responseSchema,
    );
    return res.data.items;
  }

  async addComment(reviewId: string, body: string, parentId?: string | null): Promise<ReviewComment> {
    const responseSchema = z.object({ comment: ReviewCommentSchema });
    const res = await apiClient.post<z.infer<typeof responseSchema>>(
      `/api/reviews/${reviewId}/comments`,
      { body, parentId: parentId ?? null },
      responseSchema,
    );
    return res.data.comment;
  }

  async deleteComment(commentId: string): Promise<void> {
    await apiClient.delete(`/api/reviews/comments/${commentId}`);
  }
}

export const reviewService = new ReviewService();
