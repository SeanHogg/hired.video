/**
 * Recruiter sourcing marketplace — companies post a job with a sourcing fee,
 * external recruiters bid to win the assignment.
 *
 * Endpoints:
 *   GET   /api/sourcing/jobs                        — recruiter browse (auth)
 *   GET   /api/sourcing/my-bids                     — recruiter's own bids
 *   POST  /api/jobs/:jobId/sourcing-bids            — recruiter places a bid
 *   GET   /api/jobs/:jobId/sourcing-bids            — job owner reads bids
 *   PATCH /api/sourcing-bids/:bidId/accept          — owner accepts a bid
 *   PATCH /api/sourcing-bids/:bidId/reject          — owner rejects a bid
 *   PATCH /api/sourcing-bids/:bidId/withdraw        — bidder pulls own bid
 *   PATCH /api/jobs/:jobId/sourcing-config          — owner toggles + sets fee
 *
 * Memory: project_bidding_marketplace — bid direction is COMPANY→RECRUITER.
 * The legacy /api/boards/* surface (recruiter pays to post on a third-party
 * board) stays available; this is a separate route family.
 */
import { Hono } from "hono";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requireJobOwner } from "../services/jobs/jobOwnership.js";

export const sourcingBrowseRoutes = new Hono<{ Variables: Variables }>();
export const sourcingBidsByJobRoutes = new Hono<{ Variables: Variables }>();
export const sourcingBidActionRoutes = new Hono<{ Variables: Variables }>();

const PlaceSourcingBidSchema = z.object({
  bidAmount: z.number().positive(),
  proposalText: z.string().min(1).max(4000),
  durationDays: z.number().int().min(7).max(120).default(30),
});

const SourcingConfigSchema = z.object({
  acceptsSourcingBids: z.boolean(),
  sourcingFeeCents: z.number().int().min(0).optional().nullable(),
  sourcingDeadline: z.string().datetime().optional().nullable(),
  sourcingTerms: z.string().max(8000).optional().nullable(),
});

const RejectSchema = z.object({
  rejectionReason: z.string().max(1000).optional(),
});

function requireAuth(c: any) {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return { error: c.json(error("UNAUTHORIZED", "Authentication required"), 401), userId: null };
  return { error: null, userId };
}

async function loadJobOrFail(c: any, jobId: string) {
  const db = getDb();
  const [job] = await db
    .select({
      id: schema.jobItems.id,
      ownerId: schema.jobItems.postedByUserId,
      acceptsSourcingBids: schema.jobItems.acceptsSourcingBids,
      sourcingFeeCents: schema.jobItems.sourcingFeeCents,
      sourcingDeadline: schema.jobItems.sourcingDeadline,
    })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);
  if (!job) {
    return { job: null, error: c.json(error("NOT_FOUND", "Job not found"), 404) };
  }
  return { job, error: null };
}

// ===========================================================================
// Public-ish browse (auth required) and recruiter-self routes
// ===========================================================================

// GET /api/sourcing/jobs — list jobs currently accepting sourcing bids
sourcingBrowseRoutes.get("/jobs", async (c) => {
  const { error: authError } = requireAuth(c);
  if (authError) return authError;

  const db = getDb();
  const jobs = await db
    .select({
      id: schema.jobItems.id,
      title: schema.jobItems.title,
      company: schema.jobItems.company,
      location: schema.jobItems.location,
      isRemote: schema.jobItems.isRemote,
      salaryMin: schema.jobItems.salaryMin,
      salaryMax: schema.jobItems.salaryMax,
      sourcingFeeCents: schema.jobItems.sourcingFeeCents,
      sourcingDeadline: schema.jobItems.sourcingDeadline,
      sourcingTerms: schema.jobItems.sourcingTerms,
      createdAt: schema.jobItems.createdAt,
    })
    .from(schema.jobItems)
    .where(
      and(
        eq(schema.jobItems.acceptsSourcingBids, true),
        eq(schema.jobItems.isActive, true),
      ),
    )
    .orderBy(desc(schema.jobItems.createdAt))
    .limit(100);

  return c.json(success({ jobs, count: jobs.length }), 200);
});

