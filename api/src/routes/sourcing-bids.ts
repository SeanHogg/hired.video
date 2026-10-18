/**
 * Recruiter sourcing marketplace routes — thin transport layer over
 * SourcingListingService. Companies post jobs with a fee, external recruiters
 * bid to win the assignment.
 *
 * Endpoint summary:
 *   GET   /api/sourcing/jobs                            — recruiter browse (auth)
 *   GET   /api/sourcing/my-bids                         — recruiter's own bids
 *   POST  /api/jobs/:jobId/sourcing-bids                — recruiter places a bid
 *   GET   /api/jobs/:jobId/sourcing-bids                — owner reads bids
 *   GET   /api/jobs/:jobId/sourcing-bids/config         — owner reads listing config
 *   PATCH /api/jobs/:jobId/sourcing-bids/config         — owner upserts listing
 *   PATCH /api/sourcing-bids/:bidId/accept              — owner accepts a bid
 *   PATCH /api/sourcing-bids/:bidId/reject              — owner rejects a bid
 *   PATCH /api/sourcing-bids/:bidId/withdraw            — bidder pulls own bid
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requireJobOwner } from "../services/jobs/jobOwnership.js";
import * as listings from "../services/recruiter-marketplace/SourcingListingService.js";
import { logger } from "../lib/logger.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const sourcingBrowseRoutes = new Hono<AppEnv>();
export const sourcingBidsByJobRoutes = new Hono<AppEnv>();
export const sourcingBidActionRoutes = new Hono<AppEnv>();

const PlaceSourcingBidSchema = z.object({
  bidAmount: z.number().positive(),
  proposalText: z.string().min(1).max(4000),
  durationDays: z.number().int().min(7).max(120).default(30),
});

const SourcingConfigSchema = z.object({
  acceptsBids: z.boolean(),
  feeCents: z.number().int().min(0).optional().nullable(),
  deadline: z.string().datetime().optional().nullable(),
  terms: z.string().max(8000).optional().nullable(),
});

const RejectSchema = z.object({
  rejectionReason: z.string().max(1000).optional(),
});

// ===========================================================================
// Browse + recruiter-self
// ===========================================================================

sourcingBrowseRoutes.get("/jobs", async (c) => {
  const userId = requireUser(c);
  const jobs = await listings.listOpenSourcingJobs();
  return c.json(success({ jobs, count: jobs.length }), 200);
});

sourcingBrowseRoutes.get("/my-bids", async (c) => {
  const userId = requireUser(c);
  const bids = await listings.listMyBids(userId);
  return c.json(success({ bids, count: bids.length }), 200);
});

// ===========================================================================
// /api/jobs/:jobId/sourcing-bids
// ===========================================================================

sourcingBidsByJobRoutes.get("/", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;
  const bids = await listings.listBidsForJob(jobId);
  return c.json(success({ bids, count: bids.length }), 200);
});

sourcingBidsByJobRoutes.post("/", validateJson(PlaceSourcingBidSchema, (e) => error("VALIDATION_ERROR", "Invalid bid", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const jobId = c.req.param("jobId");

  const body = c.req.valid("json");
  const bid = await listings.placeBidOnJob({
    jobId,
    bidderId: userId,
    bidAmount: body.bidAmount,
    proposalText: body.proposalText,
    durationDays: body.durationDays,
  });
  return c.json(success(bid), 201);
});

sourcingBidsByJobRoutes.get("/config", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;
  return c.json(success(await listings.getConfig(jobId)), 200);
});

sourcingBidsByJobRoutes.patch("/config", validateJson(SourcingConfigSchema, (e) => error("VALIDATION_ERROR", "Invalid sourcing config", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = c.req.valid("json");
  const updated = await listings.upsertConfig({
    jobId,
    acceptsBids: body.acceptsBids,
    feeCents: body.feeCents ?? null,
    deadline: body.deadline ?? null,
    terms: body.terms ?? null,
    actorUserId: userId,
  });
  return c.json(success(updated), 200);
});

// ===========================================================================
// /api/sourcing-bids/:bidId
// ===========================================================================

sourcingBidActionRoutes.patch("/:bidId/accept", async (c) => {
  const userId = requireUser(c);
  const bidId = c.req.param("bidId");
  const bid = await listings.getBid(bidId);
  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);
  if (!bid.jobId) return c.json(error("INVALID_BID", "This bid is not a sourcing bid"), 400);

  const { denied } = await requireJobOwner(c, bid.jobId);
  if (denied) return denied;

  const accepted = await listings.acceptBid(bidId, userId);

  // Credit the bid WINNER (the recruiter `bid.bidderId`), who is NOT the
  // caller here — the job owner is the one accepting. Role is resolved from
  // the db via awardWithRoleLookup since we can't read the winner's JWT.
  // RefId = bid id makes the award idempotent across re-accepts. Best-effort.
  try {
    const { gamificationFromContext } = await import(
      "../domains/gamification/with-gamification.js"
    );
    const { ACTIONS } = await import("../domains/gamification/index.js");
    await gamificationFromContext(c).awardWithRoleLookup(ACTIONS.BID_WON, {
      userId: bid.bidderId,
      refId: bid.id,
      refType: "sourcing_bid",
    });
  } catch (e) {
    logger.warn("[gamification] bid-won failed", {
      bidId: bid.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return c.json(success(accepted), 200);
});

sourcingBidActionRoutes.patch("/:bidId/reject", validateJson(RejectSchema, (e) => error("VALIDATION_ERROR", "Invalid reject", e.flatten())), async (c) => {
  const userId = requireUser(c);
  const bidId = c.req.param("bidId");
  const bid = await listings.getBid(bidId);
  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);
  if (!bid.jobId) return c.json(error("INVALID_BID", "This bid is not a sourcing bid"), 400);

  const { denied } = await requireJobOwner(c, bid.jobId);
  if (denied) return denied;

  const body = c.req.valid("json");
  return c.json(success(await listings.rejectBid(bidId, body.rejectionReason ?? null)), 200);
});

sourcingBidActionRoutes.patch("/:bidId/withdraw", async (c) => {
  const userId = requireUser(c);
  const bidId = c.req.param("bidId");
  const bid = await listings.getBid(bidId);
  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);

  if (bid.bidderId !== userId) {
    return c.json(error("FORBIDDEN", "Only the bidder can withdraw"), 403);
  }
  if (bid.status !== "pending") {
    return c.json(error("INVALID_STATE", "Only pending bids can be withdrawn"), 400);
  }
  return c.json(success(await listings.withdrawBid(bidId)), 200);
});
