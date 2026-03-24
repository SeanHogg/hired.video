import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePremium } from "../middleware/tierEnforcement.js";

export const exclusiveBoardRoutes = new Hono<{ Variables: Variables }>();

const PlaceBidSchema = z.object({
  boardId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  bidAmount: z.number().positive(),
  durationDays: z.number().int().min(7).max(90).default(30),
  message: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/boards/exclusive — list available exclusive boards (Premium only)
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.get("/exclusive", requirePremium("Exclusive Job Boards"), async (c) => {
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
    .where(and(eq(schema.exclusiveBoards.isActive, true), eq(schema.exclusiveBoards.isPremiumOnly, true)))
    .orderBy(schema.exclusiveBoards.name);

  return c.json(success(boards), 200);
});

// ---------------------------------------------------------------------------
// GET /api/boards/exclusive/:id — board detail
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.get("/exclusive/:id", requirePremium("Exclusive Job Boards"), async (c) => {
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
exclusiveBoardRoutes.post("/bids", requirePremium("Exclusive Job Boards"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = PlaceBidSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();

  // Confirm board exists and is premium
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
    })
    .returning();

  return c.json(success(bid), 201);
});

// ---------------------------------------------------------------------------
// GET /api/boards/bids — my bids
// ---------------------------------------------------------------------------
exclusiveBoardRoutes.get("/bids", requirePremium("Exclusive Job Boards"), async (c) => {
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
exclusiveBoardRoutes.delete("/bids/:id", requirePremium("Exclusive Job Boards"), async (c) => {
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

  await db.update(schema.boardBids).set({ status: "rejected", updatedAt: new Date() }).where(eq(schema.boardBids.id, bid.id));
  return c.json(success({ withdrawn: true }), 200);
});

exclusiveBoardRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Board route not found" } }, 404),
);
