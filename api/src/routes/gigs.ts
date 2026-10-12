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
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { gigService, GigError } from "../services/gigs/GigService.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";

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
 * platform fee. Owner-gated, milestone must be 'approved'. The escrow-release
 * + ledger side-effect lives in GigService (shared with dispute resolution).
 */
gigsRoutes.post("/milestones/:id/release", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const { milestone, payout, bidderUserId } = await gigService.releaseMilestoneEscrow(c.req.param("id"), u);
    return c.json(success({ milestone, payout: { ...payout, bidderUserId } }), 200);
  } catch (e) {
    return handleGigError(c, e);
  }
});

// ── disputes (#1768) ───────────────────────────────────────────────────────

const OpenDisputeSchema = z.object({ reason: z.string().min(10).max(5_000) });
const DisputeEventSchema = z.object({
  kind: z.enum(["evidence", "comment"]).default("comment"),
  body: z.string().min(1).max(5_000),
  attachments: z.array(z.object({ url: z.string().url(), name: z.string().max(255).optional() })).max(10).default([]),
});
const ResolveDisputeSchema = z.object({
  resolution: z.enum(["release", "refund"]),
  note: z.string().min(1).max(5_000),
});

// Open a dispute on a milestone (poster or awarded creator).
gigsRoutes.post("/milestones/:id/dispute", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = OpenDisputeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "A dispute reason (≥10 chars) is required", parsed.error.flatten()), 400);
  }
  try {
    const dispute = await gigService.openDispute(c.req.param("id"), u, parsed.data.reason);
    return c.json(success({ dispute }), 201);
  } catch (e) {
    return handleGigError(c, e);
  }
});

// Read the latest dispute + timeline for a milestone (participants or mediator).
gigsRoutes.get("/milestones/:id/dispute", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const detail = await gigService.getDisputeForMilestone(c.req.param("id"), u, isSuperAdmin(c.var.user));
    return c.json(success(detail), 200);
  } catch (e) {
    return handleGigError(c, e);
  }
});

// Append evidence / comment to an open dispute (participants).
gigsRoutes.post("/disputes/:id/events", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = DisputeEventSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid dispute event", parsed.error.flatten()), 400);
  }
  try {
    const event = await gigService.addDisputeEvent(
      c.req.param("id"),
      u,
      parsed.data.kind,
      parsed.data.body,
      parsed.data.attachments,
    );
    return c.json(success({ event }), 201);
  } catch (e) {
    return handleGigError(c, e);
  }
});

// Mediator decision — SuperAdmin only.
gigsRoutes.post("/disputes/:id/resolve", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(c.var.user)) return c.json(error("FORBIDDEN", "Mediator (SuperAdmin) only"), 403);
  const parsed = ResolveDisputeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid resolution", parsed.error.flatten()), 400);
  }
  try {
    const result = await gigService.resolveDispute(c.req.param("id"), u, parsed.data.resolution, parsed.data.note);
    return c.json(success(result), 200);
  } catch (e) {
    return handleGigError(c, e);
  }
});

gigsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Gig route not found" } }, 404),
);
