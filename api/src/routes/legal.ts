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
import { eq, and, desc, sql } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { LegalRepository } from "../repositories/legalRepository.js";

const { legalDocuments, legalDocumentAcceptances, users } = schema;

export const legalRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

async function isSuperAdmin(db: ReturnType<typeof getDb>, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isSuperAdmin: users.isSuperAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return !!row?.isSuperAdmin;
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

// GET /current/:kind?locale=en
legalRoutes.get("/current/:kind", async (c) => {
  const kind = c.req.param("kind");
  const locale = c.req.query("locale") ?? "en";
  const db = getDb();
  const [row] = await db
    .select()
    .from(legalDocuments)
    .where(and(
      eq(legalDocuments.kind, kind),
      eq(legalDocuments.locale, locale),
      eq(legalDocuments.isCurrent, true),
    ))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", `No current document for kind=${kind} locale=${locale}`), 404);
  return c.json(success(row), 200);
});

// GET /list?locale=en — current version of every kind
legalRoutes.get("/list", async (c) => {
  const locale = c.req.query("locale") ?? "en";
  const db = getDb();
  const rows = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.locale, locale), eq(legalDocuments.isCurrent, true)))
    .orderBy(legalDocuments.kind);
  return c.json(success(rows), 200);
});

// ---------------------------------------------------------------------------
// User acceptance
// ---------------------------------------------------------------------------

// POST /accept — body: { documentId, context? }
legalRoutes.post("/accept", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({})) as { documentId?: string; context?: string };
  if (!body.documentId) return c.json(error("VALIDATION_ERROR", "documentId is required"), 400);

  const db = getDb();
  const [doc] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.id, body.documentId))
    .limit(1);
  if (!doc) return c.json(error("NOT_FOUND", "Document not found"), 404);
  if (!doc.isCurrent) {
    return c.json(error("STALE_DOCUMENT", "Cannot accept a non-current document version"), 400);
  }

  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null;
  const ua = c.req.header("User-Agent") ?? null;

  const [row] = await db
    .insert(legalDocumentAcceptances)
    .values({
      userId,
      documentId: doc.id,
      kind: doc.kind,
      version: doc.version,
      locale: doc.locale,
      ip,
      userAgent: ua,
      context: body.context ?? null,
    } as any)
    .returning();
  return c.json(success(row), 201);
});

// GET /me — full acceptance history
legalRoutes.get("/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(legalDocumentAcceptances)
    .where(eq(legalDocumentAcceptances.userId, userId))
    .orderBy(desc(legalDocumentAcceptances.acceptedAt));
  return c.json(success(rows), 200);
});

// GET /me/status — { creator_terms: {hasAcceptedCurrent, ...}, general_terms: {...}, ... }
legalRoutes.get("/me/status", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const locale = c.req.query("locale") ?? "en";
  const db = getDb();

  const legal = new LegalRepository(db);
  const currents = await legal.findCurrentDocs(locale);
  // One DISTINCT ON (kind) read for every current kind (was one per doc).
  const latestByKind = await legal.findLatestAcceptancesByKind(
    userId,
    Array.from(new Set(currents.map((d) => d.kind))),
  );

  const result: Record<string, { documentId: string; version: string; hasAcceptedCurrent: boolean; acceptedAt: string | null }> = {};
  for (const doc of currents) {
    const latest = latestByKind.get(doc.kind);
    result[doc.kind] = {
      documentId: doc.id,
      version: doc.version,
      hasAcceptedCurrent: !!latest && latest.version === doc.version,
      acceptedAt: latest?.acceptedAt ? new Date(latest.acceptedAt).toISOString() : null,
    };
  }
  return c.json(success(result), 200);
});

// ---------------------------------------------------------------------------
// Superadmin CRUD
// ---------------------------------------------------------------------------

