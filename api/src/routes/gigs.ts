/**
 * /api/gigs — freelance / gig marketplace (#101).
 *
 * Marketplace + bidding:
 *   GET    /                  list open briefs (public-ish; auth optional)
 *   POST   /                  create a brief (+ deliverable items)
 *   GET    /me                caller's posted briefs (owner view)
 *   GET    /me/bids           bids the caller has placed
 *   GET    /me/work           caller's awarded gig work (as TaskDTOs)
 *   PATCH  /work/:taskId/status   creator advances a work item (syncs milestone)
 *   GET    /:id               brief + deliverable items (public)
 *   GET    /:id/bids          list bids for owner
 *   POST   /:id/bids          submit a bid
 *   POST   /bids/:id/award    owner awards a bid → in_progress + clones items to tasks
 *
 * Escrow (poster-side):
 *   POST   /:id/milestones        add a deliverable item (owner)
 *   POST   /milestones/:id/approve   owner approves → ready for release
 *   POST   /milestones/:id/release   release escrow to the awarded creator
 *
 * Multi-table writes (award→task bridge, milestone sync) live in GigService.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { gigService, GigError } from "../services/gigs/GigService.js";

const { gigProjects, gigMilestones, gigBids } = schema;

export const gigsRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/** Map a GigError → its HTTP status. */
const STATUS: Record<GigError["code"], 400 | 403 | 404 | 409> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

function handleGigError(c: any, e: unknown) {
  if (e instanceof GigError) return c.json(error(e.code, e.message), STATUS[e.code]);
  throw e;
}

const ItemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10_000).optional(),
  amountCents: z.number().int().min(0),
});

const NewProjectSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(10).max(20_000),
  requiredSkills: z.array(z.string().min(1).max(64)).max(50).default([]),
  budgetKind: z.enum(["fixed", "hourly"]).default("fixed"),
  budgetMinCents: z.number().int().min(0),
  budgetMaxCents: z.number().int().min(0),
  estimatedDurationDays: z.number().int().min(1).max(365).optional(),
  deadline: z.string().datetime().optional(),
  items: z.array(ItemSchema).max(50).default([]),
});

const NewBidSchema = z.object({
  coverLetter: z.string().min(20).max(10_000),
  proposedAmountCents: z.number().int().min(0),
  proposedDurationDays: z.number().int().min(1).max(365).optional(),
});

const NewMilestoneSchema = z.object({
  ordinal: z.number().int().min(0).max(50).default(0),
  title: z.string().min(1).max(255),
  amountCents: z.number().int().min(0),
  description: z.string().max(10_000).optional(),
});

const WorkStatusSchema = z.object({ status: z.number().int().min(0).max(8) });

// ── marketplace ────────────────────────────────────────────────────────────

gigsRoutes.get("/", async (c) => {
  const items = await gigService.listOpenProjects();
  return c.json(success({ items }), 200);
});

gigsRoutes.post("/", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = NewProjectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid project payload", parsed.error.flatten()), 400);
  }
  try {
    const result = await gigService.createProject(u, parsed.data);
    return c.json(success(result), 201);
  } catch (e) {
    return handleGigError(c, e);
  }
});

// Static /me* routes MUST precede the /:id param route so they don't get
// swallowed as a project id.
gigsRoutes.get("/me", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const items = await gigService.listMyProjects(u);
  return c.json(success({ items }), 200);
});

gigsRoutes.get("/me/bids", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const items = await gigService.listMyBids(u);
  return c.json(success({ items }), 200);
});

gigsRoutes.get("/me/work", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const work = await gigService.listMyWork(u);
  return c.json(success(work), 200);
});

gigsRoutes.patch("/work/:taskId/status", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = WorkStatusSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid status", parsed.error.flatten()), 400);
  }
  try {
    const task = await gigService.updateWorkStatus(c.req.param("taskId"), u, parsed.data.status);
    return c.json(success({ task }), 200);
  } catch (e) {
    return handleGigError(c, e);
  }
});

gigsRoutes.get("/:id", async (c) => {
  try {
    const detail = await gigService.getProject(c.req.param("id"));
    return c.json(success(detail), 200);
  } catch (e) {
    return handleGigError(c, e);
  }
});

gigsRoutes.post("/:id/bids", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = NewBidSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid bid", parsed.error.flatten()), 400);
  }
  try {
    const bid = await gigService.placeBid(c.req.param("id"), u, parsed.data);
    return c.json(success({ bid }), 201);
  } catch (e) {
    return handleGigError(c, e);
  }
});

gigsRoutes.get("/:id/bids", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const items = await gigService.listBidsForProject(c.req.param("id"), u);
    return c.json(success({ items }), 200);
  } catch (e) {
    return handleGigError(c, e);
  }
});

gigsRoutes.post("/bids/:id/award", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const result = await gigService.awardBid(c.req.param("id"), u);
    return c.json(success(result), 200);
  } catch (e) {
    return handleGigError(c, e);
  }
});

// ── escrow / milestones ──────────────────────────────────────────────────

gigsRoutes.post("/:id/milestones", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = NewMilestoneSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid milestone", parsed.error.flatten()), 400);
  }
  try {
    const milestone = await gigService.addMilestone(c.req.param("id"), u, parsed.data);
    return c.json(success({ milestone }), 201);
  } catch (e) {
    return handleGigError(c, e);
  }
});

gigsRoutes.post("/milestones/:id/approve", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const milestone = await gigService.approveMilestone(c.req.param("id"), u);
    return c.json(success({ milestone }), 200);
  } catch (e) {
    return handleGigError(c, e);
  }
});

/**
 * #101 — Release escrowed funds to the awarded bidder + record the 10%
 * platform fee. Idempotent on `(milestone_id, kind='accrual')` via
 * `payoutLedgerService.recordAccrual`. Kept in the route because it owns the
 * payment-provider side-effect; ownership is re-checked here.
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
    .select({ bidderUserId: gigBids.bidderUserId })
    .from(gigBids)
    .where(eq(gigBids.id, project.awardedBidId))
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

  gigService.bumpVersion();
  return c.json(
    success({
      milestone: row,
      payout: { grossCents, platformFeeCents, creatorCents, bidderUserId: bid.bidderUserId },
    }),
    200,
  );
});

gigsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Gig route not found" } }, 404),
);
