/**
 * Polymorphic Boosts API — boost CRUD (non-checkout) lives ONLY here.
 *
 * Creating + paying for a boost is a checkout: POST /api/checkout
 * {kind:"boost", subjectType, subjectId, …} (routes/checkout.ts → the boost
 * kind, which enforces subject ownership). The boost starts
 * 'pending_payment' and turns 'active' once Campaign $ cover it or the USD
 * payment is confirmed via POST /api/checkout/boost:<boostId>/confirm.
 *
 *   GET    /api/boosts/me                             list caller's boosts
 *   GET    /api/boosts/:subjectType/:subjectId        list active boosts on a subject (public)
 *   POST   /api/boosts/:boostId/cancel                cancel own boost
 */

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { toBoostView } from "../services/advertising/boost-checkout.js";

const { boosts } = schema;

export const boostRoutes = new Hono<AppEnv>();

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

boostRoutes.get("/me", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(boosts)
    .where(eq(boosts.userId, uid))
    .orderBy(desc(boosts.createdAt));
  return c.json(success({ items: rows.map(toBoostView) }), 200);
});

boostRoutes.get("/:subjectType/:subjectId", async (c) => {
  const subjectType = c.req.param("subjectType");
  const subjectId = c.req.param("subjectId");
  const db = getDb();
  const rows = await db
    .select()
    .from(boosts)
    .where(
      and(
        eq(boosts.subjectType, subjectType),
        eq(boosts.subjectId, subjectId),
        eq(boosts.status, "active"),
      ),
    )
    .orderBy(desc(boosts.createdAt));
  return c.json(success({ items: rows.map(toBoostView) }), 200);
});

boostRoutes.post("/:boostId/cancel", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({ id: boosts.id, userId: boosts.userId })
    .from(boosts)
    .where(eq(boosts.id, c.req.param("boostId")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Boost not found"), 404);
  if (existing.userId !== uid) {
    return c.json(error("FORBIDDEN", "You can only cancel your own boost"), 403);
  }
  await db
    .update(boosts)
    .set({ status: "cancelled", updatedAt: new Date() } as any)
    .where(eq(boosts.id, existing.id));
  return c.json(success({ cancelled: true }), 200);
});

boostRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Boosts endpoint not found" } }, 404),
);
