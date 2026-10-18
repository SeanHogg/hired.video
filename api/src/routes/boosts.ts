/**
 * Polymorphic Boosts API — boost CRUD (non-checkout) lives ONLY here.
 *
 * Creating + paying for a boost is a checkout: POST /api/checkout
 * {kind:"boost", subjectType, subjectId, …} (routes/checkout.ts → the boost
 * kind, which enforces subject ownership). The boost starts
 * 'pending_payment' and turns 'active' once Campaign $ cover it or the USD
 * payment is confirmed via POST /api/checkout/boost:<boostId>/confirm.
 *
 *   GET    /api/boosts/me                             list caller's boosts
 *   GET    /api/boosts/:subjectType/:subjectId        list active boosts on a subject (public)
 *   POST   /api/boosts/:boostId/cancel                cancel own boost
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { cancelBoost, listActiveBoostsForSubject, listMyBoosts } from "../services/advertising/boosts.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const boostRoutes = new Hono<AppEnv>();

boostRoutes.get("/me", async (c) => {
  const uid = requireUser(c);
  return c.json(success({ items: await listMyBoosts(uid) }), 200);
});

boostRoutes.get("/:subjectType/:subjectId", async (c) => {
  const items = await listActiveBoostsForSubject(c.req.param("subjectType"), c.req.param("subjectId"));
  return c.json(success({ items }), 200);
});

boostRoutes.post("/:boostId/cancel", async (c) => {
  const uid = requireUser(c);
  await cancelBoost(uid, c.req.param("boostId"));
  return c.json(success({ cancelled: true }), 200);
});
