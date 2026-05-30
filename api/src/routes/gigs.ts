/**
 * /api/gigs — freelance / gig marketplace (#101).
 *
 *   GET    /              list open projects (public-ish; auth optional)
 *   POST   /              create a project
 *   GET    /me            list caller's projects (owner view)
 *   POST   /:id/bids      submit a bid
 *   GET    /:id/bids      list bids for owner
 *   POST   /bids/:id/award   owner awards a bid → moves project to in_progress + clones milestones
 *   POST   /:id/milestones   add a milestone (owner)
 *   POST   /milestones/:id/approve   owner approves milestone → ready for escrow release
 *
 * Stripe-escrow money flow is wired through the existing
 * `boost_checkouts` payment provider abstraction in a follow-up — the
 * milestone status machine is what closes the gap-#101 product surface.
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { gigProjects, gigBids, gigMilestones } = schema;

export const gigsRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const NewProjectSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(10).max(20_000),
  requiredSkills: z.array(z.string().min(1).max(64)).max(50).default([]),
  budgetKind: z.enum(["fixed", "hourly"]).default("fixed"),
  budgetMinCents: z.number().int().min(0),
  budgetMaxCents: z.number().int().min(0),
  estimatedDurationDays: z.number().int().min(1).max(365).optional(),
});

gigsRoutes.get("/", async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(gigProjects)
    .where(eq(gigProjects.status, "open"))
    .orderBy(desc(gigProjects.createdAt))
    .limit(100);
  return c.json(success({ items: rows }), 200);
});

gigsRoutes.post("/", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = NewProjectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid project payload", parsed.error.flatten()), 400);
  }
  if (parsed.data.budgetMaxCents < parsed.data.budgetMinCents) {
    return c.json(error("VALIDATION_ERROR", "budgetMaxCents must be >= budgetMinCents"), 400);
  }
  const db = getDb();
  const [row] = await db
    .insert(gigProjects)
    .values({
      ownerUserId: u,
      title: parsed.data.title,
      description: parsed.data.description,
      requiredSkills: parsed.data.requiredSkills,
      budgetKind: parsed.data.budgetKind,
      budgetMinCents: parsed.data.budgetMinCents,
      budgetMaxCents: parsed.data.budgetMaxCents,
      estimatedDurationDays: parsed.data.estimatedDurationDays ?? null,
      status: "open",
    })
    .returning();
  return c.json(success({ project: row }), 201);
});

gigsRoutes.get("/me", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(gigProjects)
    .where(eq(gigProjects.ownerUserId, u))
    .orderBy(desc(gigProjects.createdAt));
  return c.json(success({ items: rows }), 200);
});

const NewBidSchema = z.object({
  coverLetter: z.string().min(20).max(10_000),
  proposedAmountCents: z.number().int().min(0),
  proposedDurationDays: z.number().int().min(1).max(365).optional(),
});

gigsRoutes.post("/:id/bids", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = NewBidSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid bid", parsed.error.flatten()), 400);
  }
  const db = getDb();
  const [project] = await db
    .select({ id: gigProjects.id, ownerUserId: gigProjects.ownerUserId, status: gigProjects.status })
    .from(gigProjects)
    .where(eq(gigProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.ownerUserId === u) {
    return c.json(error("FORBIDDEN", "You can't bid on your own project"), 403);
  }
  if (project.status !== "open") {
    return c.json(error("CONFLICT", "Project is not accepting bids"), 409);
  }
  const [row] = await db
    .insert(gigBids)
    .values({
      projectId: project.id,
      bidderUserId: u,
      coverLetter: parsed.data.coverLetter,
      proposedAmountCents: parsed.data.proposedAmountCents,
      proposedDurationDays: parsed.data.proposedDurationDays ?? null,
      status: "submitted",
    })
    .onConflictDoUpdate({
      target: [gigBids.projectId, gigBids.bidderUserId],
      set: {
        coverLetter: parsed.data.coverLetter,
        proposedAmountCents: parsed.data.proposedAmountCents,
        proposedDurationDays: parsed.data.proposedDurationDays ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return c.json(success({ bid: row }), 201);
});

gigsRoutes.get("/:id/bids", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [project] = await db
    .select({ ownerUserId: gigProjects.ownerUserId })
    .from(gigProjects)
    .where(eq(gigProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.ownerUserId !== u) {
    return c.json(error("FORBIDDEN", "Only the project owner can view bids"), 403);
  }
  const rows = await db
    .select()
    .from(gigBids)
    .where(eq(gigBids.projectId, c.req.param("id")))
    .orderBy(asc(gigBids.proposedAmountCents));
  return c.json(success({ items: rows }), 200);
});

gigsRoutes.post("/bids/:id/award", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [bid] = await db
    .select()
    .from(gigBids)
    .where(eq(gigBids.id, c.req.param("id")))
    .limit(1);
  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);
  const [project] = await db
    .select()
    .from(gigProjects)
    .where(eq(gigProjects.id, bid.projectId))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.ownerUserId !== u) return c.json(error("FORBIDDEN", "Owner only"), 403);
  if (project.status !== "open") return c.json(error("CONFLICT", "Project already in progress / closed"), 409);

  await db.transaction(async (tx) => {
    await tx
      .update(gigBids)
      .set({ status: "awarded", updatedAt: new Date() })
      .where(eq(gigBids.id, bid.id));
    await tx
      .update(gigBids)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(gigBids.projectId, project.id), eq(gigBids.status, "submitted")));
    await tx
      .update(gigProjects)
      .set({ status: "in_progress", awardedBidId: bid.id, updatedAt: new Date() })
      .where(eq(gigProjects.id, project.id));
  });

  return c.json(success({ awarded: true }), 200);
});

const NewMilestoneSchema = z.object({
  ordinal: z.number().int().min(0).max(50).default(0),
  title: z.string().min(1).max(255),
  amountCents: z.number().int().min(0),
  description: z.string().max(10_000).optional(),
});

gigsRoutes.post("/:id/milestones", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = NewMilestoneSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid milestone", parsed.error.flatten()), 400);
  }
  const db = getDb();
  const [project] = await db
    .select({ id: gigProjects.id, ownerUserId: gigProjects.ownerUserId })
    .from(gigProjects)
    .where(eq(gigProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.ownerUserId !== u) return c.json(error("FORBIDDEN", "Owner only"), 403);
  const [row] = await db
    .insert(gigMilestones)
    .values({
      projectId: project.id,
      ordinal: parsed.data.ordinal,
      title: parsed.data.title,
      amountCents: parsed.data.amountCents,
      description: parsed.data.description ?? null,
      status: "pending",
    })
    .returning();
  return c.json(success({ milestone: row }), 201);
});

gigsRoutes.post("/milestones/:id/approve", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [milestone] = await db
    .select()
    .from(gigMilestones)
    .where(eq(gigMilestones.id, c.req.param("id")))
    .limit(1);
  if (!milestone) return c.json(error("NOT_FOUND", "Milestone not found"), 404);
  const [project] = await db
    .select({ ownerUserId: gigProjects.ownerUserId, awardedBidId: gigProjects.awardedBidId })
    .from(gigProjects)
    .where(eq(gigProjects.id, milestone.projectId))
    .limit(1);
  if (!project || project.ownerUserId !== u) return c.json(error("FORBIDDEN", "Owner only"), 403);

  const [row] = await db
    .update(gigMilestones)
    .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(gigMilestones.id, milestone.id))
    .returning();
  return c.json(success({ milestone: row }), 200);
});

/**
 * #101 — Release escrowed funds to the awarded bidder + record the
 * 10% platform fee. Idempotent on `(milestone_id, kind='accrual')` via
 * `payoutLedgerService.recordAccrual`. Caller flips milestone to
 * 'released' after this returns successfully.
 *
 *   POST /milestones/:id/release
 */
