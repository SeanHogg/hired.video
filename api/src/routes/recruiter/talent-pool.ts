/**
 * /api/recruiter talent pool, interactions and bulk pool edits.
 * Static segments (/talent-pool/export, /talent-pool/check/:id) are
 * registered before /talent-pool/:id so they win the match.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";
import {
  addTalentPoolEntry,
  bulkEditStatus,
  bulkEditTags,
  bulkRemove,
  exportTalentPoolCsv,
  getTalentPoolEntry,
  isInTalentPool,
  listInteractions,
  listTalentPool,
  recordInteraction,
  removeTalentPoolEntry,
  rowToTalentPoolEntry,
  updateTalentPoolEntry,
} from "../../services/recruiter/talent-pool.js";
import { handle, responseEnvelope } from "./http.js";

export const talentPoolRoutes = new Hono<AppEnv>();

const entryNotFound = { error: { code: "NOT_FOUND", message: "Entry not found" } };

// POST /talent-pool — add a candidate to the calling recruiter's talent pool
talentPoolRoutes.post("/talent-pool", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  return handle(c, "bare", async () => {
    const entry = await addTalentPoolEntry(user.sub, body);
    // #1118 — sourcing a candidate credits the recruiter. RefId = candidate
    // id so re-adding the same candidate doesn't re-pay.
    if (entry?.candidateId) {
      await withGamification(c, "candidate-sourced", (game, role, uidEarner) =>
        game.onCandidateSourced({ userId: uidEarner, role, candidateId: entry.candidateId }),
      );
    }
    return c.json(success(rowToTalentPoolEntry(entry)), 201);
  });
});

// GET /talent-pool — list, with `?fields=` projection (gap #1370 / #1446)
talentPoolRoutes.get("/talent-pool", async (c) => {
  const items = await listTalentPool(c.get("user").sub, c.req.query("fields"));
  return c.json(success(items));
});

// GET /talent-pool/export — download pool as CSV (must be before /:id)
talentPoolRoutes.get("/talent-pool/export", async (c) => {
  const { csv, filename } = await exportTalentPoolCsv(c.get("user").sub);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// GET /talent-pool/check/:candidateUserId — is candidate in pool (static before /:id)
talentPoolRoutes.get("/talent-pool/check/:candidateUserId", async (c) => {
  return c.json(success(await isInTalentPool(c.get("user").sub, c.req.param("candidateUserId"))));
});

// GET /talent-pool/:id — get single entry
talentPoolRoutes.get("/talent-pool/:id", async (c) => {
  const entry = await getTalentPoolEntry(c.get("user").sub, c.req.param("id"));
  if (!entry) return c.json(entryNotFound, 404);
  return c.json(success(entry));
});

// PUT /talent-pool/:id — update entry
talentPoolRoutes.put("/talent-pool/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const updated = await updateTalentPoolEntry(user.sub, id, body);
  if (!updated) return c.json(entryNotFound, 404);
  return c.json(success(updated));
});

// DELETE /talent-pool/:id — remove from pool
talentPoolRoutes.delete("/talent-pool/:id", async (c) => {
  await removeTalentPoolEntry(c.get("user").sub, c.req.param("id"));
  return c.json(success({ success: true }));
});

// ─── Interactions ─────────────────────────────────────────────────────────────

// POST /interactions — record an interaction
talentPoolRoutes.post("/interactions", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  return c.json(success(await recordInteraction(user.sub, body)), 201);
});

// GET /interactions/:talentPoolId — interactions for a talent pool entry
talentPoolRoutes.get("/interactions/:talentPoolId", async (c) => {
  return c.json(success(await listInteractions(c.get("user").sub, c.req.param("talentPoolId"))));
});

// ─── Bulk Operations ──────────────────────────────────────────────────────────

// POST /bulk/tags — Body: { ids: string[], addTags?: string[], removeTags?: string[] }
talentPoolRoutes.post("/bulk/tags", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "bare", async () => c.json(responseEnvelope(await bulkEditTags(user.sub, body)), 200));
});

// POST /bulk/status — Body: { ids: string[], status: string }
talentPoolRoutes.post("/bulk/status", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "bare", async () => c.json(responseEnvelope(await bulkEditStatus(user.sub, body)), 200));
});

// DELETE /bulk/delete — Body: { ids: string[] }
talentPoolRoutes.delete("/bulk/delete", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "bare", async () => c.json(responseEnvelope(await bulkRemove(user.sub, body)), 200));
});
