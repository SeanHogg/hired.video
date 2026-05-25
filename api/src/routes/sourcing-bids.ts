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
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { requireJobOwner } from "../services/jobs/jobOwnership.js";
import * as listings from "../services/recruiter-marketplace/SourcingListingService.js";

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

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// ===========================================================================
// Browse + recruiter-self
// ===========================================================================

sourcingBrowseRoutes.get("/jobs", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const jobs = await listings.listOpenSourcingJobs();
  return c.json(success({ jobs, count: jobs.length }), 200);
});

sourcingBrowseRoutes.get("/my-bids", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
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

sourcingBidsByJobRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const jobId = c.req.param("jobId");

  // Look up the job's owner so SourcingListingService can validate "no
  // self-bids" without re-querying.
  const db = getDb();
  const [job] = await db
    .select({ ownerId: schema.jobItems.postedByUserId })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);

  const body = await c.req.json().catch(() => null);
  const parsed = PlaceSourcingBidSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid bid", parsed.error.flatten()), 400);
  }

  const result = await listings.placeBid(
    {
      jobId,
      bidderId: userId,
      bidAmount: parsed.data.bidAmount,
      proposalText: parsed.data.proposalText,
      durationDays: parsed.data.durationDays,
    },
    job.ownerId,
  );

  if ("reason" in result) {
    type BidFailure = "NOT_OPEN" | "DEADLINE_PASSED" | "OWN_JOB" | "BID_EXISTS";
    const messages: Record<BidFailure, [string, number]> = {
      NOT_OPEN: ["This job is not currently accepting sourcing bids", 400],
      DEADLINE_PASSED: ["The sourcing deadline has passed", 400],
      OWN_JOB: ["You cannot bid on your own job", 400],
      BID_EXISTS: ["You already have a pending bid on this job", 409],
    };
    const reason = result.reason;
    const [msg, status] = messages[reason];
    return c.json(error(reason, msg), status as 400 | 409);
  }
  return c.json(success(result.bid), 201);
});

sourcingBidsByJobRoutes.get("/config", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;
  return c.json(success(await listings.getConfig(jobId)), 200);
});

sourcingBidsByJobRoutes.patch("/config", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const parsed = SourcingConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid sourcing config", parsed.error.flatten()), 400);
  }
  const updated = await listings.upsertConfig({
    jobId,
    acceptsBids: parsed.data.acceptsBids,
    feeCents: parsed.data.feeCents ?? null,
    deadline: parsed.data.deadline ?? null,
    terms: parsed.data.terms ?? null,
    actorUserId: userId,
  });
  return c.json(success(updated), 200);
});

// ===========================================================================
// /api/sourcing-bids/:bidId
// ===========================================================================

sourcingBidActionRoutes.patch("/:bidId/accept", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const bidId = c.req.param("bidId");
  const bid = await listings.getBid(bidId);
  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);
  if (!bid.jobId) return c.json(error("INVALID_BID", "This bid is not a sourcing bid"), 400);

  const { denied } = await requireJobOwner(c, bid.jobId);
  if (denied) return denied;

  return c.json(success(await listings.acceptBid(bidId, userId)), 200);
});

sourcingBidActionRoutes.patch("/:bidId/reject", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const bidId = c.req.param("bidId");
  const bid = await listings.getBid(bidId);
  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);
  if (!bid.jobId) return c.json(error("INVALID_BID", "This bid is not a sourcing bid"), 400);

  const { denied } = await requireJobOwner(c, bid.jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => ({}));
  const parsed = RejectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid reject", parsed.error.flatten()), 400);
  }
  return c.json(success(await listings.rejectBid(bidId, parsed.data.rejectionReason ?? null)), 200);
});

sourcingBidActionRoutes.patch("/:bidId/withdraw", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
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
