/**
 * /api/outplacement — employer-paid outplacement product (#100).
 *
 *   POST   /packages                  purchase a package
 *   POST   /packages/:id/mark-paid    SuperAdmin / webhook → flip to paid
 *   GET    /packages                  list caller's packages
 *   GET    /packages/:id/seats        list seats in a package
 *   POST   /packages/:id/seats        invite a candidate
 *   POST   /seats/:id/accept          candidate accepts; links userId
 *   POST   /seats/:id/revoke          employer revokes
 *
 * Payment integration is intentionally split — purchase creates a
 * 'pending' row that the existing Helcim/Stripe checkout drains via
 * `mark-paid`. Keeping money handling out of this router means a
 * future provider swap doesn't touch the entitlement logic.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  outplacementService,
  OUTPLACEMENT_SKUS,
  type OutplacementSku,
} from "../services/outplacement/OutplacementService.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const outplacementRoutes = new Hono<AppEnv>();

const SkuKeys = ["starter", "standard", "premium"] as const satisfies readonly OutplacementSku[];

const PurchaseSchema = z.object({
  sku: z.enum(SkuKeys),
  seatCount: z.number().int().min(1).max(5000),
  companyId: z.string().uuid().optional(),
});

outplacementRoutes.get("/packages", async (c) => {
  const userId = requireUser(c);
  return c.json(success({ items: await outplacementService.listEmployerPackages(userId) }), 200);
});

outplacementRoutes.post("/packages", validateJson(PurchaseSchema, (e) => error("VALIDATION_ERROR", "Invalid purchase payload", e.flatten())), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const sku = OUTPLACEMENT_SKUS[body.sku];
  const row = await outplacementService.purchasePackage({
    employerUserId: userId,
    employerCompanyId: body.companyId ?? null,
    seatCount: body.seatCount,
    durationDays: sku.durationDays,
    unitPriceCents: sku.unitPriceCents,
  });
  return c.json(success({ package: row, sku: body.sku }), 201);
});

outplacementRoutes.post("/packages/:id/mark-paid", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as { providerPaymentId?: string };
  if (!body.providerPaymentId) {
    return c.json(error("VALIDATION_ERROR", "providerPaymentId required"), 400);
  }
  const row = await outplacementService.markPackagePaid(c.req.param("id"), body.providerPaymentId);
  if (!row) return c.json(error("NOT_FOUND", "Package not found"), 404);
  return c.json(success({ package: row }), 200);
});

outplacementRoutes.get("/packages/:id/seats", async (c) => {
  const userId = requireUser(c);
  return c.json(success({ items: await outplacementService.listPackageSeats(c.req.param("id")) }), 200);
});

const AssignSchema = z.object({ candidateEmail: z.string().email() });

outplacementRoutes.post("/packages/:id/seats", validateJson(AssignSchema, (e) => error("VALIDATION_ERROR", "candidateEmail required", e.flatten())), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  try {
    const row = await outplacementService.assignSeat({
      packageId: c.req.param("id"),
      candidateEmail: body.candidateEmail,
    });
    return c.json(success({ enrollment: row }), 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to assign seat";
    return c.json(error("ASSIGN_FAILED", msg), 400);
  }
});

outplacementRoutes.post("/seats/:id/accept", async (c) => {
  const userId = requireUser(c);
  try {
    const row = await outplacementService.acceptSeat(c.req.param("id"), userId);
    return c.json(success({ enrollment: row }), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to accept seat";
    return c.json(error("ACCEPT_FAILED", msg), 400);
  }
});

outplacementRoutes.post("/seats/:id/revoke", async (c) => {
  const userId = requireUser(c);
  const row = await outplacementService.revokeSeat(c.req.param("id"));
  if (!row) return c.json(error("NOT_FOUND", "Enrollment not found"), 404);
  return c.json(success({ enrollment: row }), 200);
});
