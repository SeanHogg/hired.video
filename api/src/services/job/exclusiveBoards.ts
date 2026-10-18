/**
 * Exclusive job-board use cases (#20) behind `/api/boards`: Pro users browse
 * boards and bid to post a job; staff accept (activating a time-boxed
 * posting) or reject; bidders may withdraw a pending bid. Only board-direction
 * bids are handled here — sourcing bids live in SourcingListingService.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos } from "../../repositories/index.js";
import {
  ExclusiveBoardsRepository,
  type BoardBidRow,
  type ExclusiveBoardRow,
  type ExclusiveBoardSummary,
} from "../../repositories/exclusiveBoardsRepository.js";
import { emitNotification } from "../notifications/notificationService.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const repo = () => new ExclusiveBoardsRepository(getDb());

const boardNotFound = () => new DomainError(404, "NOT_FOUND", "Board not found");
const bidNotFound = () => new DomainError(404, "NOT_FOUND", "Bid not found");

export interface PlaceBidInput {
  boardId: string;
  jobId?: string;
  bidAmount: number;
  durationDays: number;
  message?: string;
}

export function listExclusiveBoards(): Promise<ExclusiveBoardSummary[]> {
  return repo().listActiveProBoards();
}

export async function getExclusiveBoard(id: string): Promise<ExclusiveBoardRow> {
  const board = await repo().findActiveBoard(id);
  if (!board) throw boardNotFound();
  return board;
}

export async function placeBoardBid(bidderId: string, input: PlaceBidInput): Promise<BoardBidRow> {
  const r = repo();
  const board = await r.findActiveBoard(input.boardId);
  if (!board) throw boardNotFound();
  return r.insertBid({
    boardId: input.boardId,
    jobId: input.jobId,
    bidderId,
    bidAmount: String(input.bidAmount),
    currency: board.currency,
    durationDays: input.durationDays,
    message: input.message,
    status: "pending",
  });
}

export function listMyBoardBids(bidderId: string): Promise<BoardBidRow[]> {
  return repo().listBoardBidsByBidder(bidderId);
}

export async function withdrawBoardBid(bidderId: string, bidId: string): Promise<void> {
  const r = repo();
  const bid = await r.findBoardBid(bidId, bidderId);
  if (!bid) throw bidNotFound();
  if (bid.status !== "pending") throw new DomainError(409, "CONFLICT", "Only pending bids can be withdrawn");
  await r.setBidStatus(bid.id, "withdrawn");
}

/** Loads a pending board bid for a staff decision (404 → 403 → 409, the
 *  route's original check order). */
async function loadForDecision(r: ExclusiveBoardsRepository, bidId: string, isAdmin: boolean, verb: "accept" | "reject") {
  const bid = await r.findBoardBid(bidId);
  if (!bid) throw bidNotFound();
  if (!isAdmin) throw new DomainError(403, "FORBIDDEN", `Only admins can ${verb} bids`);
  if (bid.status !== "pending") throw new DomainError(409, "CONFLICT", `Only pending bids can be ${verb}ed`);
  return bid;
}

function notifyBidder(bid: BoardBidRow, type: "bid_accepted" | "bid_rejected", title: string, message: string) {
  return emitNotification(
    { repos: buildRepos(getDb()) },
    {
      recipientIds: [bid.bidderId],
      type,
      actor: null,
      title,
      message,
      extraData: { bidId: bid.id, boardId: bid.boardId },
    },
  ).catch(() => undefined);
}

/** Accepts a bid and activates its job posting on the board for the bid duration. */
export async function acceptBoardBid(bidId: string, isAdmin: boolean): Promise<{ bid: BoardBidRow | null; expiresAt: string }> {
  const r = repo();
  const bid = await loadForDecision(r, bidId, isAdmin, "accept");
  const durationDays = bid.durationDays ?? 30;
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + durationDays * DAY_MS);

  const updatedBid = await r.setBidStatus(bid.id, "accepted");

  if (bid.jobId && bid.boardId) {
    await r
      .insertPosting({ boardId: bid.boardId, jobId: bid.jobId, status: "active", postedAt: startsAt, expiresAt })
      .catch(() => undefined);
  }

  await notifyBidder(
    bid,
    "bid_accepted",
    "Bid accepted",
    `Your bid was accepted! Your job posting is now live on the exclusive board for ${durationDays} days.`,
  );
  return { bid: updatedBid, expiresAt: expiresAt.toISOString() };
}

export async function rejectBoardBid(bidId: string, isAdmin: boolean, reason: unknown): Promise<BoardBidRow | null> {
  const r = repo();
  const bid = await loadForDecision(r, bidId, isAdmin, "reject");
  const updatedBid = await r.setBidStatus(bid.id, "rejected");
  await notifyBidder(
    bid,
    "bid_rejected",
    "Bid not accepted",
    typeof reason === "string" ? reason : "Your bid was not accepted for this exclusive board.",
  );
  return updatedBid;
}
