import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { parsePublicSearchParams } from "../services/search/publicSearchParams.js";
import { paginatePublicSearch, runPublicSearch } from "../services/search/PublicSearchService.js";
import {
  RecruiterSearchSchema,
  SavedSearchSchema,
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  runRecruiterSearch,
} from "../services/search/RecruiterSearchService.js";

export const searchRoutes = new Hono<AppEnv>();

type Env = Record<string, string | undefined>;

// Unified search endpoint used by frontend.
// Supports category filtering (jobs/people/companies/resumes/…) and a default "all".
// The full merged+sorted list is cached (utils/search-cache.ts); pagination
// slices it per request so one cache entry serves every page of a query.
searchRoutes.get("/public", async (c) => {
  const params = parsePublicSearchParams((name) => c.req.query(name));
  const items = await runPublicSearch(params, (c.env ?? {}) as Env);
  return c.json(success(paginatePublicSearch(items, params.page, params.limit)), 200);
});

// ─── Boolean / Advanced Recruiter Search ─────────────────────────────────────
// POST /api/search/recruiter
// Supports: Boolean operators (AND / OR / NOT), quoted phrases, skill filters,
// experience level, location, and saved-search CRUD.
searchRoutes.post("/recruiter", async (c) => {
  const userId = c.var.user?.sub;
  const body = await c.req.json().catch(() => ({}));
  const parsed = RecruiterSearchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR" } }, 400);

  const result = await runRecruiterSearch(parsed.data, userId, (c.env ?? {}) as Env);
  return c.json(success(result), 200);
});

// ─── Saved Searches ──────────────────────────────────────────────────────────
// GET  /api/search/saved       — list user's saved searches
// POST /api/search/saved       — save a search
// DELETE /api/search/saved/:id — delete

searchRoutes.get("/saved", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const rows = await listSavedSearches(userId);
  return c.json(success(rows), 200);
});

searchRoutes.post("/saved", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = SavedSearchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR" } }, 400);

  // Closes gap-register #766: enforce Free-tier 3-saved-search cap that was
  // previously marketing-only on the Pricing page.
  const blocked = await servicesProcessor.enforce(c, "saved_search");
  if (blocked) return blocked;

  const row = await createSavedSearch(userId, parsed.data);

  servicesProcessor.meterEvent(c, "saved_search", { id: row?.id });

  // Gamification award. Saved-search creation is the strongest "active
  // job-hunting" signal we have today; the deeper "saved search delivered
  // new jobs" event requires a dedicated runner (see gap register).
  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  await withGamification(c, "saved-search-create", (game, role, uid) =>
    game.onSavedSearchRun({ userId: uid, role, runId: row?.id ?? crypto.randomUUID() }),
  );

  return c.json(success(row), 201);
});

searchRoutes.delete("/saved/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  await deleteSavedSearch(c.req.param("id"), userId);
  return c.json(success(true), 200);
});

// Fallback for other search routes (not implemented)
searchRoutes.all("*", (c) =>
  c.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Search routes coming soon" } },
    501,
  ),
);
