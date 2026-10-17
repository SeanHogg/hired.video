/**
 * SuperAdmin manual account lock / unlock / status — binds the shared
 * services/auth/lock.ts primitives (the same ones the brute-force counter
 * uses) to the request DB handle.
 */
import { getDb } from "../../db/index.js";
import { lockAccount, unlockAccount, isAccountLocked } from "../auth/lock.js";

type LockInput = Omit<Parameters<typeof lockAccount>[0], "db">;

export function adminLockAccount(input: LockInput) {
  return lockAccount({ db: getDb(), ...input });
}

export function adminUnlockAccount(userId: string, unlockedBy: string) {
  return unlockAccount({ db: getDb(), userId, unlockedBy });
}

export async function adminLockStatus(userId: string) {
  const lock = await isAccountLocked(getDb(), userId);
  return {
    locked: !!lock,
    reason: lock?.reason ?? null,
    unlocksAt: lock?.unlocksAt ? new Date(lock.unlocksAt).toISOString() : null,
  };
}
