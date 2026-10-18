/**
 * The signed-in user's own 2FA settings (/api/security): TOTP setup /
 * confirm / disable and backup-code count / regenerate. Wraps the TOTP and
 * backup-code primitives with the request's db and the endpoint rules.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findUserContactById } from "../../repositories/authFlowRepository.js";
import { beginTotpSetup, confirmTotpSetup, disableTotp } from "./totp.js";
import { countUnusedBackupCodes, generateBackupCodes } from "./backupCodes.js";

const invalidCode = () => new DomainError(400, "INVALID_CODE", "Invalid TOTP code");

/** Mint a pending TOTP secret + otpauth URL for the user's authenticator. */
export async function startTotpSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const db = getDb();
  const user = await findUserContactById(db, userId);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");
  return beginTotpSetup(db, userId, user.email);
}

/** Verify the first code, enable TOTP and seed backup codes (plaintext shown once). */
export async function enableTotp(userId: string, code: string): Promise<string[]> {
  const db = getDb();
  if (!(await confirmTotpSetup(db, userId, code))) throw invalidCode();
  return generateBackupCodes(db, userId);
}

/** Turn TOTP off — requires a current valid code. */
export async function turnOffTotp(userId: string, code: string): Promise<void> {
  if (!(await disableTotp(getDb(), userId, code))) throw invalidCode();
}

export function countBackupCodes(userId: string): Promise<number> {
  return countUnusedBackupCodes(getDb(), userId);
}

export function regenerateBackupCodes(userId: string): Promise<string[]> {
  return generateBackupCodes(getDb(), userId);
}
