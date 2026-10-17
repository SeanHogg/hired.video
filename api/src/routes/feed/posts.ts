/**
 * /api/feed posts — timeline listing, single-post read, create / update /
 * delete, reshare, and report. Thin HTTP adapters over feedPostsService.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { FEED_POST_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import { ipCountryFromCtx } from "../../services/analytics/artifactView.js";
import {
  createFeedPost,
  deleteFeedPost,
  getFeedPost,
  listFeedPosts,
  reportFeedPost,
  reshareFeedPost,
  updateFeedPost,
} from "../../services/feed/feedPostsService.js";
import { parsePagination } from "../../utils/pagination.js";
import { FEED_PAGE_OPTS } from "./pagination.js";
import { readBody, renderDomainError, respond, viewerOf, waitUntilOf } from "./http.js";

export const feedPostRoutes = new Hono<AppEnv>();

/** GET /api/feed/posts */
feedPostRoutes.get("/posts", async (c) => {
  const { page: pageNumber, limit: pageSize } = parsePagination(c, FEED_PAGE_OPTS);
  const tag = c.req.query("tag")?.toLowerCase() ?? "";
  const { dtos, total, offset } = await listFeedPosts(viewerOf(c), { tag, pageNumber, pageSize });

  // `?fields=` projection (gap #1370 / #1446). Feed-card view rarely needs
  // the full post body or media metadata blob.
  const fields = parseFields(c.req.query("fields"), FEED_POST_LIST_FIELDS);
  const posts = projectRows(dtos as Array<Record<string, unknown>>, fields);

  return c.json(
    success({
      posts,
      totalCount: total,
      pageNumber,
      pageSize,
      hasNextPage: offset + pageSize < total,
      hasPreviousPage: pageNumber > 1,
    }),
    200,
  );
});

/** GET /api/feed/posts/:postId — records an impression fire-and-forget. */
feedPostRoutes.get("/posts/:postId", (c) =>
  respond(
    c,
    getFeedPost(viewerOf(c), c.req.param("postId"), {
      ipCountry: ipCountryFromCtx(c),
      referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      waitUntil: waitUntilOf(c),
    }),
  ),
);

/** POST /api/feed/posts/:postId/reshare — repost (optionally with a quote). */
feedPostRoutes.post("/posts/:postId/reshare", async (c) => {
  const body = await readBody(c);
  return respond(c, reshareFeedPost(viewerOf(c), c.req.param("postId"), body, waitUntilOf(c)), 201);
});

/** POST /api/feed/posts */
feedPostRoutes.post("/posts", async (c) => {
  const userId = c.var.user.sub;
  const body = await readBody(c);
  return respond(
    c,
    createFeedPost(userId, body, {
      waitUntil: waitUntilOf(c),
      // Gamification award (fire-and-forget inside). Drives the `first_post`
      // badge + streak signal.
      afterCreate: async (postId) => {
        const { withGamification } = await import("../../domains/gamification/with-gamification.js");
        await withGamification(c, "feed-post-created", (game, role, uid) =>
          game.onFeedPostCreated({ userId: uid, role, postId }),
        );
      },
    }),
    201,
  );
});

/** PUT /api/feed/posts/:postId */
feedPostRoutes.put("/posts/:postId", async (c) => {
  const body = await readBody(c);
  return respond(c, updateFeedPost(c.var.user.sub, c.req.param("postId"), body));
});

/** DELETE /api/feed/posts/:postId */
feedPostRoutes.delete("/posts/:postId", (c) =>
  respond(c, deleteFeedPost(c.var.user.sub, c.req.param("postId"))),
);

/** POST /api/feed/posts/:postId/report — 201 on a new report, 200 if the
 *  viewer already reported this post. */
feedPostRoutes.post("/posts/:postId/report", async (c) => {
  const body = await readBody(c);
  try {
    const { created } = await reportFeedPost(c.var.user.sub, c.req.param("postId"), body);
    return c.json(success({ reported: true }), created ? 201 : 200);
  } catch (err) {
    return renderDomainError(c, err);
  }
});
