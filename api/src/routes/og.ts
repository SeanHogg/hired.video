/**
 * OG / social-preview worker routes (mounted at /api/og).
 *
 *   GET /page | /blog | /articles | /courses | /lesson-diagram — query-param SVG cards
 *   GET /companies/:id | /v/:videoId | /m/:videoId | /r/:id | /voice/:slug | /creator/:userId
 *       — entity social cards (SVG, or 302 to a baked thumbnail)
 *   GET /v|m/:videoId/meta | /voice/:slug/meta | /creator/:userId/meta | /r/:id/meta
 *       | /article/:userRef/:slug/meta | /person/:userRef/meta | /job/:id/meta
 *       | /company/:idOrSlug/meta | /course/:userRef/:slug/meta | /event/:idOrSlug/meta
 *       — crawler meta JSON (+ schema.org JSON-LD)
 *
 * Thin barrel: entity kinds are DATA in services/og/og-entity-registry.ts,
 * registered by the generic handlers in routes/og/. All paths are disjoint,
 * so mount order is not significant.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { ogQueryCardRoutes } from "./og/query-cards.js";
import { ogEntityImageRoutes } from "./og/entity-images.js";
import { ogEntityMetaRoutes } from "./og/entity-meta.js";

export const ogRoutes = new Hono<AppEnv>();

ogRoutes.route("/", ogQueryCardRoutes);
ogRoutes.route("/", ogEntityImageRoutes);
ogRoutes.route("/", ogEntityMetaRoutes);
