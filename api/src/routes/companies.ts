/**
 * /api/companies — composition root. Sub-routers (routes/companies/):
 *   • directory.ts — GET /public, /trending, /me/followed, /slug/:slug,
 *                    /:id/jobs, /:id/stats, /me, /by-user/:userId
 *   • follow.ts    — POST|DELETE /:id/follow, GET /:id/following-status
 *   • children.ts  — /:id/locations[/:locationId], /:id/team[/:memberId] CRUD
 *   • branding.ts  — GET|PATCH /:id/branding
 *   • profile.ts   — POST /, POST /extract, GET|PUT|DELETE /:id, POST /:id/clone
 *
 * Mount order matters: directory (static GETs like /public, /me) must
 * register before profile's GET /:id; the catch-all 404 goes last.
 * Use cases live in services/company/*, queries in
 * repositories/companyDirectoryRepository.ts + companiesRepository.ts.
 *
 * Reviews used to live here as /api/companies/:id/reviews — now served
 * polymorphically at /api/reviews/company/:id (routes/reviews.ts).
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { companyDirectoryRoutes } from "./companies/directory.js";
import { companyFollowRoutes } from "./companies/follow.js";
import { companyChildrenRoutes } from "./companies/children.js";
import { companyBrandingRoutes } from "./companies/branding.js";
import { companyProfileRoutes } from "./companies/profile.js";

// Re-exported for routes/__tests__/company-features.test.ts.
export { rowToCompanyProfile, type CompanyProfileExtras } from "../services/company/companyDto.js";

export const companyRoutes = new Hono<AppEnv>();

companyRoutes.route("/", companyDirectoryRoutes);
companyRoutes.route("/", companyFollowRoutes);
companyRoutes.route("/", companyChildrenRoutes);
companyRoutes.route("/", companyBrandingRoutes);
companyRoutes.route("/", companyProfileRoutes);
