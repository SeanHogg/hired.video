/**
 * /api/network — network-driven warm-intro suggestions (#1678). Given a
 * target company, surface the caller's 1st- and 2nd-degree connections
 * there, so they can ask for an introduction instead of cold-applying.
 * ~80% of exec roles fill through network.
 *
 *   GET /api/network/warm-intros?company=Acme
 *
 * 1st degree — your accepted connections who work at the company (reach
 *              out directly).
 * 2nd degree — people at the company connected to one of your connections
 *              (ask that connection — the "connector" — for an intro).
 *
 * Connections are bidirectional rows in user_connections (from/to,
 * status='accepted'). The graph is walked in-memory over the caller's
 * connection set, which is bounded per user.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { findWarmIntros } from "../services/user/warmIntros.js";

export const networkRoutes = new Hono<AppEnv>();

networkRoutes.get("/warm-intros", async (c) => {
  const userId = requireUser(c);
  const company = (c.req.query("company") ?? "").trim();
  if (!company) return c.json(error("VALIDATION_ERROR", "company is required"), 400);
  return c.json(success(await findWarmIntros(userId, company)), 200);
});
