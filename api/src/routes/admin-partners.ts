/**
 * SuperAdmin partner administration — `/api/admin/partners/*`. This is where a
 * partner platform is provisioned and issued the system-to-system API key it
 * "requests". Gated by superAdminMiddleware (mounted after authMiddleware).
 *
 *   GET    /                         — list partners
 *   POST   /                         — create a partner
 *   POST   /:id/suspend|/:id/activate
 *   GET    /:id/keys                 — list a partner's keys (never the secret)
 *   POST   /:id/keys                 — issue a key (full key returned ONCE)
 *   DELETE /:id/keys/:keyId          — revoke a key
 *   GET    /:id/connections          — the partner's connections
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import {
  createPartner,
  listPartners,
  getPartner,
  setPartnerStatus,
} from "../services/partner/partners.js";
import {
  createPartnerApiKey,
  listPartnerApiKeys,
  revokePartnerApiKey,
} from "../services/partner/keys.js";
import { listConnectionsForPartner } from "../services/partner/connections.js";
import { PARTNER_SCOPES, DEFAULT_PARTNER_SCOPES, type PartnerScope } from "../../../shared/partner.js";

export const adminPartnerRoutes = new Hono<AppEnv>();

adminPartnerRoutes.use("*", superAdminMiddleware);

adminPartnerRoutes.get("/", async (c) => {
  return c.json(success({ partners: await listPartners() }), 200);
});

const CreatePartnerBody = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(80).optional(),
  contactEmail: z.string().email().optional(),
  websiteUrl: z.string().url().max(2000).optional(),
  logoUrl: z.string().url().max(2000).optional(),
});

adminPartnerRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreatePartnerBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  const partner = await createPartner({ ...parsed.data, createdBy: c.var.user?.sub ?? null });
  return c.json(success({ partner }), 201);
});

adminPartnerRoutes.post("/:id/suspend", async (c) => {
  const okd = await setPartnerStatus(c.req.param("id"), "suspended");
  if (!okd) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  return c.json(success({ status: "suspended" }), 200);
});

adminPartnerRoutes.post("/:id/activate", async (c) => {
  const okd = await setPartnerStatus(c.req.param("id"), "active");
  if (!okd) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  return c.json(success({ status: "active" }), 200);
});

adminPartnerRoutes.get("/:id/keys", async (c) => {
  const partner = await getPartner(c.req.param("id"));
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  return c.json(success({ keys: await listPartnerApiKeys(partner.id) }), 200);
});

const CreateKeyBody = z.object({
  label: z.string().min(1).max(200),
  scopes: z.array(z.enum(PARTNER_SCOPES)).optional(),
  allowedOrigins: z.array(z.string().max(2000)).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

adminPartnerRoutes.post("/:id/keys", async (c) => {
  const partner = await getPartner(c.req.param("id"));
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateKeyBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  const { key, view } = await createPartnerApiKey({
    partnerId: partner.id,
    label: parsed.data.label,
    scopes: (parsed.data.scopes as PartnerScope[]) ?? DEFAULT_PARTNER_SCOPES,
    allowedOrigins: parsed.data.allowedOrigins,
    expiresInDays: parsed.data.expiresInDays ?? null,
    createdBy: c.var.user?.sub ?? null,
  });
  return c.json(
    success({
      ...view,
      key, // plaintext, shown ONCE
      warning: "Save this key now. It will not be shown again.",
    }),
    201,
  );
});

adminPartnerRoutes.delete("/:id/keys/:keyId", async (c) => {
  const revoked = await revokePartnerApiKey(c.req.param("id"), c.req.param("keyId"));
  if (!revoked) return c.json(error("NOT_FOUND", "Key not found"), 404);
  return c.json(success({ revoked: true }), 200);
});

adminPartnerRoutes.get("/:id/connections", async (c) => {
  const partner = await getPartner(c.req.param("id"));
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  return c.json(success({ connections: await listConnectionsForPartner(partner.id) }), 200);
});
