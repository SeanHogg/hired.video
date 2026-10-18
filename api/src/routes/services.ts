/**
 * Services / Lead-Generation Marketplace
 *
 * Job seekers can opt-in to "provide services" (lead-gen mode).
 * They list service offerings (think restaurant menu) with a price and
 * visibility setting.  Other users can:
 *   - Add visible-price services to cart and purchase directly.
 *   - Submit an inquiry (request quote) for hidden-price services.
 *
 * Routes:
 *   GET    /api/services                      – own offerings list
 *   POST   /api/services                      – create offering
 *   PUT    /api/services/:id                  – update offering
 *   DELETE /api/services/:id                  – delete offering
 *   GET    /api/services/browse                – public marketplace: all active offerings + provider
 *   GET    /api/services/public/:userId        – public offerings for a profile
 *   GET    /api/services/inquiries             – incoming inquiries (provider)
 *   GET    /api/services/my-requests           – outgoing inquiries (buyer)
 *   POST   /api/services/:serviceId/inquire    – submit inquiry / purchase intent
 *   PATCH  /api/services/inquiries/:id         – update inquiry status (provider)
 *   PATCH  /api/services/toggle                – toggle providesServices on profile
 *   GET    /api/services/team/leaderboard      – per-member pipeline rollup for a company
 *
 * Handlers only parse input; use cases live in
 * services/service-marketplace/serviceMarketplace.ts and
 * services/analytics/teamLeaderboard.ts.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { clampLimit } from "../utils/pagination.js";
import { requireUser } from "./helpers/routerHelpers.js";
import {
  browseOfferings,
  createOffering,
  deleteOwnOffering,
  listBuyerRequests,
  listOwnOfferings,
  listProviderInquiries,
  listPublicOfferings,
  setInquiryStatus,
  submitInquiry,
  toggleProvidesServices,
  updateOwnOffering,
  type CreateOfferingInput,
} from "../services/service-marketplace/serviceMarketplace.js";
import { getTeamLeaderboard } from "../services/analytics/teamLeaderboard.js";

export const serviceRoutes = new Hono<AppEnv>();

/** JSON body, or `{}` when absent / malformed (the handlers validate fields). */
const readBody = <T>(c: { req: { json: () => Promise<unknown> } }): Promise<T> =>
  c.req.json().catch(() => ({})) as Promise<T>;

// PATCH /toggle — enable/disable providesServices on own profile
serviceRoutes.patch("/toggle", async (c) => {
  const userId = requireUser(c);
  const body = await readBody<{ providesServices?: unknown }>(c);
  return c.json(success(await toggleProvidesServices(userId, body.providesServices)), 200);
});

// GET / — list own service offerings
serviceRoutes.get("/", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listOwnOfferings(userId)), 200);
});

// POST / — create a new service offering
serviceRoutes.post("/", async (c) => {
  const userId = requireUser(c);
  const body = await readBody<CreateOfferingInput>(c);
  return c.json(success(await createOffering(userId, body)), 201);
});

// PUT /:id — update a service offering
serviceRoutes.put("/:id", async (c) => {
  const userId = requireUser(c);
  const body = await readBody<Record<string, unknown>>(c);
  const updated = await updateOwnOffering(userId, c.req.param("id"), body, isSuperAdmin(c.var.user));
  return c.json(success(updated), 200);
});

// DELETE /:id — delete a service offering
serviceRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  await deleteOwnOffering(userId, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});

// GET /browse — public marketplace listing of all active service offerings
// joined with their provider's user info. Powers the Services category in
// /search. Degrades to an empty list on any failure so /search keeps
// rendering.
serviceRoutes.get("/browse", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 30, 100);
  const items = await browseOfferings(limit).catch(() => [] as unknown[]);
  return c.json(success(items), 200);
});

// GET /public/:userId — active offerings for any public profile (no auth req.)
// Returns priceCents only when priceVisible=true
serviceRoutes.get("/public/:userId", async (c) => {
  return c.json(success(await listPublicOfferings(c.req.param("userId"))), 200);
});

// GET /inquiries — incoming inquiries where I am the provider
serviceRoutes.get("/inquiries", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listProviderInquiries(userId)), 200);
});

// GET /my-requests — inquiries I submitted (buyer view)
serviceRoutes.get("/my-requests", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listBuyerRequests(userId)), 200);
});

// POST /:serviceId/inquire — submit inquiry or purchase intent
serviceRoutes.post("/:serviceId/inquire", async (c) => {
  const userId = requireUser(c);
  const body = await readBody<{ message?: string; orderType?: string }>(c);
  return c.json(success(await submitInquiry(userId, c.req.param("serviceId"), body)), 201);
});

// PATCH /inquiries/:id — update inquiry status (provider only)
serviceRoutes.patch("/inquiries/:id", async (c) => {
  const userId = requireUser(c);
  const body = await readBody<{ status?: unknown }>(c);
  return c.json(success(await setInquiryStatus(userId, c.req.param("id"), body.status)), 200);
});

// GET /team/leaderboard?companyId=X&days=30
serviceRoutes.get("/team/leaderboard", async (c) => {
  const userId = requireUser(c);
  const companyId = c.req.query("companyId");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId is required"), 400);

  const daysParam = Number.parseInt(c.req.query("days") ?? "30", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  const board = await getTeamLeaderboard({ userId, companyId, days, bypassMembership: isSuperAdmin(c.var.user) });
  return c.json(success(board), 200);
});
