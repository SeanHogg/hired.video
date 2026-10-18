/**
 * /api/feed reactions — professional reactions on posts and comments.
 * Idempotent per (target, user); a NEW reaction notifies the author.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  reactToComment,
  reactToPost,
  removeCommentReaction,
  removePostReaction,
} from "../../services/feed/feedEngagementService.js";
import { readBody, respond, waitUntilOf } from "./http.js";

export const feedReactionRoutes = new Hono<AppEnv>();

/** POST /api/feed/posts/:postId/react — add or change a reaction. */
feedReactionRoutes.post("/posts/:postId/react", async (c) => {
  const body = await readBody(c);
  return respond(c, reactToPost(c.var.userId, c.req.param("postId"), body, waitUntilOf(c)));
});

/** DELETE /api/feed/posts/:postId/react — remove the viewer's reaction. */
feedReactionRoutes.delete("/posts/:postId/react", (c) =>
  respond(c, removePostReaction(c.var.userId, c.req.param("postId"))),
);

/** POST /api/feed/comments/:commentId/react — add/change a comment reaction. */
feedReactionRoutes.post("/comments/:commentId/react", async (c) => {
  const body = await readBody(c);
  return respond(c, reactToComment(c.var.userId, c.req.param("commentId"), body, waitUntilOf(c)));
});

/** DELETE /api/feed/comments/:commentId/react — remove the viewer's reaction. */
feedReactionRoutes.delete("/comments/:commentId/react", (c) =>
  respond(c, removeCommentReaction(c.var.userId, c.req.param("commentId"))),
);
