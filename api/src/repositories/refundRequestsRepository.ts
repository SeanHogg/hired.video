/**
 * RefundRequestsRepository — the caller's refund / cancellation requests
 * (`refund_requests`; a cancellation is a row whose reason starts with
 * `CANCELLATION:`). Writes go through services/billing/handlers.ts.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { refundRequests } = schema;

export type RefundRequestRow = typeof refundRequests.$inferSelect;

export type DbLike = any;

export class RefundRequestsRepository {
  constructor(private readonly db: DbLike = getDb()) {}

  /** Every request the user filed, oldest first. */
  async listForUser(userId: string): Promise<RefundRequestRow[]> {
    return (await this.db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.userId, userId))
      .orderBy(refundRequests.createdAt)) as RefundRequestRow[];
  }

  async findById(id: string): Promise<RefundRequestRow | null> {
    const [row] = await this.db.select().from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
    return (row as RefundRequestRow) ?? null;
  }
}
