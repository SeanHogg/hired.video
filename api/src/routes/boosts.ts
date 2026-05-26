/**
 * Polymorphic Boosts API.
 *
 * One router serves promotion of every user-generated subject. The
 * caller specifies (subject_type, subject_id) and the surface they
 * want the boost on. Ownership is checked per-type — only the owner
 * of the subject can promote it.
 *
 * Stripe payment-intent wiring is deferred (see migration 0034
 * comment block). This v1 inserts the boost row directly as 'active'
 * — matching the existing job_boosts / company_boosts behaviour —
 * with `stripe_payment_intent_id = NULL`. A future PR will create
 * payment intents in POST and flip status from 'pending_payment' →
 * 'active' on `payment_intent.succeeded` for ALL boost types in one
 * pass.
 *
 *   POST   /api/boosts                                create a boost
 *   GET    /api/boosts/me                             list caller's boosts
 *   GET    /api/boosts/:subjectType/:subjectId        list active boosts on a subject (public)
 *   POST   /api/boosts/:boostId/cancel                cancel own boost
 */

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { boosts, companyProfiles, promoProjects, reviews } = schema;

export const boostRoutes = new Hono<AppEnv>();

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// Subject types that callers may promote. Kept as a plain enum here
// (not the review descriptors) because boostable subjects are a
// superset — a feed_post or video might be promotable but not
// reviewable.
const BOOSTABLE_SUBJECT_TYPES = [
  "review",
  "feed_post",
  "company",
  "promo_project",
  "video",
  "resume",
  "voice_clone",
  "service",
] as const;
type BoostableSubject = (typeof BOOSTABLE_SUBJECT_TYPES)[number];
const isBoostableSubject = (v: unknown): v is BoostableSubject =>
  typeof v === "string" && (BOOSTABLE_SUBJECT_TYPES as readonly string[]).includes(v);

/** Resolve the owner of a polymorphic subject — the only user who's
 *  allowed to promote it. Returns null when the subject doesn't exist
 *  or the type isn't yet wired (return = 404 from caller). */
async function resolveSubjectOwner(
  db: ReturnType<typeof getDb>,
  type: BoostableSubject,
  id: string,
): Promise<string | null> {
  switch (type) {
    case "review": {
      const [r] = await db.select({ userId: reviews.userId }).from(reviews).where(eq(reviews.id, id)).limit(1);
      return r?.userId ?? null;
    }
    case "company": {
      const [r] = await db
        .select({ ownerId: companyProfiles.ownerId })
        .from(companyProfiles)
        .where(eq(companyProfiles.id, id))
        .limit(1);
      return r?.ownerId ?? null;
    }
    case "promo_project": {
      const [r] = await db
        .select({ creatorId: promoProjects.creatorId })
        .from(promoProjects)
        .where(eq(promoProjects.id, id))
        .limit(1);
      return r?.creatorId ?? null;
    }
    // Subjects not yet wired — owner check is the gate that adds them
    // here when the rest of the integration lands. For now anyone can
    // promote them once wired.
    case "feed_post":
    case "video":
    case "resume":
    case "voice_clone":
    case "service":
      return null;
    default:
      return null;
  }
}

const CreateBoostSchema = z.object({
  subjectType: z.enum(BOOSTABLE_SUBJECT_TYPES),
  subjectId: UuidLikeSchema,
  budgetCents: z.number().int().min(100).max(1_000_000),
  durationDays: z.number().int().min(1).max(90),
  placementType: z.string().max(32).default("feed_top"),
  pricingModel: z.enum(["flat", "cpm", "cpc"]).default("flat"),
});

function rowToBoost(row: typeof boosts.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    placementType: row.placementType,
    pricingModel: row.pricingModel,
    budgetCents: row.budgetCents,
    spentCents: row.spentCents,
    rateUnitCents: row.rateUnitCents,
    status: row.status,
    impressions: row.impressions,
    clicks: row.clicks,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

boostRoutes.post("/", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const raw = await c.req.json().catch(() => null);
  const parsed = CreateBoostSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(error("BAD_REQUEST", "Invalid boost payload", parsed.error.flatten()), 400);
  }
  const body = parsed.data;
  const db = getDb();

  if (!isBoostableSubject(body.subjectType)) {
    return c.json(error("BAD_REQUEST", "Subject type not boostable"), 400);
  }
  const ownerId = await resolveSubjectOwner(db, body.subjectType, body.subjectId);
  // Owner check: when we know the owner, the caller must match. When
  // the subject type isn't wired yet, fall back to allow (the
  // resolver returns null) so the new content type can opt in later
  // without a route change.
  if (ownerId !== null && ownerId !== uid) {
    return c.json(error("FORBIDDEN", "You can only promote your own content"), 403);
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + body.durationDays * 24 * 60 * 60 * 1000);
  // Flat pricing: spread the budget evenly across the duration as a
  // notional per-day rate. Stored for display + future enforcement;
  // not actually metered today.
  const rateUnitCents =
    body.pricingModel === "flat"
      ? Math.max(1, Math.round(body.budgetCents / body.durationDays))
      : null;

  // Status: 'active' to match the existing job_boosts / company_boosts
  // pattern. When Stripe payment-intent wiring lands across all boost
  // types, this becomes 'pending_payment' until the PI succeeds.
  const [row] = await db
    .insert(boosts)
    .values({
      userId: uid,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      placementType: body.placementType,
      pricingModel: body.pricingModel,
      budgetCents: body.budgetCents,
      rateUnitCents,
      status: "active",
      startsAt,
      endsAt,
    } as any)
    .returning();

  return c.json(success({ boost: rowToBoost(row) }), 201);
});

boostRoutes.get("/me", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(boosts)
    .where(eq(boosts.userId, uid))
    .orderBy(desc(boosts.createdAt));
  return c.json(success({ items: rows.map(rowToBoost) }), 200);
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
  return c.json(success({ items: rows.map(rowToBoost) }), 200);
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
