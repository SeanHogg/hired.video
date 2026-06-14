/**
 * Context-aware help routes (mounted at /api/help) — v2, meta only.
 *
 * The API serves mapping + search META, never content. Help content lives
 * in bundled Markdown files on the client; the client joins the slugs these
 * endpoints return to its in-memory catalog.
 *
 * Public:
 *   GET /api/help/contexts            — active context keys (membership set)
 *   GET /api/help/resolve?context=KEY — ordered slug list for a context
 *   GET /api/help/search?q=           — semantic-search slug hits (Vectorize)
 * SuperAdmin (per-route gate, reads above stay public):
 *   GET    /api/help/mappings         — curation list
 *   POST   /api/help/mappings         — map a slug to a context (upsert)
 *   DELETE /api/help/mappings/:id     — remove a mapping
 *   POST   /api/help/reindex          — (re)build Vectorize from client items
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { HelpMappingService } from "../services/help/help-mapping-service.js";
import { isSemanticHelpAvailable } from "../services/help/help-embeddings.js";
import { AI_CONTEXT_TYPES } from "../../../shared/ai-context-types.js";
import type { HelpContextKey } from "../../../shared/help.js";

export const helpRoutes = new Hono<AppEnv>();

const ContextKeySchema = z.enum(AI_CONTEXT_TYPES as unknown as [string, ...string[]]);
const SlugSchema = z.string().min(1).max(128).regex(/^[a-z0-9-]+$/, "Invalid slug");

const SetMappingSchema = z.object({
  contextKey: ContextKeySchema,
  slug: SlugSchema,
  position: z.number().int().min(0).max(999).optional(),
});

const ReindexSchema = z.object({
  items: z
    .array(z.object({ slug: SlugSchema, text: z.string().min(1).max(8000) }))
    .max(1000),
});

function requireSuperAdmin(c: Context<AppEnv>) {
  const user = c.var.user;
  if (!user?.sub) return { err: error("UNAUTHORIZED", "Authentication required"), status: 401 as const };
  if (!isSuperAdmin(user)) return { err: error("FORBIDDEN", "SuperAdmin access required"), status: 403 as const };
  return { user };
}

// ── Public reads (meta only) ──────────────────────────────────────────

helpRoutes.get("/contexts", async (c) => {
  const svc = new HelpMappingService(getDb());
  return c.json(success({ contexts: await svc.listActiveContextKeys() }));
});

helpRoutes.get("/resolve", async (c) => {
  const parsed = ContextKeySchema.safeParse(c.req.query("context"));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Unknown or missing context key"), 400);
  }
  const svc = new HelpMappingService(getDb());
  const slugs = await svc.resolveForContext(parsed.data as HelpContextKey);
  return c.json(success({ context: parsed.data, slugs }));
});

helpRoutes.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const svc = new HelpMappingService(getDb());
  return c.json(success(await svc.searchSemantic(q)));
});

// ── SuperAdmin curation ───────────────────────────────────────────────

helpRoutes.get("/mappings", async (c) => {
  const gate = requireSuperAdmin(c);
  if ("err" in gate) return c.json(gate.err, gate.status);
  const svc = new HelpMappingService(getDb());
  return c.json(success({ mappings: await svc.listAll() }));
});

helpRoutes.post("/mappings", async (c) => {
  const gate = requireSuperAdmin(c);
  if ("err" in gate) return c.json(gate.err, gate.status);
  const parsed = SetMappingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const svc = new HelpMappingService(getDb());
  await svc.set({
    contextKey: parsed.data.contextKey as HelpContextKey,
    slug: parsed.data.slug,
    position: parsed.data.position,
    userId: gate.user.sub!,
  });
  return c.json(success({ contextKey: parsed.data.contextKey, slug: parsed.data.slug }), 201);
});

helpRoutes.delete("/mappings/:id", async (c) => {
  const gate = requireSuperAdmin(c);
  if ("err" in gate) return c.json(gate.err, gate.status);
  const svc = new HelpMappingService(getDb());
  const removed = await svc.remove(c.req.param("id"));
  return c.json(success({ id: c.req.param("id"), removed }));
});

helpRoutes.post("/reindex", async (c) => {
  const gate = requireSuperAdmin(c);
  if ("err" in gate) return c.json(gate.err, gate.status);
  const parsed = ReindexSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const svc = new HelpMappingService(getDb());
  const indexed = await svc.reindex(parsed.data.items);
  return c.json(success({ indexed, semantic: isSemanticHelpAvailable() }));
});
