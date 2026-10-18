/**
 * /api/feed comments — a post's comment thread and comment create / update /
 * delete (author-only edits). Thin adapters over feedEngagementService.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  createComment,
  listPostComments,
  removeComment,
  updateComment,
} from "../../services/feed/feedEngagementService.js";
import { clampLimit } from "../../utils/pagination.js";
import { readBody, respond } from "./http.js";

export const feedCommentRoutes = new Hono<AppEnv>();

/** GET /api/feed/posts/:postId/comments */
feedCommentRoutes.get("/posts/:postId/comments", (c) =>
  respond(
    c,
    listPostComments(c.var.userId ?? "", c.req.param("postId"), clampLimit(c.req.query("limit"), 200, 500)),
  ),
);

/** POST /api/feed/comments */
feedCommentRoutes.post("/comments", async (c) => {
  const body = await readBody(c);
  return respond(c, createComment(c.var.userId, body), 201);
});

/** PUT /api/feed/comments/:commentId */
feedCommentRoutes.put("/comments/:commentId", async (c) => {
  const body = await readBody(c);
  return respond(c, updateComment(c.var.userId, c.req.param("commentId"), body));
});

/** DELETE /api/feed/comments/:commentId */
feedCommentRoutes.delete("/comments/:commentId", (c) =>
  respond(c, removeComment(c.var.userId, c.req.param("commentId"))),
);
