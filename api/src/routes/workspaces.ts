// workspaces.ts — Studio-side workspace listing + delegation grants.
//
// Endpoints:
//   GET    /api/workspaces              - list all workspaces the user can act in
//                                         (personal + company memberships + delegated)
//   GET    /api/workspaces/grants       - grants where caller is the subject
//                                         (ie "people I've invited to edit my videos")
//   GET    /api/workspaces/granted-to-me - grants where caller is the contributor
//                                         (ie "people who've invited me")
//   POST   /api/workspaces/grants       - invite a contributor (subject = caller)
//   DELETE /api/workspaces/grants/:id   - revoke a grant
//
// All write paths use the same authorization rule as Studio mutations
// (services/studio/workspace.ts) — by definition only the subject (or an
// admin grantedBy) can manage their own delegations.

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  createGrant,
  listGrantsGivenBy,
  listGrantsReceivedBy,
  listWorkspacesFor,
  revokeGrant,
} from "../services/studio/workspace-grants.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const workspaceRoutes = new Hono<AppEnv>();

// ─── List all workspaces I can act in ───────────────────────────────────────

workspaceRoutes.get("/workspaces", async (c) => {
  const me = requireUser(c);
  return c.json(success(await listWorkspacesFor(me)));
});

// ─── Grants I have given (I am the subject) ────────────────────────────────

workspaceRoutes.get("/workspaces/grants", async (c) => {
  const me = requireUser(c);
  return c.json(success(await listGrantsGivenBy(me)));
});

// ─── Grants given to me (I am the contributor) ─────────────────────────────

workspaceRoutes.get("/workspaces/granted-to-me", async (c) => {
  const me = requireUser(c);
  return c.json(success(await listGrantsReceivedBy(me)));
});

// ─── Invite a contributor (subject = caller) ───────────────────────────────

const createGrantBody = z.object({
  contributorEmail: z.string().email(),
  role: z.enum(["editor", "reviewer"]).default("editor"),
  scope: z.enum(["studio", "all"]).default("studio"),
  expiresAt: z.string().datetime().optional(),
});

workspaceRoutes.post("/workspaces/grants", validateJson(createGrantBody, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten())), async (c) => {
  const me = requireUser(c);
  return c.json(success(await createGrant(me, c.req.valid("json"))));
});

// ─── Revoke a grant (only the subject may) ─────────────────────────────────

workspaceRoutes.delete("/workspaces/grants/:id", async (c) => {
  const me = requireUser(c);
  return c.json(success(await revokeGrant(me, c.req.param("id"))));
});

export default workspaceRoutes;
