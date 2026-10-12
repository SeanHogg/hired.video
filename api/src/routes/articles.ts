/**
 * Articles — creator-authored long-form content (#196). Storage backs three
 * kinds: article / faq / guide. SA review is required before anything goes
 * public; submit-for-review runs the moderation scan inline.
 *
 * Routes:
 *   POST   /api/articles                       — create draft
 *   GET    /api/articles/me                    — list my articles (any status)
 *   GET    /api/articles/:id                   — get my article (owner-only)
 *   PATCH  /api/articles/:id                   — update my article (draft / rejected only)
 *   POST   /api/articles/:id/submit-for-review — submit; runs scan; status=submitted
 *   POST   /api/articles/:id/withdraw          — pull from review; status=draft
 *   POST   /api/articles/:id/unpublish         — back to draft
 *   DELETE /api/articles/:id                   — hard delete by owner
 *
 *   GET    /api/articles/public                — list published (paginated)
 *   GET    /api/articles/public/by-user/:uid   — published-by-user
 *   GET    /api/articles/public/:userId/:slug  — public read-by-slug
 *
 *   GET    /api/articles/public/id/:id     — a published article's public path (#2312)
 *
 * Engagement tracking + Partner Program payouts remain deferred (#171–#175).
 *
 * Split into focused sub-routers under routes/articles/ (#2312). This
 * barrel mounts them in the ORIGINAL registration order, so every static
 * path still wins over a `:param` path with the same prefix:
 *   public (incl. /public/id/:id before /public/:userId/:slug)
 *   → authoring (/me before /:id) → versions → engagement → partner program
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { articlePublicRoutes } from "./articles/public.js";
import { articleAuthoringRoutes } from "./articles/authoring.js";
import { articleVersionRoutes } from "./articles/versions.js";
import { articleEngagementRoutes } from "./articles/engagement.js";
import { articlePartnerProgramRoutes } from "./articles/partner-program.js";

export const articleRoutes = new Hono<AppEnv>();

articleRoutes.route("/", articlePublicRoutes);
articleRoutes.route("/", articleAuthoringRoutes);
articleRoutes.route("/", articleVersionRoutes);
articleRoutes.route("/", articleEngagementRoutes);
articleRoutes.route("/", articlePartnerProgramRoutes);
