/**
 * Promo projects:
 *   POST /projects                                  — create project from inquiry (buyer)
 *   GET  /projects                                  — list (?role=creator|customer)
 *   GET  /projects/:id                              — single project + revisions + comments
 *   POST /projects/:id/revisions                    — creator submits a revision
 *   POST /projects/:id/revisions/:revId/decision    — customer approves / requests changes
 *   POST /projects/:id/buy-extra-revision           — customer purchases an extra revision
 *   POST /projects/:id/accept                       — accept delivery, release escrow
 *   POST /projects/:id/dispute                      — open dispute
 *   POST /projects/:id/review                       — 410: moved to /api/reviews/promo_project/:id
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import {
  createPromoProject,
  listPromoProjects,
  getPromoProject,
  type CreateProjectInput,
} from "../../services/creators/projects.js";
import {
  submitRevision,
  decideRevision,
  buyExtraRevision,
  acceptDelivery,
  disputeProject,
  type SubmitRevisionInput,
} from "../../services/creators/project-delivery.js";
import { sendResult } from "./shared.js";

export const creatorProjectRoutes = new Hono<AppEnv>();

creatorProjectRoutes.post("/projects", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({})) as CreateProjectInput;
  return sendResult(c, await createPromoProject(auth.userId, body));
});

creatorProjectRoutes.get("/projects", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await listPromoProjects(auth.userId, c.req.query("role"))), 200);
});

creatorProjectRoutes.get("/projects/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return sendResult(c, await getPromoProject(auth.userId, c.req.param("id")));
});

creatorProjectRoutes.post("/projects/:id/revisions", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({})) as SubmitRevisionInput;
  return sendResult(c, await submitRevision(auth.userId, c.req.param("id"), body));
});

creatorProjectRoutes.post("/projects/:id/revisions/:revId/decision", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({})) as { decision?: string; feedback?: string };
  return sendResult(c, await decideRevision(auth.userId, c.req.param("id"), c.req.param("revId"), body));
});

creatorProjectRoutes.post("/projects/:id/buy-extra-revision", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return sendResult(c, await buyExtraRevision(auth.userId, c.req.param("id")));
});

creatorProjectRoutes.post("/projects/:id/accept", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({})) as { portfolioConsent?: boolean };
  return sendResult(c, await acceptDelivery(auth.userId, c.req.param("id"), body.portfolioConsent));
});

creatorProjectRoutes.post("/projects/:id/dispute", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({})) as { reason?: string };
  return sendResult(c, await disputeProject(auth.userId, c.req.param("id"), body.reason));
});

// Reviews on promo projects moved to the polymorphic system —
// POST /api/reviews/promo_project/:id (see api/src/routes/reviews.ts).
// The 410 keeps any stale clients from silently no-op'ing.
creatorProjectRoutes.post("/projects/:id/review", (c) =>
  c.json(
    error(
      "GONE",
      "This endpoint has moved. POST /api/reviews/promo_project/:id with { overallRating, title, body, subRatings: { communication, quality, timeliness } } instead.",
    ),
    410,
  ),
);
