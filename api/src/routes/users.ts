/**
 * `/api/users` composition root (mounted in app.ts as `userRoutes`).
 *
 * Sub-routers, mounted in precedence order (static paths before `/:id`):
 *   1. users/me.ts          — GET /public (People directory), GET|PUT /me,
 *                             GET /me/recommendations, POST /me/avatar,
 *                             PATCH /slug, GET /check-slug/:slug, DELETE /account
 *   2. users/connections.ts — POST /connections, GET /me/connections[/cards|
 *                             /search|/pending], PUT /connections/:id/accept,
 *                             DELETE /connections/:id, GET /connections/status,
 *                             POST /connections/statuses
 *   3. users/profile.ts     — GET /:id/connections, /:id/can-message,
 *                             /:id/stats, /:id/resumes, /:id (public, by id or slug)
 *
 * Use cases: services/user/{myProfile,connections,publicProfile,
 * accountSelfService,userDtos}.ts. Data: repositories/{usersProfile,
 * userCards,userConnections}Repository.ts. The role (no admin self-assign)
 * and email (verified-flow only) guards live in services/user/myProfile.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { meRoutes } from "./users/me.js";
import { connectionRoutes } from "./users/connections.js";
import { profileRoutes } from "./users/profile.js";

export const userRoutes = new Hono<AppEnv>();

userRoutes.route("/", meRoutes);
userRoutes.route("/", connectionRoutes);
userRoutes.route("/", profileRoutes);
