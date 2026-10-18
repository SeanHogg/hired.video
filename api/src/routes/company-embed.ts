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
import { requireCompanyOwner } from "../services/company/companyOwnership.js";
import {
  listEmbedKeys,
  createEmbedKey,
  revokeEmbedKey,
  rotateEmbedKey,
  buildEmbedSnippet,
  getCompanyEmbedSettings,
  setCompanyEmbedEnabled,
} from "../services/company/embed.js";
import { EMBED_VIEWS, EMBED_VIEW_KEYS, EMBED_ROADMAP } from "../../../shared/embed.js";
import { validateJson } from "./helpers/validate.js";

export const companyEmbedRoutes = new Hono<AppEnv>();

const CreateKeySchema = z.object({
  label: z.string().min(1).max(255),
  scopes: z.array(z.string().max(64)).max(20).default([]),
  allowedOrigins: z.array(z.string().url().max(255)).max(20).default([]),
  // Optional expiry in days (#1828); omit / null = non-expiring.
  expiresInDays: z.number().int().positive().max(3650).optional().nullable(),
});

/** GET — the full embed settings payload for the company settings UI. */
companyEmbedRoutes.get("/", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("companyId"));
  if (denied) return denied;
  const companyId = access!.companyId;

  const company = await getCompanyEmbedSettings(companyId);

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
      // Operational Cadence (CHRO) surfaces rolling out (reuse-existing +
      // planned) — the full hired.video People-Ops embed set (shared/embed.ts).
      roadmap: EMBED_ROADMAP.map((s) => ({ key: s.key, label: s.label, status: s.status })),
    }),
  );
});

/** PATCH — toggle embedding on/off. */
companyEmbedRoutes.patch("/", validateJson(z.object({ enabled: z.boolean() }), () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("companyId"));
  if (denied) return denied;
  const body = c.req.valid("json");

  await setCompanyEmbedEnabled(access!.companyId, body.enabled);
  return c.json(success({ enabled: body.enabled }));
});

/** POST keys — mint a key; full plaintext returned ONCE. */
companyEmbedRoutes.post("/keys", validateJson(CreateKeySchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("companyId"));
  if (denied) return denied;
  const userId = c.var.userId;
  const body = c.req.valid("json");
  // Default scope = all views if none specified.
  const scopes = body.scopes.length ? body.scopes : EMBED_VIEWS.map((v) => v.scope);
  const { key, view } = await createEmbedKey({
    companyId: access!.companyId,
    label: body.label,
    scopes,
    allowedOrigins: body.allowedOrigins,
    createdBy: userId,
    expiresInDays: body.expiresInDays ?? null,
  });
  // The full key is returned exactly once.
  return c.json(success({ key, keyInfo: view }), 201);
});

/** POST keys/:keyId/rotate — revoke the old key + mint a fresh one inheriting
 *  its label / scopes / origins (#1828). Returns the new plaintext key once. */
companyEmbedRoutes.post("/keys/:keyId/rotate", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("companyId"));
  if (denied) return denied;
  const userId = c.var.userId;
  const body = await c.req.json().catch(() => ({}));
  const expiresInDays =
    typeof body?.expiresInDays === "number" && body.expiresInDays > 0 ? body.expiresInDays : null;
  const result = await rotateEmbedKey(access!.companyId, c.req.param("keyId"), userId, expiresInDays);
  if (!result) return c.json(error("NOT_FOUND", "Key not found"), 404);
  return c.json(success({ key: result.key, keyInfo: result.view }), 201);
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
