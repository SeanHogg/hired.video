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
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  getPartnerByOwner,
  requestPartner,
} from "../services/partner/partners.js";
import {
  createPartnerApiKey,
  listPartnerApiKeys,
  revokePartnerApiKey,
} from "../services/partner/keys.js";
import {
  notifyAdminOfPartnerRequest,
  sendPartnerRequestReceipt,
} from "../services/partner/emails.js";
import { DEFAULT_PARTNER_SCOPES, PARTNER_SCOPES, type PartnerScope } from "../../../shared/partner.js";

export const partnerAccountRoutes = new Hono<AppEnv>();

async function requesterIdentity(userId: string): Promise<{ name: string; email: string }> {
  const db = getDb();
  const [u] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return { name: u?.name ?? "A Hired.Video user", email: u?.email ?? "" };
}

// GET / — the owner's partner record (null if they've never requested).
partnerAccountRoutes.get("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
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

partnerAccountRoutes.post("/request", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const existing = await getPartnerByOwner(userId);
  if (existing && (existing.status === "pending" || existing.status === "active")) {
    return c.json(
      error(
        "CONFLICT",
        existing.status === "active"
          ? "You already have approved partner access."
          : "You already have a pending partner request under review.",
        { partner: existing },
      ),
      409,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const requester = await requesterIdentity(userId);
  const partner = await requestPartner({
    ownerUserId: userId,
    name: parsed.data.name,
    websiteUrl: parsed.data.websiteUrl ?? null,
    contactEmail: parsed.data.contactEmail ?? requester.email,
    requestNote: parsed.data.requestNote ?? null,
  });

  // Fire lifecycle emails (best-effort; no-op without a configured provider).
  await Promise.allSettled([
    notifyAdminOfPartnerRequest(partner, requester),
    sendPartnerRequestReceipt(requester),
  ]);

  return c.json(success({ partner }), 201);
});

/** Resolve the caller's ACTIVE partner or return a 403 envelope. */
async function requireActivePartner(c: any): Promise<{ partnerId: string } | Response> {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const partner = await getPartnerByOwner(userId);
  if (!partner) return c.json(error("FORBIDDEN", "Request partner access first."), 403);
  if (partner.status !== "active") {
    return c.json(error("FORBIDDEN", "Your partner access is not approved yet."), 403);
  }
  return { partnerId: partner.id };
}

// GET /keys — list the owner's partner keys (never the secret).
partnerAccountRoutes.get("/keys", async (c) => {
  const resolved = await requireActivePartner(c);
  if (resolved instanceof Response) return resolved;
  return c.json(success({ keys: await listPartnerApiKeys(resolved.partnerId) }), 200);
});

// POST /keys — issue a key (full key returned ONCE).
const CreateKeyBody = z.object({
  label: z.string().min(1).max(200),
  scopes: z.array(z.enum(PARTNER_SCOPES)).optional(),
  allowedOrigins: z.array(z.string().max(2000)).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

partnerAccountRoutes.post("/keys", async (c) => {
  const resolved = await requireActivePartner(c);
  if (resolved instanceof Response) return resolved;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateKeyBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  const { key, view } = await createPartnerApiKey({
    partnerId: resolved.partnerId,
    label: parsed.data.label,
    scopes: (parsed.data.scopes as PartnerScope[]) ?? DEFAULT_PARTNER_SCOPES,
    allowedOrigins: parsed.data.allowedOrigins,
    expiresInDays: parsed.data.expiresInDays ?? null,
    createdBy: c.var.user?.sub ?? null,
  });
  return c.json(
    success({ ...view, key, warning: "Save this key now. It will not be shown again." }),
    201,
  );
});

// DELETE /keys/:keyId — revoke one of the owner's keys.
partnerAccountRoutes.delete("/keys/:keyId", async (c) => {
  const resolved = await requireActivePartner(c);
  if (resolved instanceof Response) return resolved;
  const revoked = await revokePartnerApiKey(resolved.partnerId, c.req.param("keyId"));
  if (!revoked) return c.json(error("NOT_FOUND", "Key not found"), 404);
  return c.json(success({ revoked: true }), 200);
});

partnerAccountRoutes.all("*", (c) =>
  c.json(error("NOT_FOUND", "Partner account route not found"), 404),
);
