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

export const outplacementRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const SkuKeys = ["starter", "standard", "premium"] as const satisfies readonly OutplacementSku[];

const PurchaseSchema = z.object({
  sku: z.enum(SkuKeys),
  seatCount: z.number().int().min(1).max(5000),
  companyId: z.string().uuid().optional(),
});

outplacementRoutes.get("/packages", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success({ items: await outplacementService.listEmployerPackages(userId) }), 200);
});

outplacementRoutes.post("/packages", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = PurchaseSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid purchase payload", parsed.error.flatten()), 400);
  }
  const sku = OUTPLACEMENT_SKUS[parsed.data.sku];
  const row = await outplacementService.purchasePackage({
    employerUserId: userId,
    employerCompanyId: parsed.data.companyId ?? null,
    seatCount: parsed.data.seatCount,
    durationDays: sku.durationDays,
    unitPriceCents: sku.unitPriceCents,
  });
  return c.json(success({ package: row, sku: parsed.data.sku }), 201);
});

outplacementRoutes.post("/packages/:id/mark-paid", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({})) as { providerPaymentId?: string };
  if (!body.providerPaymentId) {
    return c.json(error("VALIDATION_ERROR", "providerPaymentId required"), 400);
  }
  const row = await outplacementService.markPackagePaid(c.req.param("id"), body.providerPaymentId);
  if (!row) return c.json(error("NOT_FOUND", "Package not found"), 404);
  return c.json(success({ package: row }), 200);
});

outplacementRoutes.get("/packages/:id/seats", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success({ items: await outplacementService.listPackageSeats(c.req.param("id")) }), 200);
});

const AssignSchema = z.object({ candidateEmail: z.string().email() });

outplacementRoutes.post("/packages/:id/seats", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = AssignSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "candidateEmail required", parsed.error.flatten()), 400);
  }
  try {
    const row = await outplacementService.assignSeat({
      packageId: c.req.param("id"),
      candidateEmail: parsed.data.candidateEmail,
    });
    return c.json(success({ enrollment: row }), 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to assign seat";
    return c.json(error("ASSIGN_FAILED", msg), 400);
  }
});

outplacementRoutes.post("/seats/:id/accept", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const row = await outplacementService.acceptSeat(c.req.param("id"), userId);
    return c.json(success({ enrollment: row }), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to accept seat";
    return c.json(error("ACCEPT_FAILED", msg), 400);
  }
});

outplacementRoutes.post("/seats/:id/revoke", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const row = await outplacementService.revokeSeat(c.req.param("id"));
  if (!row) return c.json(error("NOT_FOUND", "Enrollment not found"), 404);
  return c.json(success({ enrollment: row }), 200);
});

outplacementRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Outplacement route not found" } }, 404),
);
