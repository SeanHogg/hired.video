/**
 * SuperAdmin partner administration — `/api/admin/partners/*`. This is where a
 * partner platform is provisioned and issued the system-to-system API key it
 * "requests". Mounted by the admin composite (routes/admin/index.ts), which
 * applies the SA guard.
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
import {
  createPartner,
  listPartners,
  listPartnersByStatus,
  getPartner,
  setPartnerStatus,
  approvePartner,
  rejectPartner,
} from "../services/partner/partners.js";
import {
  createPartnerApiKey,
  listPartnerApiKeys,
  revokePartnerApiKey,
} from "../services/partner/keys.js";
import { listConnectionsForPartner } from "../services/partner/connections.js";
import { notifyOwnerApproved, notifyOwnerRejected } from "../services/partner/emails.js";
import { adminRepos } from "../repositories/admin/index.js";
import { PARTNER_SCOPES, DEFAULT_PARTNER_SCOPES, type PartnerScope } from "../../../shared/partner.js";
import { validateJson } from "./helpers/validate.js";

export const adminPartnerRoutes = new Hono<AppEnv>();

/** Look up a partner owner's email so approval/rejection notices reach them. */
async function ownerEmail(ownerUserId: string | null): Promise<string | null> {
  if (!ownerUserId) return null;
  const owner = await adminRepos().users.findById(ownerUserId);
  return owner?.email ?? null;
}

adminPartnerRoutes.get("/", async (c) => {
  const status = c.req.query("status");
  const partners = status ? await listPartnersByStatus(status) : await listPartners();
  return c.json(success({ partners }), 200);
});

// POST /:id/approve — approve a pending request + email the owner.
adminPartnerRoutes.post("/:id/approve", async (c) => {
  const partner = await approvePartner(c.req.param("id"), c.var.userId ?? "");
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  const email = await ownerEmail(partner.ownerUserId);
  if (email) await notifyOwnerApproved(partner, { email }).catch(() => undefined);
  return c.json(success({ partner }), 200);
});

// POST /:id/reject — reject a pending request + email the owner.
adminPartnerRoutes.post("/:id/reject", async (c) => {
  const partner = await rejectPartner(c.req.param("id"));
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  const email = await ownerEmail(partner.ownerUserId);
  if (email) await notifyOwnerRejected(partner, { email }).catch(() => undefined);
  return c.json(success({ partner }), 200);
});

const CreatePartnerBody = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(80).optional(),
  contactEmail: z.string().email().optional(),
  websiteUrl: z.string().url().max(2000).optional(),
  logoUrl: z.string().url().max(2000).optional(),
});

adminPartnerRoutes.post("/", validateJson(CreatePartnerBody, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const partner = await createPartner({ ...body, createdBy: c.var.userId ?? null });
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

adminPartnerRoutes.post("/:id/keys", validateJson(CreateKeyBody, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const partner = await getPartner(c.req.param("id"));
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  const body = c.req.valid("json");
  const { key, view } = await createPartnerApiKey({
    partnerId: partner.id,
    label: body.label,
    scopes: (body.scopes as PartnerScope[]) ?? DEFAULT_PARTNER_SCOPES,
    allowedOrigins: body.allowedOrigins,
    expiresInDays: body.expiresInDays ?? null,
    createdBy: c.var.userId ?? null,
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
