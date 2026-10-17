/**
 * Creator portfolio:
 *   GET    /portfolio                 — own items
 *   GET    /portfolio/public/:userId  — public gallery for any user (no auth)
 *   POST   /portfolio                 — create item
 *   PUT    /portfolio/:id             — update item
 *   DELETE /portfolio/:id             — delete item
 *   POST   /portfolio/:id/feature     — set as featured (clears the other)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import {
  getOwnPortfolio,
  getPublicPortfolio,
  createPortfolioItem,
  updateOwnPortfolioItem,
  deleteOwnPortfolioItem,
  featureOwnPortfolioItem,
  type CreatePortfolioItemInput,
} from "../../services/creators/portfolio.js";
import { sendResult } from "./shared.js";

export const creatorPortfolioRoutes = new Hono<AppEnv>();

creatorPortfolioRoutes.get("/portfolio", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await getOwnPortfolio(auth.userId)), 200);
});

creatorPortfolioRoutes.get("/portfolio/public/:userId", async (c) =>
  c.json(success(await getPublicPortfolio(c.req.param("userId"))), 200),
);

creatorPortfolioRoutes.post("/portfolio", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({})) as CreatePortfolioItemInput;
  return sendResult(c, await createPortfolioItem(auth.userId, body));
});

creatorPortfolioRoutes.put("/portfolio/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  return sendResult(c, await updateOwnPortfolioItem(auth.userId, c.req.param("id"), body));
});

creatorPortfolioRoutes.delete("/portfolio/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return sendResult(c, await deleteOwnPortfolioItem(auth.userId, c.req.param("id")));
});

creatorPortfolioRoutes.post("/portfolio/:id/feature", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return sendResult(c, await featureOwnPortfolioItem(auth.userId, c.req.param("id")));
});
