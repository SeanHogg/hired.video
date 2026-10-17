/**
 * Per-user payout / tax profile rows (`payout_profiles`, UNIQUE on user_id)
 * as read and written by the creator workspace + Settings → Payouts.
 */
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { payoutProfiles } = schema;

export type PayoutProfileRow = typeof payoutProfiles.$inferSelect;
export type PayoutProfilePatch = Partial<typeof payoutProfiles.$inferInsert>;

export async function findPayoutProfile(db: Db, userId: string): Promise<PayoutProfileRow | null> {
  const [row] = await db
    .select()
    .from(payoutProfiles)
    .where(eq(payoutProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function insertEmptyPayoutProfile(db: Db, userId: string): Promise<PayoutProfileRow> {
  const [created] = await db.insert(payoutProfiles).values({ userId }).returning();
  return created;
}

export async function updatePayoutProfile(db: Db, userId: string, patch: PayoutProfilePatch): Promise<PayoutProfileRow> {
  const [updated] = await db
    .update(payoutProfiles)
    .set(patch)
    .where(eq(payoutProfiles.userId, userId))
    .returning();
  return updated;
}

/** Whether the user has finished payout onboarding (can accept paid orders). */
export async function findPayoutsEnabled(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ payoutsEnabled: payoutProfiles.payoutsEnabled })
    .from(payoutProfiles)
    .where(eq(payoutProfiles.userId, userId))
    .limit(1);
  return !!row?.payoutsEnabled;
}