// GET /api/sourcing/my-bids — recruiter's own bids across jobs
sourcingBrowseRoutes.get("/my-bids", async (c) => {
  const { error: authError, userId } = requireAuth(c);
  if (authError) return authError;

  const db = getDb();
  const bids = await db
    .select({
      bid: schema.boardBids,
      job: {
        id: schema.jobItems.id,
        title: schema.jobItems.title,
        company: schema.jobItems.company,
        sourcingFeeCents: schema.jobItems.sourcingFeeCents,
      },
    })
    .from(schema.boardBids)
    .leftJoin(schema.jobItems, eq(schema.boardBids.jobId, schema.jobItems.id))
    .where(and(eq(schema.boardBids.bidderId, userId!), isNotNull(schema.boardBids.jobId)))
    .orderBy(desc(schema.boardBids.createdAt));

  return c.json(success({ bids, count: bids.length }), 200);
});

// ===========================================================================
// Bids scoped to a job (mounted under /api/jobs/:jobId/sourcing-bids)
// ===========================================================================

// GET /api/jobs/:jobId/sourcing-bids — owner reads bids on their job
sourcingBidsByJobRoutes.get("/", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const bids = await db
    .select()
    .from(schema.boardBids)
    .where(and(eq(schema.boardBids.jobId, jobId), isNotNull(schema.boardBids.jobId)))
    .orderBy(desc(schema.boardBids.createdAt));

  return c.json(success({ bids, count: bids.length }), 200);
});

