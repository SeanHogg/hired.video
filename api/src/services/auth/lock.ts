/**
 * Account lock service — single source of truth for `account_locks`.
 *
 * Every lock decision goes through these three functions:
 *   • lockAccount       — flip the user into a locked state.
 *   • unlockAccount     — clear the active lock and stamp the audit row.
 *   • isAccountLocked   — read-only check, called by the login route
 *                         BEFORE the credential compare so a locked
 *                         account never advances to MFA / token issuance.
 *
 * Same fns are shared by:
 *   1. Brute-force auto-lock (Phase 5) — locks with reason='brute_force'
 *      and unlocks_at = now + 15min so the auto-unlock cron can clear
 *      it without a human in the loop.
 *   2. Bot signal auto-lock — reason='bot_signal', manual unlock.
 *   3. SuperAdmin manual lock/unlock (Phase 6) — same fns, lockedBy /
 *      unlockedBy stamped with the admin's user id.
 *
 * Audit history is preserved by inserting a new row per lock cycle and
 * flipping `active=false` on unlock instead of deleting. The partial
 * unique index in the migration enforces "at most one active lock per
 * user" so this code doesn't need its own concurrency guard.
 */

import { and, eq, lte } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { AccountLock } from "../../db/schema/users.js";

const { accountLocks } = schema;

export type LockReason =
  | "brute_force"
  | "admin_manual"
  | "bot_signal"
  | "compromised_credentials"
  | "support_request";

export interface LockAccountInput {
  db: any;
  userId: string;
  reason: LockReason;
  // SuperAdmin user id when manual; null/undefined for system-generated.
  lockedBy?: string | null;
  // Auto-unlock target. Pass null/undefined for manual-only locks.
  unlocksAt?: Date | null;
  notes?: string | null;
}

export async function lockAccount(input: LockAccountInput): Promise<AccountLock> {
  const { db, userId, reason, lockedBy, unlocksAt, notes } = input;
  // Idempotent: if there's already an active lock, return it. Avoids a
  // unique-index conflict when two paths race to lock the same user.
  const existing = await getActiveLock(db, userId);
  if (existing) return existing;

  const [row] = await db
    .insert(accountLocks)
    .values({
      userId,
      reason,
      lockedBy: lockedBy ?? null,
      unlocksAt: unlocksAt ?? null,
      notes: notes ?? null,
      active: true,
    } as any)
    .returning();
  return row;
}

export interface UnlockAccountInput {
  db: any;
  userId: string;
  unlockedBy?: string | null;
}

export async function unlockAccount(input: UnlockAccountInput): Promise<void> {
  const { db, userId, unlockedBy } = input;
  const now = new Date();
  await db
    .update(accountLocks)
    .set({
      active: false,
      unlockedAt: now,
      unlockedBy: unlockedBy ?? null,
    } as any)
    .where(and(eq(accountLocks.userId, userId), eq(accountLocks.active, true)));
}

/**
 * Authoritative "is this user locked?" check. Called by the login route
 * pre-credential-check. Auto-unlocks expired locks (unlocks_at in the
 * past) on read so the brute-force 15-minute lockout clears itself
 * without needing a separate cron.
 */
export async function isAccountLocked(db: any, userId: string): Promise<AccountLock | null> {
  const lock = await getActiveLock(db, userId);
  if (!lock) return null;
  if (lock.unlocksAt && new Date(lock.unlocksAt) <= new Date()) {
    await unlockAccount({ db, userId });
    return null;
  }
  return lock;
}

async function getActiveLock(db: any, userId: string): Promise<AccountLock | null> {
  const [row] = await db
    .select()
    .from(accountLocks)
    .where(and(eq(accountLocks.userId, userId), eq(accountLocks.active, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Sweep job — clear every lock whose auto-unlock time has passed. Safe
 * to run on a cron or just-in-time at login. Returns the count cleared
 * for telemetry.
 */
export async function sweepExpiredLocks(db: any): Promise<number> {
  const now = new Date();
  const result = await db
    .update(accountLocks)
    .set({ active: false, unlockedAt: now } as any)
    .where(and(eq(accountLocks.active, true), lte(accountLocks.unlocksAt, now)))
    .returning({ id: accountLocks.id });
  return result.length ?? 0;
}
