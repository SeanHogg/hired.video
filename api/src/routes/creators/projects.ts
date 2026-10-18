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
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
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
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as CreateProjectInput;
  return sendResult(c, await createPromoProject(userId, body));
});

creatorProjectRoutes.get("/projects", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listPromoProjects(userId, c.req.query("role"))), 200);
});

creatorProjectRoutes.get("/projects/:id", async (c) => {
  const userId = requireUser(c);
  return sendResult(c, await getPromoProject(userId, c.req.param("id")));
});

creatorProjectRoutes.post("/projects/:id/revisions", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as SubmitRevisionInput;
  return sendResult(c, await submitRevision(userId, c.req.param("id"), body));
});

creatorProjectRoutes.post("/projects/:id/revisions/:revId/decision", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as { decision?: string; feedback?: string };
  return sendResult(c, await decideRevision(userId, c.req.param("id"), c.req.param("revId"), body));
});

creatorProjectRoutes.post("/projects/:id/buy-extra-revision", async (c) => {
  const userId = requireUser(c);
  return sendResult(c, await buyExtraRevision(userId, c.req.param("id")));
});

creatorProjectRoutes.post("/projects/:id/accept", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as { portfolioConsent?: boolean };
  return sendResult(c, await acceptDelivery(userId, c.req.param("id"), body.portfolioConsent));
});

creatorProjectRoutes.post("/projects/:id/dispute", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as { reason?: string };
  return sendResult(c, await disputeProject(userId, c.req.param("id"), body.reason));
});

