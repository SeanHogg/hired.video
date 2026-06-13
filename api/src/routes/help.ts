/**
 * Context-aware help routes (mounted at /api/help).
 *
 * Public:
 *   GET /api/help/contexts            — active context keys (membership set,
 *                                        cached; lets the drawer skip resolve
 *                                        on pages with no mapping)
 *   GET /api/help/resolve?context=KEY — curated published article set for a
 *                                        page context
 *
 * SuperAdmin (per-route gate, since the reads above must stay public):
 *   GET    /api/help/mappings         — full curation list
 *   POST   /api/help/mappings         — map an article to a context (upsert)
 *   DELETE /api/help/mappings/:id     — remove a mapping
 *
 * Auth + the SA gate + parsing live here; all queries + caching live in
 * HelpMappingService (repo-per-aggregate convention).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { HelpMappingService } from "../services/help/help-mapping-service.js";
import { isSemanticHelpAvailable } from "../services/help/help-embeddings.js";
import { AI_CONTEXT_TYPES } from "../../../shared/ai-context-types.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { HelpContextKey } from "../../../shared/help.js";

export const helpRoutes = new Hono<AppEnv>();

const ContextKeySchema = z.enum(
  AI_CONTEXT_TYPES as unknown as [string, ...string[]],
);

const SetMappingSchema = z.object({
  contextKey: ContextKeySchema,
  articleId: UuidLikeSchema,
  position: z.number().int().min(0).max(999).optional(),
});

// ── Public reads ──────────────────────────────────────────────────────

helpRoutes.get("/contexts", async (c) => {
  const svc = new HelpMappingService(getDb());
  return c.json(success({ contexts: await svc.listActiveContextKeys() }));
});

helpRoutes.get("/faqs", async (c) => {
  const svc = new HelpMappingService(getDb());
  return c.json(success({ groups: await svc.listFaqs() }));
});

helpRoutes.get("/guides", async (c) => {
  const svc = new HelpMappingService(getDb());
  return c.json(success({ guides: await svc.listGuides() }));
});

helpRoutes.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const svc = new HelpMappingService(getDb());
  return c.json(success({ articles: await svc.searchHelp(q) }));
});

helpRoutes.get("/resolve", async (c) => {
  const parsed = ContextKeySchema.safeParse(c.req.query("context"));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Unknown or missing context key"), 400);
  }
  const svc = new HelpMappingService(getDb());
  return c.json(success(await svc.resolveForContext(parsed.data as HelpContextKey)));
});

// ── SuperAdmin curation ───────────────────────────────────────────────

helpRoutes.get("/mappings", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(user)) return c.json(error("FORBIDDEN", "SuperAdmin access required"), 403);
  const svc = new HelpMappingService(getDb());
  return c.json(success({ mappings: await svc.listAll() }));
});

helpRoutes.post("/mappings", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(user)) return c.json(error("FORBIDDEN", "SuperAdmin access required"), 403);

  const body = await c.req.json().catch(() => null);
  const parsed = SetMappingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const svc = new HelpMappingService(getDb());
  await svc.set({
    contextKey: parsed.data.contextKey as HelpContextKey,
    articleId: parsed.data.articleId,
    position: parsed.data.position,
    userId: user.sub,
  });
  return c.json(success({ contextKey: parsed.data.contextKey, articleId: parsed.data.articleId }), 201);
});

// SuperAdmin: (re)build semantic-search embeddings for all published help
// content. The activation step after provisioning the Vectorize index +
// AI bindings (#2004); also a manual refresh. No-ops cheaply when bindings
// are absent (returns indexed:0).
helpRoutes.post("/reindex", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(user)) return c.json(error("FORBIDDEN", "SuperAdmin access required"), 403);
  const svc = new HelpMappingService(getDb());
  const indexed = await svc.reindexEmbeddings();
  return c.json(success({ indexed, semantic: isSemanticHelpAvailable() }));
});

helpRoutes.delete("/mappings/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(user)) return c.json(error("FORBIDDEN", "SuperAdmin access required"), 403);
  const id = c.req.param("id");
  const svc = new HelpMappingService(getDb());
  const removed = await svc.remove(id);
  return c.json(success({ id, removed }));
});
