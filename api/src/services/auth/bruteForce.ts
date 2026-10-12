/**
 * Brute-force counter — auto-locks an account after too many failed
 * login attempts inside a sliding window.
 *
 * Single source of truth for the "should I lock this account?"
 * decision. The login handler calls `recordFailedLogin` after every
 * invalid-password event; that fn looks at the recent loginEvents
 * history and, if the threshold is crossed, calls lockAccount() with
 * reason='brute_force' and a 15-minute auto-unlock target.
 *
 * lockAccount/unlockAccount/isAccountLocked are imported from
 * services/auth/lock.ts — the SuperAdmin manual-lock path uses the
 * exact same primitives (no copies, no canX prop drilling).
 */

import { and, eq, gt } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { lockAccount } from "./lock.js";
import { recordBotBlock } from "./botBlock.js";

const { loginEvents } = schema;

export const FAILURE_THRESHOLD = 10;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface RecordFailedLoginInput {
  db: any;
  userId: string;
  email: string;
  ipAddress: string | null;
  countryCode?: string | null;
}

/**
 * Count recent failed logins in the sliding window. If we hit the
 * threshold, lock the account for 15 minutes and emit a
 * BRUTE_FORCE bot-block event (so the SuperAdmin globe shows it).
 *
 * Returns true if a lock was just placed.
 */
export async function recordFailedLogin(input: RecordFailedLoginInput): Promise<boolean> {
  const { db, userId, email, ipAddress, countryCode } = input;
  const since = new Date(Date.now() - FAILURE_WINDOW_MS);

  const failures = await db
    .select({ id: loginEvents.id })
    .from(loginEvents)
    .where(
      and(
        eq(loginEvents.userId, userId),
        eq(loginEvents.success, false),
        gt(loginEvents.createdAt, since),
      ),
    );

  if (failures.length < FAILURE_THRESHOLD) return false;

  await lockAccount({
    db,
    userId,
    reason: "brute_force",
    unlocksAt: new Date(Date.now() + LOCK_DURATION_MS),
    notes: `Auto-lock after ${failures.length} failures in ${FAILURE_WINDOW_MS / 60000}min`,
  });

  await recordBotBlock({
    db,
    endpoint: "login",
    reason: "BRUTE_FORCE",
    countryCode: countryCode ?? null,
    ipAddress,
    email,
  });

  return true;
}
