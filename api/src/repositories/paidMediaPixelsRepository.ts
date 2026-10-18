/**
 * PaidMediaPixelsRepository — table access for `paid_media_pixels`, one row
 * per workspace (userId, companyId) holding public pixel ids + encrypted
 * CAPI tokens. Encryption/redaction live in the services; this file only
 * reads and writes rows.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { schema } from "../db/index.js";

const { paidMediaPixels } = schema;

export type DbLike = any;
export type PaidMediaPixelRow = typeof paidMediaPixels.$inferSelect;
export type PaidMediaPixelInsert = typeof paidMediaPixels.$inferInsert;

export interface IPaidMediaPixelsRepository {
  findForOwner(userId: string, companyId: string | null): Promise<PaidMediaPixelRow | null>;
  /** userId of the oldest personal (companyId IS NULL) pixel row. */
  findOldestPersonalOwnerUserId(): Promise<string | null>;
  upsertForOwner(values: PaidMediaPixelInsert): Promise<void>;
}

export class PaidMediaPixelsRepository implements IPaidMediaPixelsRepository {
  constructor(private readonly db: DbLike) {}

  private ownerWhere(userId: string, companyId: string | null) {
    return and(
      eq(paidMediaPixels.userId, userId),
      companyId ? eq(paidMediaPixels.companyId, companyId) : isNull(paidMediaPixels.companyId),
    );
  }

  async findForOwner(userId: string, companyId: string | null): Promise<PaidMediaPixelRow | null> {
    const [row] = await this.db.select().from(paidMediaPixels).where(this.ownerWhere(userId, companyId)).limit(1);
    return row ?? null;
  }

  async findOldestPersonalOwnerUserId(): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: paidMediaPixels.userId })
      .from(paidMediaPixels)
      .where(isNull(paidMediaPixels.companyId))
      .orderBy(asc(paidMediaPixels.createdAt))
      .limit(1);
    return row?.userId ?? null;
  }

  async upsertForOwner(values: PaidMediaPixelInsert): Promise<void> {
    const companyId = values.companyId ?? null;
    if (companyId) {
      await this.db.insert(paidMediaPixels).values(values).onConflictDoUpdate({
        target: [paidMediaPixels.userId, paidMediaPixels.companyId],
        set: values,
      });
      return;
    }
    // Personal workspace: uq_paid_media_pixels_workspace (user_id, company_id)
    // treats NULL company_id as distinct, so ON CONFLICT never fires and every
    // save used to insert a duplicate row. Update the existing row first.
    const updated = await this.db
      .update(paidMediaPixels)
      .set(values)
      .where(this.ownerWhere(values.userId, null))
      .returning({ id: paidMediaPixels.id });
    if (updated.length > 0) return;
    await this.db.insert(paidMediaPixels).values({ ...values, companyId: null });
  }
}
