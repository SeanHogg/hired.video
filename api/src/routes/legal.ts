/**
 * Legal Documents API — versioned terms / policies + per-user acceptance.
 *
 * Public:
 *   GET    /api/legal/current/:kind          — current published version of a doc
 *   GET    /api/legal/list                   — current version of every kind
 *
 * Authenticated:
 *   POST   /api/legal/accept                 — record acceptance of a doc id
 *   GET    /api/legal/me                     — own acceptance history
 *   GET    /api/legal/me/status              — { kind: { hasAcceptedCurrent, version, acceptedAt } }
 *
 * Superadmin only:
 *   GET    /api/legal/admin/documents        — list all versions of all kinds
 *   POST   /api/legal/admin/documents        — create a new draft document
 *   PATCH  /api/legal/admin/documents/:id    — update draft (cannot edit published)
 *   POST   /api/legal/admin/documents/:id/publish — publish (un-currents prior)
 *   DELETE /api/legal/admin/documents/:id    — delete (drafts only)
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  acceptLegalDoc,
  createLegalDocDraft,
  deleteLegalDocDraft,
  getCurrentLegalDoc,
  getMyLegalStatus,
  listAllLegalDocs,
  listCurrentLegalDocs,
  listMyLegalAcceptances,
  publishLegalDoc,
  updateLegalDocDraft,
} from "../services/legal/legalDocuments.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const legalRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

// GET /current/:kind?locale=en
legalRoutes.get("/current/:kind", async (c) => {
  const locale = c.req.query("locale") ?? "en";
  return c.json(success(await getCurrentLegalDoc(c.req.param("kind"), locale)), 200);
});

// GET /list?locale=en — current version of every kind
legalRoutes.get("/list", async (c) => {
  const locale = c.req.query("locale") ?? "en";
  return c.json(success(await listCurrentLegalDocs(locale)), 200);
});

// ---------------------------------------------------------------------------
// User acceptance
// ---------------------------------------------------------------------------

// POST /accept — body: { documentId, context? }
legalRoutes.post("/accept", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as { documentId?: string; context?: string };
  if (!body.documentId) return c.json(error("VALIDATION_ERROR", "documentId is required"), 400);
  const row = await acceptLegalDoc({
    userId,
    documentId: body.documentId,
    context: body.context ?? null,
    ip: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null,
    userAgent: c.req.header("User-Agent") ?? null,
  });
  return c.json(success(row), 201);
});

// GET /me — full acceptance history
legalRoutes.get("/me", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listMyLegalAcceptances(userId)), 200);
});

// GET /me/status — { creator_terms: {hasAcceptedCurrent, ...}, general_terms: {...}, ... }
legalRoutes.get("/me/status", async (c) => {
  const userId = requireUser(c);
  const locale = c.req.query("locale") ?? "en";
  return c.json(success(await getMyLegalStatus(userId, locale)), 200);
});

// ---------------------------------------------------------------------------
// Superadmin CRUD
// ---------------------------------------------------------------------------

legalRoutes.use("/admin/*", superAdminMiddleware);

// GET /admin/documents — list all (every version of every kind)
legalRoutes.get("/admin/documents", async (c) => {
  return c.json(success(await listAllLegalDocs()), 200);
});

// POST /admin/documents — create draft
legalRoutes.post("/admin/documents", async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    kind?: string;
    version?: string;
    title?: string;
    summary?: string;
    body?: string;
    locale?: string;
  };
  if (!body.kind || !body.version || !body.title || !body.body) {
    return c.json(error("VALIDATION_ERROR", "kind, version, title, body are required"), 400);
  }
  const row = await createLegalDocDraft({
    kind: body.kind,
    version: body.version,
    title: body.title,
    summary: body.summary ?? null,
    body: body.body,
    locale: body.locale ?? "en",
  });
  return c.json(success(row), 201);
});

// PATCH /admin/documents/:id — edit a draft (cannot edit a published doc)
legalRoutes.patch("/admin/documents/:id", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  return c.json(success(await updateLegalDocDraft(c.req.param("id"), body)), 200);
});

// POST /admin/documents/:id/publish — publish + un-current the previous current doc
legalRoutes.post("/admin/documents/:id/publish", async (c) => {
  return c.json(success(await publishLegalDoc(c.req.param("id"), c.var.userId)), 200);
});

// DELETE /admin/documents/:id — drafts only
legalRoutes.delete("/admin/documents/:id", async (c) => {
  await deleteLegalDocDraft(c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});
