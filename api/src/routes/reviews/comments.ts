/**
 * Threaded comments under a review.
 *
 *   GET    /:reviewId/comments        threaded list (public)
 *   POST   /:reviewId/comments        add comment (auth, parentId optional)
 *   DELETE /comments/:commentId       delete own comment
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { DomainError } from "../../domains/errors.js";
import { success, type AppEnv } from "../../types/index.js";
import {
  addReviewComment,
  deleteReviewComment,
  listReviewComments,
} from "../../services/reviews/reviewComments.js";
import { handleReviews, readJsonBody } from "./http.js";

const CommentBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentId: UuidLikeSchema.nullish(),
});

export const reviewCommentRoutes = new Hono<AppEnv>();

reviewCommentRoutes.get("/:reviewId/comments", (c) =>
  handleReviews(c, async () => {
    const data = await listReviewComments(c.req.param("reviewId"));
    return c.json(success(data), 200);
  }),
);

reviewCommentRoutes.post("/:reviewId/comments", (c) =>
  handleReviews(c, async () => {
    const raw = await readJsonBody(c);
    const data = await addReviewComment({
      viewerId: c.var.userId,
      reviewId: c.req.param("reviewId"),
      parseBody: () => {
        const parsed = CommentBodySchema.safeParse(raw);
        if (!parsed.success) {
          throw new DomainError(400, "BAD_REQUEST", "Invalid comment", parsed.error.flatten());
        }
        return parsed.data;
      },
    });
    return c.json(success(data), 201);
  }),
);

reviewCommentRoutes.delete("/comments/:commentId", (c) =>
  handleReviews(c, async () => {
    await deleteReviewComment({ viewerId: c.var.userId, commentId: c.req.param("commentId") });
    return c.json(success({ deleted: true }), 200);
  }),
);