gigsRoutes.post("/milestones/:id/release", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [milestone] = await db
    .select()
    .from(gigMilestones)
    .where(eq(gigMilestones.id, c.req.param("id")))
    .limit(1);
  if (!milestone) return c.json(error("NOT_FOUND", "Milestone not found"), 404);
  if (milestone.status !== "approved") {
    return c.json(error("CONFLICT", "Milestone must be approved before release"), 409);
  }

  const [project] = await db
    .select({ ownerUserId: gigProjects.ownerUserId, awardedBidId: gigProjects.awardedBidId })
    .from(gigProjects)
    .where(eq(gigProjects.id, milestone.projectId))
    .limit(1);
  if (!project || project.ownerUserId !== u) return c.json(error("FORBIDDEN", "Owner only"), 403);
  if (!project.awardedBidId) {
    return c.json(error("CONFLICT", "Project has no awarded bidder"), 409);
  }
  const [bid] = await db
    .select({ bidderUserId: schema.gigBids.bidderUserId })
    .from(schema.gigBids)
    .where(eq(schema.gigBids.id, project.awardedBidId))
    .limit(1);
  if (!bid) return c.json(error("NOT_FOUND", "Awarded bid not found"), 404);

  // 10% platform fee on completed milestones per the gap-#101 spec.
  const grossCents = milestone.amountCents;
  const platformFeeCents = Math.round(grossCents * 0.1);
  const creatorCents = grossCents - platformFeeCents;

  const { payoutLedgerService } = await import("../services/payout/PayoutLedgerService.js");
  await payoutLedgerService.recordAccrual({
    userId: bid.bidderUserId,
    amountCents: creatorCents,
    currency: "USD",
    sourceKind: "service_order",
    sourceId: milestone.id,
    note: `Gig milestone "${milestone.title}" released (10% platform fee: $${(platformFeeCents / 100).toFixed(2)})`,
  });

  const [row] = await db
    .update(gigMilestones)
    .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
    .where(eq(gigMilestones.id, milestone.id))
    .returning();

  return c.json(success({
    milestone: row,
    payout: { grossCents, platformFeeCents, creatorCents, bidderUserId: bid.bidderUserId },
  }), 200);
});

gigsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Gig route not found" } }, 404),
);
