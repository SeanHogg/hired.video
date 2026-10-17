/**
 * `/api/users/:id…` — public profile reads by id-or-slug (optional auth;
 * app.ts USER_PROFILE_ROUTE treats `/:id` and `/:id/resumes` as public).
 * Mounted LAST so every static path (`/me`, `/public`, `/me/connections`, …)
 * is matched first.
 *   GET /:id/connections · /:id/can-message · /:id/stats · /:id/resumes · /:id
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { listAcceptedConnections } from "../../services/user/connections.js";
import { getPublicProfile, listUserResumes } from "../../services/user/publicProfile.js";
import { respond } from "./http.js";

export const profileRoutes = new Hono<AppEnv>();

/** GET /api/users/:id/connections */
profileRoutes.get("/:id/connections", (c) => respond(c, listAcceptedConnections(c.req.param("id"))));

/** GET /api/users/:id/can-message */
profileRoutes.get("/:id/can-message", (c) => c.json(success({ canMessage: true }), 200));

/** GET /api/users/:id/stats */
profileRoutes.get("/:id/stats", (c) =>
  c.json(success({ resumeCount: 0, connectionCount: 0, jobApplicationCount: 0 }), 200),
);

/** GET /api/users/:id/resumes — the user's résumés (public ones unless the caller owns them) */
profileRoutes.get("/:id/resumes", (c) => respond(c, listUserResumes(c.req.param("id"), c.var.user?.sub)));

/** GET /api/users/:id — profile by id or custom slug; visibility-conditional */
profileRoutes.get("/:id", (c) => respond(c, getPublicProfile(c.req.param("id"), c.var.user)));
