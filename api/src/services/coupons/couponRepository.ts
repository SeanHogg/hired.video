/**
 * coupon_codes / coupon_redemptions data access (migration 0500). The only
 * module that touches these tables; use cases go through these functions.
 */
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "../../db/index.js";
import type { CouponCodeRow } from "../../db/schema/coupons.js";

const { couponCodes, couponRedemptions, users } = schema;

/** Bounded SuperAdmin page sizes. */
export const COUPON_LIST_LIMIT = 200;
export const REDEMPTION_LIST_LIMIT = 200;

export type CouponRow = CouponCodeRow;

export async function insertCoupon(
  row: {
    code: string;
    durationDays: number;
    maxRedemptions: number | null;
    expiresAt: Date | null;
    note: string;
    createdBy: string;
  },
  db: Db = getDb(),
): Promise<CouponRow | null> {
  // uq_coupon_codes_code: a taken code is a no-op that returns null.
  const [created] = await db.insert(couponCodes).values(row).onConflictDoNothing().returning();
  return created ?? null;
}

export async function listCoupons(db: Db = getDb()): Promise<CouponRow[]> {
  return db.select().from(couponCodes).orderBy(desc(couponCodes.createdAt)).limit(COUPON_LIST_LIMIT);
}

export async function findCouponByCode(code: string, db: Db = getDb()): Promise<CouponRow | null> {
  const [row] = await db.select().from(couponCodes).where(eq(couponCodes.code, code)).limit(1);
  return row ?? null;
}

export async function updateCoupon(
  id: string,
  patch: Partial<Pick<CouponRow, "isActive" | "maxRedemptions" | "expiresAt" | "note">>,
  db: Db = getDb(),
): Promise<CouponRow | null> {
  const [row] = await db
    .update(couponCodes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(couponCodes.id, id))
    .returning();
  return row ?? null;
}

/**
 * Atomically take one redemption slot: succeeds only while the code is
 * active, unexpired and under its cap. Returns false when no slot was taken.
 */
export async function claimRedemptionSlot(id: string, now: Date, db: Db = getDb()): Promise<boolean> {
  const rows = await db
    .update(couponCodes)
    .set({ redemptionCount: sql`${couponCodes.redemptionCount} + 1`, updatedAt: now })
    .where(
      and(
        eq(couponCodes.id, id),
        eq(couponCodes.isActive, true),
        or(isNull(couponCodes.expiresAt), gt(couponCodes.expiresAt, now)),
        or(isNull(couponCodes.maxRedemptions), lt(couponCodes.redemptionCount, couponCodes.maxRedemptions)),
      ),
    )
    .returning({ id: couponCodes.id });
  return rows.length > 0;
}

/** Give back a slot taken by `claimRedemptionSlot` when the redemption fails. */
export async function releaseRedemptionSlot(id: string, db: Db = getDb()): Promise<void> {
  await db
    .update(couponCodes)
    .set({ redemptionCount: sql`GREATEST(${couponCodes.redemptionCount} - 1, 0)` })
    .where(eq(couponCodes.id, id));
}

export async function hasRedeemed(couponId: string, userId: string, db: Db = getDb()): Promise<boolean> {
  const [row] = await db
    .select({ id: couponRedemptions.id })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, couponId), eq(couponRedemptions.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** Records a redemption; null when this user already redeemed this code. */
export async function insertRedemption(
  row: { couponId: string; userId: string; grantedUntil: Date },
  db: Db = getDb(),
): Promise<{ id: string } | null> {
  const [created] = await db
    .insert(couponRedemptions)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: couponRedemptions.id });
  return created ?? null;
}

export async function deleteRedemption(id: string, db: Db = getDb()): Promise<void> {
  await db.delete(couponRedemptions).where(eq(couponRedemptions.id, id));
}

export async function listRedemptions(couponId: string, db: Db = getDb()) {
  return db
    .select({
      id: couponRedemptions.id,
      userId: couponRedemptions.userId,
      email: users.email,
      name: users.name,
      grantedUntil: couponRedemptions.grantedUntil,
      redeemedAt: couponRedemptions.redeemedAt,
    })
    .from(couponRedemptions)
    .leftJoin(users, eq(users.id, couponRedemptions.userId))
    .where(eq(couponRedemptions.couponId, couponId))
    .orderBy(desc(couponRedemptions.redeemedAt))
    .limit(REDEMPTION_LIST_LIMIT);
}
