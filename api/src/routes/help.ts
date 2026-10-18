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

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { helpMappingService } from "../services/help/help-mapping-service.js";
import { isSemanticHelpAvailable } from "../services/help/help-embeddings.js";
import { AI_CONTEXT_TYPES } from "../../../shared/ai-context-types.js";
import type { HelpContextKey } from "../../../shared/help.js";
import { validateJson } from "./helpers/validate.js";

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

// ── Public reads (meta only) ──────────────────────────────────────────

helpRoutes.get("/contexts", async (c) => {
  const svc = helpMappingService();
  return c.json(success({ contexts: await svc.listActiveContextKeys() }));
});

helpRoutes.get("/resolve", async (c) => {
  const parsed = ContextKeySchema.safeParse(c.req.query("context"));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Unknown or missing context key"), 400);
  }
  const svc = helpMappingService();
  const slugs = await svc.resolveForContext(parsed.data as HelpContextKey);
  return c.json(success({ context: parsed.data, slugs }));
});

helpRoutes.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const svc = helpMappingService();
  return c.json(success(await svc.searchSemantic(q)));
});

// ── SuperAdmin curation ───────────────────────────────────────────────

helpRoutes.get("/mappings", superAdminMiddleware, async (c) => {
  const svc = helpMappingService();
  return c.json(success({ mappings: await svc.listAll() }));
});

helpRoutes.post("/mappings", superAdminMiddleware, validateJson(SetMappingSchema, undefined, { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const svc = helpMappingService();
  await svc.set({
    contextKey: body.contextKey as HelpContextKey,
    slug: body.slug,
    position: body.position,
    userId: c.var.userId,
  });
  return c.json(success({ contextKey: body.contextKey, slug: body.slug }), 201);
});

helpRoutes.delete("/mappings/:id", superAdminMiddleware, async (c) => {
  const svc = helpMappingService();
  const removed = await svc.remove(c.req.param("id"));
  return c.json(success({ id: c.req.param("id"), removed }));
});

helpRoutes.post("/reindex", superAdminMiddleware, validateJson(ReindexSchema, undefined, { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const svc = helpMappingService();
  const indexed = await svc.reindex(body.items);
  return c.json(success({ indexed, semantic: isSemanticHelpAvailable() }));
});
