/**
 * Review-scoped routes  /api/reviews/:reviewId
 *
 *   PUT    /:reviewId   edit own (descriptor may require Pro)
 *   DELETE /:reviewId   delete own
 */

import { Hono } from "hono";
import { success, type AppEnv } from "../../types/index.js";
import { deleteReview, editReview } from "../../services/reviews/reviewWrites.js";
import { toReviewDto } from "../../services/reviews/reviewMappers.js";
import { handleReviews, readJsonBody } from "./http.js";

export const reviewItemRoutes = new Hono<AppEnv>();

reviewItemRoutes.put("/:reviewId", (c) =>
  handleReviews(c, async () => {
    const review = await editReview({
      user: c.var.user,
      reviewId: c.req.param("reviewId"),
      rawBody: await readJsonBody(c),
    });
    return c.json(success({ review: toReviewDto(review) }), 200);
  }),
);

reviewItemRoutes.delete("/:reviewId", (c) =>
  handleReviews(c, async () => {
    await deleteReview({ viewerId: c.var.userId, reviewId: c.req.param("reviewId") });
    return c.json(success({ deleted: true }), 200);
  }),
);
