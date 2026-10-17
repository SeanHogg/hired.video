/**
 * MFA backup codes — 10 single-use rescue codes per user.
 *
 * Generated when MFA is enabled (and regenerable from Security
 * Settings). Plaintext is shown to the user exactly once at
 * generation; from then on only the SHA-256 digest is stored.
 *
 * Single source of truth for backup-code lifecycle. The MFA verify
 * path calls `consumeBackupCode` as one of the accepted second-factor
 * inputs; the regenerate UI calls `generateBackupCodes` (which
 * invalidates the previous batch).
 *
 * NIST SP 800-63B §6.1.2.3 ("Recovery Codes" — "look-up secrets" in
 * the spec).
 */

import { and, eq, isNull } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { sha256Hex } from "../../utils/crypto.js";

const { twoFactorBackupCodes } = schema;

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_LENGTH = 10; // 10 chars = ~52 bits of entropy

// Crockford-base32 alphabet — excludes I/L/O/U to avoid confusables.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateOneCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_LENGTH));
  let out = "";
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  // Format as XXXXX-XXXXX for readability.
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/**
 * Generate a fresh batch of backup codes, invalidating the user's
 * previous batch. Returns the plaintext codes — caller must show them
 * to the user immediately and warn that they won't be retrievable.
 */
export async function generateBackupCodes(db: any, userId: string): Promise<string[]> {
  const codes: string[] = [];
  const hashed: { userId: string; codeHash: string }[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateOneCode();
    codes.push(code);
    hashed.push({ userId, codeHash: await sha256Hex(code) });
  }
  // Invalidate any prior unused batch.
  await db.delete(twoFactorBackupCodes).where(eq(twoFactorBackupCodes.userId, userId));
  await db.insert(twoFactorBackupCodes).values(hashed as any);
  return codes;
}

/**
 * Try to consume a backup code. Returns true if the code matched an
 * unused row (now flagged used) and false otherwise. Constant-time
 * comparison isn't necessary here because the hash is the lookup
 * key — if it doesn't exist we never advance.
 */
export async function consumeBackupCode(
  db: any,
  userId: string,
  presented: string,
): Promise<boolean> {
  const normalized = presented.replace(/-/g, "").toUpperCase();
  // Restore the canonical hyphenated form for consistent hashing.
  const formatted = `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
  const codeHash = await sha256Hex(formatted);
  const [row] = await db
    .select()
    .from(twoFactorBackupCodes)
    .where(
      and(
        eq(twoFactorBackupCodes.userId, userId),
        eq(twoFactorBackupCodes.codeHash, codeHash),
        isNull(twoFactorBackupCodes.usedAt),
      ),
    )
    .limit(1);
  if (!row) return false;
  await db
    .update(twoFactorBackupCodes)
    .set({ usedAt: new Date() } as any)
    .where(eq(twoFactorBackupCodes.id, row.id));
  return true;
}

/**
 * How many unused codes does this user have? Drives the "regenerate
 * codes" prompt when the count is low.
 */
export async function countUnusedBackupCodes(db: any, userId: string): Promise<number> {
  const rows = await db
    .select({ id: twoFactorBackupCodes.id })
    .from(twoFactorBackupCodes)
    .where(
      and(eq(twoFactorBackupCodes.userId, userId), isNull(twoFactorBackupCodes.usedAt)),
    );
  return rows.length;
}
