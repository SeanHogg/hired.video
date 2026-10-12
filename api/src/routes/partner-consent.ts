/**
 * Partner consent — user-facing (JWT-authenticated) surface at
 * `/api/partner-consent/*`. This is where the JOB SEEKER, not the partner,
 * approves/denies/revokes a partner's access to their profile + resume. It is
 * the counterpart to the partner-key API in routes/partner.ts.
 *
 *   GET  /grants                — list this user's connected partners
 *   GET  /connections/:id       — details of one connection (renders consent)
 *   POST /connections/:id/authorize — approve (activates the connection)
 *   POST /connections/:id/revoke    — revoke access
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  listConnectionsForUser,
  getConnectionById,
  activateConnection,
  revokeConnection,
} from "../services/partner/connections.js";
import { getPartner } from "../services/partner/partners.js";

export const partnerConsentRoutes = new Hono<AppEnv>();

function clientIp(c: any): string | null {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    null
  );
}

// GET /grants — the user's connected partners (for the management surface).
partnerConsentRoutes.get("/grants", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const grants = await listConnectionsForUser(userId);
  return c.json(success({ grants }), 200);
});

// GET /connections/:id — details for the consent screen. Only the owning user
// may read it, so a leaked connection id reveals nothing to anyone else.
partnerConsentRoutes.get("/connections/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const conn = await getConnectionById(c.req.param("id"));
  if (!conn || conn.userId !== userId) return c.json(error("NOT_FOUND", "Connection not found"), 404);
  const partner = await getPartner(conn.partnerId);
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  return c.json(
    success({
      connectionId: conn.id,
      status: conn.status,
      source: conn.source,
      scopes: conn.scopes as string[],
      partner: {
        name: partner.name,
        slug: partner.slug,
        logoUrl: partner.logoUrl,
        websiteUrl: partner.websiteUrl,
      },
    }),
    200,
  );
});

// POST /connections/:id/authorize — the job seeker approves.
partnerConsentRoutes.post("/connections/:id/authorize", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const conn = await getConnectionById(c.req.param("id"));
  if (!conn || conn.userId !== userId) return c.json(error("NOT_FOUND", "Connection not found"), 404);
  const updated = await activateConnection(conn.id, clientIp(c));
  return c.json(success({ status: updated?.status ?? "active" }), 200);
});

// POST /connections/:id/revoke — the job seeker cuts off access.
partnerConsentRoutes.post("/connections/:id/revoke", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const conn = await getConnectionById(c.req.param("id"));
  if (!conn || conn.userId !== userId) return c.json(error("NOT_FOUND", "Connection not found"), 404);
  await revokeConnection(conn.id);
  return c.json(success({ status: "revoked" }), 200);
});

partnerConsentRoutes.all("*", (c) =>
  c.json(error("NOT_FOUND", "Partner consent route not found"), 404),
);
