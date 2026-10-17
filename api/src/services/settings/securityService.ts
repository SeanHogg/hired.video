/**
 * Settings → Security + Do-Not-Share use cases (/api/settings/security/*,
 * /api/settings/privacy/do-not-share). Data access in
 * repositories/userSettingsRepository.ts.
 */

import { DomainError } from "../../domains/errors.js";
import {
  disableMfa,
  findDoNotShare,
  findUserSecurityFlags,
  listActiveSessions,
  listLinkedAccounts,
  revokeSession,
  setDoNotShare,
} from "../../repositories/userSettingsRepository.js";
import { randomHex } from "../../utils/crypto.js";

export async function getSecurityOverview(userId: string) {
  const user = await findUserSecurityFlags(userId);
  const linkedAccounts = await listLinkedAccounts(userId);
  return {
    twoFactorEnabled: user?.mfaEnabled ?? false,
    hasPassword: !!(user?.passwordHash),
    linkedAccounts,
    loginNotifications: true,
    sessionTimeout: 30,
  };
}

/** Active sessions = non-revoked, non-expired refresh tokens. The token value
 *  is never exposed — only the opaque session id. */
export async function listSessions(userId: string) {
  const sessions = await listActiveSessions(userId, new Date());
  return sessions.map((s) => ({
    id: s.id,
    createdAt: new Date(s.createdAt).toISOString(),
    expiresAt: new Date(s.expiresAt).toISOString(),
  }));
}

export async function revokeUserSession(userId: string, sessionId: string) {
  if (!(await revokeSession(userId, sessionId))) {
    throw new DomainError(404, "NOT_FOUND", "Session not found");
  }
  return { revoked: true };
}

/** Placeholder 2FA enrolment (static QR + fresh backup codes). */
export function startTwoFactorEnrolment() {
  const backupCodes = Array.from({ length: 8 }, () => randomHex(4));
  return {
    qrCode: "https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=otpauth%3A%2F%2Ftotp%2Fhired.video",
    backupCodes,
  };
}

export async function disableTwoFactor(userId: string) {
  await disableMfa(userId);
  return { success: true };
}

// ── CCPA / CPRA "Do Not Sell or Share My Personal Information" ───────────
// PUT flips users.do_not_share AND zeroes the marketing / personalization
// cookie categories so the next pixel-install pass short-circuits. The
// row-level flag is the seam the server-side CAPI fan-out reads to suppress
// identifier sharing independently of cookie state.

export async function getDoNotShare(userId: string) {
  return { doNotShare: (await findDoNotShare(userId)) ?? false };
}

export async function updateDoNotShare(userId: string, body: unknown) {
  const doNotShare = Boolean(body && typeof body === "object" && (body as { doNotShare?: unknown }).doNotShare);
  await setDoNotShare(userId, doNotShare, new Date());
  return { doNotShare };
}
