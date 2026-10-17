import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { isAdminRole } from "../middleware/superAdmin.js";
import { buildRepos } from "../repositories/index.js";
import { emitNotification } from "../services/notifications/notificationService.js";

export const exclusiveBoardRoutes = new Hono<AppEnv>();

const PlaceBidSchema = z.object({
  boardId: UuidLikeSchema,
  jobId: UuidLikeSchema.optional(),
  bidAmount: z.number().positive(),
  durationDays: z.number().int().min(7).max(90).default(30),
  message: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/boards/exclusive — list available exclusive boards (Pro only)
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.get("/exclusive", requirePro("Exclusive Job Boards"), async (c) => {
  const db = getDb();

  const boards = await db
    .select({
      id: schema.exclusiveBoards.id,
      name: schema.exclusiveBoards.name,
      description: schema.exclusiveBoards.description,
      logoUrl: schema.exclusiveBoards.logoUrl,
      category: schema.exclusiveBoards.category,
      audienceSize: schema.exclusiveBoards.audienceSize,
      typicalTimeToFill: schema.exclusiveBoards.typicalTimeToFill,
      pricePerPost: schema.exclusiveBoards.pricePerPost,
      currency: schema.exclusiveBoards.currency,
    })
    .from(schema.exclusiveBoards)
    .where(and(eq(schema.exclusiveBoards.isActive, true), eq(schema.exclusiveBoards.isProOnly, true)))
    .orderBy(schema.exclusiveBoards.name);

  return c.json(success(boards), 200);
});

// ---------------------------------------------------------------------------
// GET /api/boards/exclusive/:id — board detail
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.get("/exclusive/:id", requirePro("Exclusive Job Boards"), async (c) => {
  const db = getDb();

  const [board] = await db
    .select()
    .from(schema.exclusiveBoards)
    .where(and(eq(schema.exclusiveBoards.id, c.req.param("id")), eq(schema.exclusiveBoards.isActive, true)))
    .limit(1);

  if (!board) return c.json(error("NOT_FOUND", "Board not found"), 404);
  return c.json(success(board), 200);
});

// ---------------------------------------------------------------------------
// POST /api/boards/bids — place a bid to post a job on an exclusive board
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.post("/bids", requirePro("Exclusive Job Boards"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = PlaceBidSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();

  // Confirm board exists and is pro
  const [board] = await db
    .select({ id: schema.exclusiveBoards.id, pricePerPost: schema.exclusiveBoards.pricePerPost, currency: schema.exclusiveBoards.currency })
    .from(schema.exclusiveBoards)
    .where(and(eq(schema.exclusiveBoards.id, parsed.data.boardId), eq(schema.exclusiveBoards.isActive, true)))
    .limit(1);

  if (!board) return c.json(error("NOT_FOUND", "Board not found"), 404);

  const [bid] = await db
    .insert(schema.boardBids)
    .values({
      boardId: parsed.data.boardId,
      jobId: parsed.data.jobId,
      bidderId: userId,
      bidAmount: String(parsed.data.bidAmount),
      currency: board.currency,
      durationDays: parsed.data.durationDays,
      message: parsed.data.message,
      status: "pending",
    } as any)
    .returning();

  return c.json(success(bid), 201);
});

// ---------------------------------------------------------------------------
// GET /api/boards/bids — my bids
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.get("/bids", requirePro("Exclusive Job Boards"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const bids = await db
    .select()
    .from(schema.boardBids)
    .where(eq(schema.boardBids.bidderId, userId))
    .orderBy(desc(schema.boardBids.createdAt));

  return c.json(success(bids), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/boards/bids/:id — withdraw a pending bid
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.delete("/bids/:id", requirePro("Exclusive Job Boards"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [bid] = await db
    .select({ id: schema.boardBids.id, status: schema.boardBids.status })
    .from(schema.boardBids)
    .where(and(eq(schema.boardBids.id, c.req.param("id")), eq(schema.boardBids.bidderId, userId)))
    .limit(1);

  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);
  if (bid.status !== "pending") return c.json(error("CONFLICT", "Only pending bids can be withdrawn"), 409);

  await db.update(schema.boardBids).set({ status: "rejected", updatedAt: new Date() } as any).where(eq(schema.boardBids.id, bid.id));
  return c.json(success({ withdrawn: true }), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/boards/bids/:id/accept — admin/board-owner accepts a bid (#20)
// Activates the job posting on the exclusive board for the bid duration.
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.patch("/bids/:id/accept", requirePro("Exclusive Job Boards"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [bid] = await db
    .select()
    .from(schema.boardBids)
    .where(eq(schema.boardBids.id, c.req.param("id")))
    .limit(1);

  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);

  // Only admins/superadmins can accept bids on system-managed boards
  if (!isAdminRole(c.var.user)) {
    return c.json(error("FORBIDDEN", "Only admins can accept bids"), 403);
  }
  if (bid.status !== "pending") return c.json(error("CONFLICT", "Only pending bids can be accepted"), 409);

  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + (bid.durationDays ?? 30) * 24 * 60 * 60 * 1000);

  // Accept the bid and create a job board posting
  const [updatedBid] = await db
    .update(schema.boardBids)
    .set({ status: "accepted", updatedAt: new Date() } as any)
    .where(eq(schema.boardBids.id, bid.id))
    .returning() as any[];

  // Activate the job posting on the board
  if (bid.jobId) {
    await db.insert(schema.jobBoardPostings).values({
      boardId: bid.boardId,
      jobId: bid.jobId,
      postedByUserId: bid.bidderId,
      bidId: bid.id,
      status: "active",
      startsAt,
      expiresAt,
      pricePaid: bid.bidAmount,
      currency: bid.currency,
    } as any).catch(() => undefined);
  }

  // Notify the bidder
  await emitNotification(
    { repos: buildRepos(db) },
    {
      recipientIds: [bid.bidderId],
      type: "bid_accepted",
      actor: null,
      title: "Bid accepted",
      message: `Your bid was accepted! Your job posting is now live on the exclusive board for ${bid.durationDays ?? 30} days.`,
      extraData: { bidId: bid.id, boardId: bid.boardId },
    },
  ).catch(() => undefined);

  return c.json(success({ bid: updatedBid, expiresAt: expiresAt.toISOString() }), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/boards/bids/:id/reject — board-owner rejects a bid (#20)
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.patch("/bids/:id/reject", requirePro("Exclusive Job Boards"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [bid] = await db
    .select()
    .from(schema.boardBids)
    .where(eq(schema.boardBids.id, c.req.param("id")))
    .limit(1);

  if (!bid) return c.json(error("NOT_FOUND", "Bid not found"), 404);

  if (!isAdminRole(c.var.user)) {
    return c.json(error("FORBIDDEN", "Only admins can reject bids"), 403);
  }
  if (bid.status !== "pending") return c.json(error("CONFLICT", "Only pending bids can be rejected"), 409);

  const body = await c.req.json().catch(() => ({}));
  const [updatedBid] = await db
    .update(schema.boardBids)
    .set({ status: "rejected", updatedAt: new Date() } as any)
    .where(eq(schema.boardBids.id, bid.id))
    .returning();

  // Notify the bidder
  await emitNotification(
    { repos: buildRepos(db) },
    {
      recipientIds: [bid.bidderId],
      type: "bid_rejected",
      actor: null,
      title: "Bid not accepted",
      message: typeof body.reason === "string" ? body.reason : "Your bid was not accepted for this exclusive board.",
      extraData: { bidId: bid.id, boardId: bid.boardId },
    },
  ).catch(() => undefined);

  return c.json(success(updatedBid), 200);
});

exclusiveBoardRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Board route not found" } }, 404),
);