async function requireSuperAdmin(c: any): Promise<string | Response> {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const ok = await isSuperAdmin(db, userId);
  if (!ok) return c.json(error("FORBIDDEN", "Superadmin only"), 403);
  return userId;
}

// GET /admin/documents — list all (every version of every kind)
legalRoutes.get("/admin/documents", async (c) => {
  const auth = await requireSuperAdmin(c);
  if (typeof auth !== "string") return auth;
  const db = getDb();
  const rows = await db
    .select()
    .from(legalDocuments)
    .orderBy(legalDocuments.kind, desc(legalDocuments.publishedAt), desc(legalDocuments.createdAt));
  return c.json(success(rows), 200);
});

// POST /admin/documents — create draft
legalRoutes.post("/admin/documents", async (c) => {
  const auth = await requireSuperAdmin(c);
  if (typeof auth !== "string") return auth;
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
  const db = getDb();
  const [row] = await db
    .insert(legalDocuments)
    .values({
      kind: body.kind,
      version: body.version,
      title: body.title,
      summary: body.summary ?? null,
      body: body.body,
      locale: body.locale ?? "en",
      isCurrent: false,
    } as any)
    .returning();
  return c.json(success(row), 201);
});

// PATCH /admin/documents/:id — edit a draft (cannot edit a published doc)
legalRoutes.patch("/admin/documents/:id", async (c) => {
  const auth = await requireSuperAdmin(c);
  if (typeof auth !== "string") return auth;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Document not found"), 404);
  if (existing.publishedAt) {
    return c.json(error("ALREADY_PUBLISHED", "Published documents are immutable. Create a new version."), 400);
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["title", "summary", "body", "version"] as const) {
    if (k in body) patch[k] = (body as any)[k];
  }
  const [updated] = await db
    .update(legalDocuments)
    .set(patch as any)
    .where(eq(legalDocuments.id, c.req.param("id")))
    .returning();
  return c.json(success(updated), 200);
});

// POST /admin/documents/:id/publish — publish + un-current the previous current doc
legalRoutes.post("/admin/documents/:id/publish", async (c) => {
  const auth = await requireSuperAdmin(c);
  if (typeof auth !== "string") return auth;
  const db = getDb();
  const [doc] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.id, c.req.param("id")))
    .limit(1);
  if (!doc) return c.json(error("NOT_FOUND", "Document not found"), 404);

  // Un-current any prior current doc of the same (kind, locale) BEFORE flipping
  // this one — partial unique index requires no overlap.
  await db
    .update(legalDocuments)
    .set({ isCurrent: false, updatedAt: new Date() } as any)
    .where(and(
      eq(legalDocuments.kind, doc.kind),
      eq(legalDocuments.locale, doc.locale),
      eq(legalDocuments.isCurrent, true),
    ));

  const [updated] = await db
    .update(legalDocuments)
    .set({
      isCurrent: true,
      publishedAt: doc.publishedAt ?? new Date(),
      publishedBy: auth,
      updatedAt: new Date(),
    } as any)
    .where(eq(legalDocuments.id, doc.id))
    .returning();

  return c.json(success(updated), 200);
});

// DELETE /admin/documents/:id — drafts only
legalRoutes.delete("/admin/documents/:id", async (c) => {
  const auth = await requireSuperAdmin(c);
  if (typeof auth !== "string") return auth;
  const db = getDb();
  const [doc] = await db
    .select({ id: legalDocuments.id, publishedAt: legalDocuments.publishedAt })
    .from(legalDocuments)
    .where(eq(legalDocuments.id, c.req.param("id")))
    .limit(1);
  if (!doc) return c.json(error("NOT_FOUND", "Document not found"), 404);
  if (doc.publishedAt) {
    return c.json(error("ALREADY_PUBLISHED", "Cannot delete a published document"), 400);
  }
  await db.delete(legalDocuments).where(eq(legalDocuments.id, doc.id));
  return c.json(success({ deleted: true }), 200);
});

legalRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Legal route not found" } }, 404),
);
