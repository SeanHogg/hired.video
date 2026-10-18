/**
 * Partner account (self-service) — `/api/partner-account/*`, JWT-authenticated.
 * This is the account owner's "Settings → Partner Access" surface:
 *   - request partner access (→ SuperAdmin approval + emails)
 *   - see their request/approval status
 *   - once approved, self-issue / list / revoke their partner API keys
 *
 * Distinct from `/api/admin/partners` (SuperAdmin approvals) and
 * `/api/partner/v1` (the partner-key system-to-system API).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getPartnerByOwner } from "../services/partner/partners.js";
import { requestPartnerAccess, requireActivePartnerId } from "../services/partner/partnerAccount.js";
import {
  createPartnerApiKey,
  listPartnerApiKeys,
  revokePartnerApiKey,
} from "../services/partner/keys.js";
import { DEFAULT_PARTNER_SCOPES, PARTNER_SCOPES, type PartnerScope } from "../../../shared/partner.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const partnerAccountRoutes = new Hono<AppEnv>();

// GET / — the owner's partner record (null if they've never requested).
partnerAccountRoutes.get("/", async (c) => {
  const userId = requireUser(c);
  const partner = await getPartnerByOwner(userId);
  return c.json(success({ partner }), 200);
});

// POST /request — request partner access.
const RequestBody = z.object({
  name: z.string().min(2).max(200),
  websiteUrl: z.string().url().max(2000).optional(),
  contactEmail: z.string().email().optional(),
  requestNote: z.string().max(2000).optional(),
});

partnerAccountRoutes.post("/request", validateJson(RequestBody, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const partner = await requestPartnerAccess(userId, c.req.valid("json"));
  return c.json(success({ partner }), 201);
});

// GET /keys — list the owner's partner keys (never the secret).
partnerAccountRoutes.get("/keys", async (c) => {
  const partnerId = await requireActivePartnerId(requireUser(c));
  return c.json(success({ keys: await listPartnerApiKeys(partnerId) }), 200);
});

// POST /keys — issue a key (full key returned ONCE).
const CreateKeyBody = z.object({
  label: z.string().min(1).max(200),
  scopes: z.array(z.enum(PARTNER_SCOPES)).optional(),
  allowedOrigins: z.array(z.string().max(2000)).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

partnerAccountRoutes.post("/keys", validateJson(CreateKeyBody, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const partnerId = await requireActivePartnerId(requireUser(c));
  const body = c.req.valid("json");
  const { key, view } = await createPartnerApiKey({
    partnerId,
    label: body.label,
    scopes: (body.scopes as PartnerScope[]) ?? DEFAULT_PARTNER_SCOPES,
    allowedOrigins: body.allowedOrigins,
    expiresInDays: body.expiresInDays ?? null,
    createdBy: c.var.userId ?? null,
  });
  return c.json(
    success({ ...view, key, warning: "Save this key now. It will not be shown again." }),
    201,
  );
});

// DELETE /keys/:keyId — revoke one of the owner's keys.
partnerAccountRoutes.delete("/keys/:keyId", async (c) => {
  const partnerId = await requireActivePartnerId(requireUser(c));
  const revoked = await revokePartnerApiKey(partnerId, c.req.param("keyId"));
  if (!revoked) return c.json(error("NOT_FOUND", "Key not found"), 404);
  return c.json(success({ revoked: true }), 200);
});
