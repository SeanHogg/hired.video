/**
 * Creators / Promo Video Marketplace (gap #101), mounted at /api/creators.
 *
 * Split into focused sub-routers under routes/creators/. This barrel mounts
 * them in the ORIGINAL registration order, then the catch-all 404:
 *   enrollment  — POST /opt-in, POST|DELETE /me/programs/:program, POST /me/cancel
 *   me          — GET|PATCH /me, GET /me/earnings-rollup,
 *                 GET|PATCH /me/payout-profile, POST /me/payout-profile/tax-form-envelope
 *   discovery   — GET /browse, GET /public/:userId
 *   portfolio   — GET|POST /portfolio, GET /portfolio/public/:userId,
 *                 PUT|DELETE /portfolio/:id, POST /portfolio/:id/feature
 *   projects    — POST|GET /projects, GET /projects/:id, POST /projects/:id/{revisions,
 *                 revisions/:revId/decision, buy-extra-revision, accept, dispute, review}
 *
 * Persistence lives in repositories/creator{Profiles,Portfolio,Projects}Repository.ts
 * + payoutProfilesRepository.ts; orchestration in services/creators/*.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { creatorEnrollmentRoutes } from "./creators/enrollment.js";
import { creatorMeRoutes } from "./creators/me.js";
import { creatorDiscoveryRoutes } from "./creators/discovery.js";
import { creatorPortfolioRoutes } from "./creators/portfolio.js";
import { creatorProjectRoutes } from "./creators/projects.js";

export const creatorRoutes = new Hono<AppEnv>();

creatorRoutes.route("/", creatorEnrollmentRoutes);
creatorRoutes.route("/", creatorMeRoutes);
creatorRoutes.route("/", creatorDiscoveryRoutes);
creatorRoutes.route("/", creatorPortfolioRoutes);
creatorRoutes.route("/", creatorProjectRoutes);
