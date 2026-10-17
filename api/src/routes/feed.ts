/**
 * /api/feed — social feed composition root.
 *
 * Sub-routers (routes/feed/):
 *   • posts.ts      — GET/POST /posts, GET/PUT/DELETE /posts/:postId,
 *                     POST /posts/:postId/reshare, POST /posts/:postId/report
 *   • comments.ts   — GET /posts/:postId/comments, POST /comments,
 *                     PUT/DELETE /comments/:commentId
 *   • reactions.ts  — POST/DELETE /posts/:postId/react,
 *                     POST/DELETE /comments/:commentId/react
 *   • discovery.ts  — GET /search, /trending-tags, /trending-posts,
 *                     POST /link-preview
 *
 * Use cases: services/feed/{feedPostsService,feedEngagementService,
 * feedTrendingService,feedDtos,feedNotifications,feedPostPolicy}.ts.
 * Data access: repositories/{feedPostsRepository,feedEngagementRepository}.ts.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { cacheMiddleware } from "../utils/cache-headers.js";
import { etagMiddleware } from "../utils/etag.js";
import { feedPostRoutes } from "./feed/posts.js";
import { feedCommentRoutes } from "./feed/comments.js";
import { feedReactionRoutes } from "./feed/reactions.js";
import { feedDiscoveryRoutes } from "./feed/discovery.js";

export const feedRoutes = new Hono<AppEnv>();

// Feed reads are visibility-filtered per-user (privacy + recruiter role +
// connection graph), so cache is `private` — never CDN-cached. 30s is
// short enough that a new post lands in the timeline on the next refresh
// without being noticeable, and saves a query every page transition.
// ETag turns the "first poll after the window" into a 304 when nothing
// actually changed.
feedRoutes.use("/*", cacheMiddleware({ scope: "private", maxAge: 30 }));
feedRoutes.use("/*", etagMiddleware());

feedRoutes.route("/", feedPostRoutes);
feedRoutes.route("/", feedCommentRoutes);
feedRoutes.route("/", feedReactionRoutes);
feedRoutes.route("/", feedDiscoveryRoutes);
