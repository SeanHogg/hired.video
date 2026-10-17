/**
 * Audience batch-tagging (manual backfill, #1629) — mounted at
 * /api/admin/content-audiences by the admin composite (SA guard there).
 *
 * POST /batch accepts (kind, entityIds[], audienceKeys[]) and applies the
 * audiences as an ADDITIVE set on every entity — existing tags are never
 * removed, so editors enrich content without wiping prior tags.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { ok } from "../../utils/response.js";
import { CONTENT_AUDIENCE_KINDS, type ContentAudienceKind } from "../../../../shared/content-audiences.js";
import { AudienceKeySchema } from "../../../../shared/audiences.js";
import { adminAudienceService } from "../../services/admin/adminAudiences.js";

const BatchAudienceBodySchema = z.object({
  entityKind: z.enum(CONTENT_AUDIENCE_KINDS as readonly string[] as [ContentAudienceKind, ...ContentAudienceKind[]]),
  entityIds: z.array(z.string().uuid()).min(1).max(500),
  audienceKeys: z.array(AudienceKeySchema).min(1).max(20),
});

export const adminContentAudienceRoutes = new Hono<AppEnv>();

adminContentAudienceRoutes.post("/batch", async (c) => {
  const parsed = BatchAudienceBodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const { entityKind, entityIds, audienceKeys } = parsed.data;
  // One batched read of existing tags + one bulk ON CONFLICT DO NOTHING insert.
  const existingByEntity = await adminAudienceService().addAudiencesToEntities(entityKind, entityIds, audienceKeys);
  const results = entityIds.map((id) => {
    const existing = existingByEntity.get(id) ?? [];
    const existingKeys = new Set(existing);
    const added = audienceKeys.filter((k) => !existingKeys.has(k));
    return { entityId: id, tagsApplied: audienceKeys.length, totalTags: existing.length + added.length };
  });
  return c.json(ok({ entityKind, results }), 200);
});

/** Current audience tag set for one entity so the picker pre-fills. */
adminContentAudienceRoutes.get("/:kind/:entityId", async (c) => {
  const kindParam = c.req.param("kind");
  const entityId = c.req.param("entityId");
  if (!CONTENT_AUDIENCE_KINDS.includes(kindParam as ContentAudienceKind)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Unknown kind" } }, 400);
  }
  const rows = await adminAudienceService().resolveForEntity(kindParam as ContentAudienceKind, entityId);
  return c.json(ok({ entityId, kind: kindParam, audiences: rows }), 200);
});
