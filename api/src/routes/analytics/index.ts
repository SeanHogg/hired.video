/**
 * /api/analytics — mounted from app.ts.
 *
 *   POST /events                  — the one ingestion beacon (events.ts)
 *   GET  /artifacts/:kind/:id     — artifact analytics reads (artifacts.ts)
 *   GET  /creator/me              — creator rollup (artifacts.ts)
 *   GET  /hiring?metric=          — hiring analytics (hiring.ts)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { analyticsEventsRoutes } from "./events.js";
import { analyticsArtifactRoutes } from "./artifacts.js";
import { analyticsHiringRoutes } from "./hiring.js";

export const analyticsRoutes = new Hono<AppEnv>();

analyticsRoutes.route("/", analyticsEventsRoutes);
analyticsRoutes.route("/", analyticsArtifactRoutes);
analyticsRoutes.route("/", analyticsHiringRoutes);
