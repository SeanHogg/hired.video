/**
 * ExclusiveBoardsRepository — the Pro exclusive-board aggregate:
 * `exclusive_boards`, the board-direction rows of `board_bids` (boardId NOT
 * NULL; sourcing-direction bids are owned by SourcingListingService), and the
 * `job_board_postings` an accepted bid activates.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { schema } from "../db/index.js";

const { exclusiveBoards, boardBids, jobBoardPostings } = schema;

export type DbLike = any;

export type ExclusiveBoardRow = typeof exclusiveBoards.$inferSelect;
export type BoardBidRow = typeof boardBids.$inferSelect;
export type BoardBidInsert = typeof boardBids.$inferInsert;
export type JobBoardPostingInsert = typeof jobBoardPostings.$inferInsert;

export interface ExclusiveBoardSummary {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  category: string | null;
  audienceSize: number | null;
  typicalTimeToFill: number | null;
  pricePerPost: string;
  currency: string;
}

export interface IExclusiveBoardsRepository {
  listActiveProBoards(): Promise<ExclusiveBoardSummary[]>;
  findActiveBoard(id: string): Promise<ExclusiveBoardRow | null>;
  insertBid(input: BoardBidInsert): Promise<BoardBidRow>;
  listBoardBidsByBidder(bidderId: string): Promise<BoardBidRow[]>;
  findBoardBid(id: string, bidderId?: string): Promise<BoardBidRow | null>;
  setBidStatus(id: string, status: string): Promise<BoardBidRow | null>;
  insertPosting(input: JobBoardPostingInsert): Promise<void>;
}

export class ExclusiveBoardsRepository implements IExclusiveBoardsRepository {
  constructor(private readonly db: DbLike) {}

  async listActiveProBoards(): Promise<ExclusiveBoardSummary[]> {
    return (await this.db
      .select({
        id: exclusiveBoards.id,
        name: exclusiveBoards.name,
        description: exclusiveBoards.description,
        logoUrl: exclusiveBoards.logoUrl,
        category: exclusiveBoards.category,
        audienceSize: exclusiveBoards.audienceSize,
        typicalTimeToFill: exclusiveBoards.typicalTimeToFill,
        pricePerPost: exclusiveBoards.pricePerPost,
        currency: exclusiveBoards.currency,
      })
      .from(exclusiveBoards)
      .where(and(eq(exclusiveBoards.isActive, true), eq(exclusiveBoards.isProOnly, true)))
      .orderBy(exclusiveBoards.name)) as ExclusiveBoardSummary[];
  }

  async findActiveBoard(id: string): Promise<ExclusiveBoardRow | null> {
    const [row] = await this.db
      .select()
      .from(exclusiveBoards)
      .where(and(eq(exclusiveBoards.id, id), eq(exclusiveBoards.isActive, true)))
      .limit(1);
    return (row as ExclusiveBoardRow) ?? null;
  }

  async insertBid(input: BoardBidInsert): Promise<BoardBidRow> {
    const [row] = await this.db.insert(boardBids).values(input).returning();
    return row as BoardBidRow;
  }

  async listBoardBidsByBidder(bidderId: string): Promise<BoardBidRow[]> {
    return (await this.db
      .select()
      .from(boardBids)
      .where(and(eq(boardBids.bidderId, bidderId), isNotNull(boardBids.boardId)))
      .orderBy(desc(boardBids.createdAt))) as BoardBidRow[];
  }

  /** A board-direction bid by id, optionally scoped to its bidder. */
  async findBoardBid(id: string, bidderId?: string): Promise<BoardBidRow | null> {
    const conds = [eq(boardBids.id, id), isNotNull(boardBids.boardId)];
    if (bidderId) conds.push(eq(boardBids.bidderId, bidderId));
    const [row] = await this.db.select().from(boardBids).where(and(...conds)).limit(1);
    return (row as BoardBidRow) ?? null;
  }

  async setBidStatus(id: string, status: string): Promise<BoardBidRow | null> {
    const [row] = await this.db
      .update(boardBids)
      .set({ status, updatedAt: new Date() })
      .where(eq(boardBids.id, id))
      .returning();
    return (row as BoardBidRow) ?? null;
  }

  async insertPosting(input: JobBoardPostingInsert): Promise<void> {
    await this.db.insert(jobBoardPostings).values(input);
  }
}
