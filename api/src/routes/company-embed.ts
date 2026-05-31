/**
 * /api/companies/:companyId/embed/* — employer-controlled embedding.
 *
 * Owner-gated (requireCompanyOwner). Lets a company turn embedding on/off,
 * mint + revoke company-scoped embed keys (full key shown once), and read the
 * copyable snippet for each view. The snippet carries an env-var placeholder,
 * never the real key.
 *
 * The actual embed rendering runtime (the loader.js + iframe/JWT handoff) is
 * the embed-back rail (gap #1819); this surface is the enablement + key + copy
 * UX, which is fully functional today.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requireCompanyOwner } from "../services/company/companyOwnership.js";
import {
  listEmbedKeys,
  createEmbedKey,
  revokeEmbedKey,
  buildEmbedSnippet,
} from "../services/company/embed.js";
import { EMBED_VIEWS, EMBED_VIEW_KEYS } from "../../../shared/embed.js";
import { eq } from "drizzle-orm";

export const companyEmbedRoutes = new Hono<AppEnv>();

const CreateKeySchema = z.object({
  label: z.string().min(1).max(255),
  scopes: z.array(z.string().max(64)).max(20).default([]),
  allowedOrigins: z.array(z.string().url().max(255)).max(20).default([]),
});

/** GET — the full embed settings payload for the company settings UI. */
companyEmbedRoutes.get("/", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("companyId"));
  if (denied) return denied;
  const companyId = access!.companyId;

  const db = getDb();
  const [company] = await db
    .select({ slug: schema.companyProfiles.slug, embedEnabled: schema.companyProfiles.embedEnabled })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, companyId))
    .limit(1);

  const slugOrId = company?.slug || companyId;
  const keys = await listEmbedKeys(companyId);

  return c.json(
    success({
      enabled: company?.embedEnabled ?? false,
      keys,
      views: EMBED_VIEWS.map((v) => ({
        ...v,
        snippet: buildEmbedSnippet(slugOrId, v.key),
      })),
    }),
  );
});

/** PATCH — toggle embedding on/off. */
companyEmbedRoutes.patch("/", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("companyId"));
  if (denied) return denied;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ enabled: z.boolean() }).safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  await db
    .update(schema.companyProfiles)
    .set({ embedEnabled: parsed.data.enabled, updatedAt: new Date() })
    .where(eq(schema.companyProfiles.id, access!.companyId));
  return c.json(success({ enabled: parsed.data.enabled }));
});

/** POST keys — mint a key; full plaintext returned ONCE. */
companyEmbedRoutes.post("/keys", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("companyId"));
  if (denied) return denied;
  const userId = c.var.user!.sub;
  const parsed = CreateKeySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  // Default scope = all views if none specified.
  const scopes = parsed.data.scopes.length ? parsed.data.scopes : EMBED_VIEWS.map((v) => v.scope);
  const { key, view } = await createEmbedKey({
    companyId: access!.companyId,
    label: parsed.data.label,
    scopes,
    allowedOrigins: parsed.data.allowedOrigins,
    createdBy: userId,
  });
  // The full key is returned exactly once.
  return c.json(success({ key, keyInfo: view }), 201);
});

/** DELETE keys/:keyId — revoke (soft). */
companyEmbedRoutes.delete("/keys/:keyId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("companyId"));
  if (denied) return denied;
  const ok = await revokeEmbedKey(access!.companyId, c.req.param("keyId"));
  if (!ok) return c.json(error("NOT_FOUND", "Key not found"), 404);
  return c.json(success({ revoked: true }));
});

export { EMBED_VIEW_KEYS };
export default companyEmbedRoutes;
