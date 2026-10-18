import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { isAdminRole } from "../middleware/superAdmin.js";
import {
  acceptBoardBid,
  getExclusiveBoard,
  listExclusiveBoards,
  listMyBoardBids,
  placeBoardBid,
  rejectBoardBid,
  withdrawBoardBid,
} from "../services/job/exclusiveBoards.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const exclusiveBoardRoutes = new Hono<AppEnv>();

const PlaceBidSchema = z.object({
  boardId: UuidLikeSchema,
  jobId: UuidLikeSchema.optional(),
  bidAmount: z.number().positive(),
  durationDays: z.number().int().min(7).max(90).default(30),
  message: z.string().max(1000).optional(),
});

// GET /api/boards/exclusive — list available exclusive boards (Pro only)
exclusiveBoardRoutes.get("/exclusive", requirePro("Exclusive Job Boards"), async (c) => {
  return c.json(success(await listExclusiveBoards()), 200);
});

// GET /api/boards/exclusive/:id — board detail
exclusiveBoardRoutes.get("/exclusive/:id", requirePro("Exclusive Job Boards"), async (c) => {
  return c.json(success(await getExclusiveBoard(c.req.param("id"))), 200);
});

// POST /api/boards/bids — place a bid to post a job on an exclusive board
exclusiveBoardRoutes.post("/bids", requirePro("Exclusive Job Boards"), validateJson(PlaceBidSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const bid = await placeBoardBid(userId, c.req.valid("json"));
  return c.json(success(bid), 201);
});

// GET /api/boards/bids — my bids
exclusiveBoardRoutes.get("/bids", requirePro("Exclusive Job Boards"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listMyBoardBids(userId)), 200);
});

// DELETE /api/boards/bids/:id — withdraw a pending bid
exclusiveBoardRoutes.delete("/bids/:id", requirePro("Exclusive Job Boards"), async (c) => {
  const userId = requireUser(c);
  await withdrawBoardBid(userId, c.req.param("id"));
  return c.json(success({ withdrawn: true }), 200);
});

// PATCH /api/boards/bids/:id/accept — admin accepts a bid (#20); activates the
// job posting on the exclusive board for the bid duration.
exclusiveBoardRoutes.patch("/bids/:id/accept", requirePro("Exclusive Job Boards"), async (c) => {
  requireUser(c);
  const result = await acceptBoardBid(c.req.param("id"), isAdminRole(c.var.user));
  return c.json(success(result), 200);
});

// PATCH /api/boards/bids/:id/reject — admin rejects a bid (#20)
exclusiveBoardRoutes.patch("/bids/:id/reject", requirePro("Exclusive Job Boards"), async (c) => {
  requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const updated = await rejectBoardBid(c.req.param("id"), isAdminRole(c.var.user), (body as { reason?: unknown } | null)?.reason);
  return c.json(success(updated), 200);
});
