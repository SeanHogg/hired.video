/**
 * Subject-scoped review routes  /api/reviews/:subjectType/:subjectId/...
 *
 *   GET  /:subjectType/:subjectId            public list (paginated)
 *   GET  /:subjectType/:subjectId/aggregate  avg + distribution
 *   GET  /:subjectType/:subjectId/me         own review (auth)
 *   POST /:subjectType/:subjectId            create/upsert (descriptor gates Pro / eligibility)
 */

import { Hono } from "hono";
import { success, type AppEnv } from "../../types/index.js";
import { parsePagination } from "../../utils/pagination.js";
import { hashClientIp } from "../../utils/crypto.js";
import { getOwnReview, getSubjectAggregate, listSubjectReviews } from "../../services/reviews/reviewReads.js";
import { upsertReview } from "../../services/reviews/reviewWrites.js";
import { toReviewDto } from "../../services/reviews/reviewMappers.js";
import { handleReviews, readJsonBody, subjectTypeParam } from "./http.js";

export const reviewSubjectRoutes = new Hono<AppEnv>();

reviewSubjectRoutes.get("/:subjectType/:subjectId", (c) =>
  handleReviews(c, async () => {
    const subjectType = subjectTypeParam(c);
    const { page, limit } = parsePagination(c, { defaultLimit: 10, maxLimit: 50 });
    const data = await listSubjectReviews({ subjectType, subjectId: c.req.param("subjectId"), page, limit });
    return c.json(success(data), 200);
  }),
);

reviewSubjectRoutes.get("/:subjectType/:subjectId/aggregate", (c) =>
  handleReviews(c, async () => {
    const subjectType = subjectTypeParam(c);
    const data = await getSubjectAggregate(subjectType, c.req.param("subjectId"));
    return c.json(success(data), 200);
  }),
);

reviewSubjectRoutes.get("/:subjectType/:subjectId/me", (c) =>
  handleReviews(c, async () => {
    const subjectType = subjectTypeParam(c);
    const data = await getOwnReview({
      viewerId: c.var.userId,
      subjectType,
      subjectId: c.req.param("subjectId"),
    });
    return c.json(success(data), 200);
  }),
);

reviewSubjectRoutes.post("/:subjectType/:subjectId", (c) =>
  handleReviews(c, async () => {
    const subjectType = subjectTypeParam(c);
    const { review, isNew } = await upsertReview({
      user: c.var.user,
      subjectType,
      subjectId: c.req.param("subjectId"),
      rawBody: await readJsonBody(c),
      ipHash: hashClientIp(c),
    });

    // Award the reviewer for posting a company review (new reviews only;
    // edits re-run upsert but don't re-earn). Deduped on review id in the
    // helper too. Fire-and-forget — never fails the write.
    if (subjectType === "company" && isNew) {
      const { withGamification } = await import("../../domains/gamification/with-gamification.js");
      await withGamification(c, "company-review-posted", (game, role, uidEarner) =>
        game.onCompanyReviewPosted({ userId: uidEarner, role, reviewId: review.id }),
      );
    }

    return c.json(success({ review: toReviewDto(review) }), 200);
  }),
);