// POST /api/jobs/:jobId/sourcing-bids — recruiter places a bid
sourcingBidsByJobRoutes.post("/", async (c) => {
  const { error: authError, userId } = requireAuth(c);
  if (authError) return authError;

  const jobId = c.req.param("jobId");
  const { job, error: jobError } = await loadJobOrFail(c, jobId);
  if (jobError) return jobError;
  if (!job!.acceptsSourcingBids) {
    return c.json(error("NOT_ACCEPTING_BIDS", "This job is not currently accepting sourcing bids"), 400);
  }
  if (job!.ownerId === userId) {
    return c.json(error("INVALID_REQUEST", "You cannot bid on your own job"), 400);
  }
  if (job!.sourcingDeadline && new Date(job!.sourcingDeadline) < new Date()) {
    return c.json(error("SOURCING_CLOSED", "The sourcing deadline has passed"), 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = PlaceSourcingBidSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid bid", parsed.error.flatten()), 400);
  }

  const db = getDb();
  // One pending bid per recruiter per job.
  const [existing] = await db
    .select({ id: schema.boardBids.id })
    .from(schema.boardBids)
    .where(
      and(
        eq(schema.boardBids.jobId, jobId),
        eq(schema.boardBids.bidderId, userId!),
        eq(schema.boardBids.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    return c.json(error("BID_EXISTS", "You already have a pending bid on this job"), 409);
  }

  const [bid] = await db
    .insert(schema.boardBids)
    .values({
      // boardId intentionally NULL — sourcing bids are job-scoped.
      jobId,
      bidderId: userId!,
      bidAmount: String(parsed.data.bidAmount),
      durationDays: parsed.data.durationDays,
      proposalText: parsed.data.proposalText,
      status: "pending",
    } as typeof schema.boardBids.$inferInsert)
    .returning();

  return c.json(success(bid), 201);
});

// ===========================================================================
// Bid actions (mounted under /api/sourcing-bids/:bidId)
// ===========================================================================

async function loadBidOrFail(c: any, bidId: string) {
  const db = getDb();
  const [bid] = await db
    .select()
    .from(schema.boardBids)
    .where(eq(schema.boardBids.id, bidId))
    .limit(1);
  if (!bid) return { bid: null, error: c.json(error("NOT_FOUND", "Bid not found"), 404) };
  return { bid, error: null };
}

// PATCH /api/sourcing-bids/:bidId/accept
sourcingBidActionRoutes.patch("/:bidId/accept", async (c) => {
  const { error: authError, userId } = requireAuth(c);
  if (authError) return authError;
  const bidId = c.req.param("bidId");
  const { bid, error: bidError } = await loadBidOrFail(c, bidId);
  if (bidError) return bidError;
  if (!bid!.jobId) return c.json(error("INVALID_BID", "This bid is not a sourcing bid"), 400);

  const { denied } = await requireJobOwner(c, bid!.jobId);
  if (denied) return denied;

  const db = getDb();
  const [updated] = await db
    .update(schema.boardBids)
    .set({
      status: "accepted",
      approvedAt: new Date(),
      approvedByUserId: userId!,
      updatedAt: new Date(),
    } as Partial<typeof schema.boardBids.$inferInsert>)
    .where(eq(schema.boardBids.id, bidId))
    .returning();

  // Auto-reject competing pending bids on the same job (one winner).
  await db
    .update(schema.boardBids)
    .set({
      status: "rejected",
      rejectionReason: "Another bid was accepted",
      updatedAt: new Date(),
    } as Partial<typeof schema.boardBids.$inferInsert>)
    .where(
      and(
        eq(schema.boardBids.jobId, bid!.jobId),
        eq(schema.boardBids.status, "pending"),
        sql`${schema.boardBids.id} <> ${bidId}`,
      ),
    );

  return c.json(success(updated), 200);
});

// PATCH /api/sourcing-bids/:bidId/reject
sourcingBidActionRoutes.patch("/:bidId/reject", async (c) => {
  const { error: authError, userId } = requireAuth(c);
  if (authError) return authError;
  const bidId = c.req.param("bidId");
  const { bid, error: bidError } = await loadBidOrFail(c, bidId);
  if (bidError) return bidError;
  if (!bid!.jobId) return c.json(error("INVALID_BID", "This bid is not a sourcing bid"), 400);

  const { denied } = await requireJobOwner(c, bid!.jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => ({}));
  const parsed = RejectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid reject", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.boardBids)
    .set({
      status: "rejected",
      rejectionReason: parsed.data.rejectionReason ?? null,
      updatedAt: new Date(),
    } as Partial<typeof schema.boardBids.$inferInsert>)
    .where(eq(schema.boardBids.id, bidId))
    .returning();

  return c.json(success(updated), 200);
});

// PATCH /api/sourcing-bids/:bidId/withdraw — bidder pulls their own bid
sourcingBidActionRoutes.patch("/:bidId/withdraw", async (c) => {
  const { error: authError, userId } = requireAuth(c);
  if (authError) return authError;
  const bidId = c.req.param("bidId");
  const { bid, error: bidError } = await loadBidOrFail(c, bidId);
  if (bidError) return bidError;

  if (bid!.bidderId !== userId) {
    return c.json(error("FORBIDDEN", "Only the bidder can withdraw"), 403);
  }
  if (bid!.status !== "pending") {
    return c.json(error("INVALID_STATE", "Only pending bids can be withdrawn"), 400);
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.boardBids)
    .set({ status: "withdrawn", updatedAt: new Date() } as Partial<typeof schema.boardBids.$inferInsert>)
    .where(eq(schema.boardBids.id, bidId))
    .returning();

  return c.json(success(updated), 200);
});

// ===========================================================================
// GET /api/jobs/:jobId/sourcing-bids/config — owner reads current config
// PATCH /api/jobs/:jobId/sourcing-bids/config — owner toggles + sets fee
// (Mounted under sourcingBidsByJobRoutes since they're owner-only + job-scoped.)
// ===========================================================================
sourcingBidsByJobRoutes.get("/config", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const [row] = await db
    .select({
      acceptsSourcingBids: schema.jobItems.acceptsSourcingBids,
      sourcingFeeCents: schema.jobItems.sourcingFeeCents,
      sourcingDeadline: schema.jobItems.sourcingDeadline,
      sourcingTerms: schema.jobItems.sourcingTerms,
    })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);

  return c.json(success(row ?? { acceptsSourcingBids: false, sourcingFeeCents: null, sourcingDeadline: null, sourcingTerms: null }), 200);
});

sourcingBidsByJobRoutes.patch("/config", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const parsed = SourcingConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid sourcing config", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.jobItems)
    .set({
      acceptsSourcingBids: parsed.data.acceptsSourcingBids,
      sourcingFeeCents: parsed.data.sourcingFeeCents ?? null,
      sourcingDeadline: parsed.data.sourcingDeadline ? new Date(parsed.data.sourcingDeadline) : null,
      sourcingTerms: parsed.data.sourcingTerms ?? null,
      updatedAt: new Date(),
    } as Partial<typeof schema.jobItems.$inferInsert>)
    .where(eq(schema.jobItems.id, jobId))
    .returning({
      id: schema.jobItems.id,
      acceptsSourcingBids: schema.jobItems.acceptsSourcingBids,
      sourcingFeeCents: schema.jobItems.sourcingFeeCents,
      sourcingDeadline: schema.jobItems.sourcingDeadline,
      sourcingTerms: schema.jobItems.sourcingTerms,
    });

  return c.json(success(updated), 200);
});
