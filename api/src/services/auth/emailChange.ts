/**
 * Email-change verify flow.
 *
 * Why two tokens: an attacker who steals an active session must NOT be
 * able to silently change the email and lock the real owner out. So we
 * require the *current* email to confirm ("yes, change me") AND the
 * *new* email to verify ownership before mutating users.email. Only
 * when both confirmations land does the swap happen.
 *
 * Single source of truth for every step:
 *   • requestEmailChange — issue both tokens, send both emails.
 *   • confirmCurrent      — user clicks the link from old inbox.
 *   • confirmNew          — user clicks the link from new inbox.
 *   • finalize            — internal; called by either confirm fn once
 *                           both flags are true. Mutates users.email,
 *                           bumps session_version, revokes other sessions.
 *
 * NIST 800-63B §5.1.1.2 / OWASP ASVS V2.4.5.
 */

import { and, eq, gt, isNull } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import { sendEmailChangeCurrent, sendEmailChangeNew } from "../adapters/email/senders/auth.js";
import { bumpSessionVersion, revokeAllSessionsForUser } from "./session-lifecycle.js";
import { randomHex } from "../../utils/crypto.js";

const { users, emailChangeRequests } = schema;

const REQUEST_TTL_MS = 60 * 60 * 1000; // 1 hour for both tokens

/** 32-byte hex confirm token (64 chars). */
const TOKEN_BYTES = 32;

export interface RequestEmailChangeInput {
  db: any;
  userId: string;
  currentEmail: string;
  currentName: string;
  newEmail: string;
}

export type RequestEmailChangeResult =
  | { ok: true; requestId: string }
  | { ok: false; reason: "same_email" | "email_in_use" };

export async function requestEmailChange(
  input: RequestEmailChangeInput,
): Promise<RequestEmailChangeResult> {
  const { db, userId, currentEmail, currentName, newEmail } = input;

  if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
    return { ok: false, reason: "same_email" };
  }

  const [conflict] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail.toLowerCase()))
    .limit(1);
  if (conflict) {
    return { ok: false, reason: "email_in_use" };
  }

  // Invalidate any previous open request for this user so a stale token
  // can't race the new flow. Consumed-at sentinel is the lifecycle
  // marker (set on finalize OR explicit invalidation).
  await db
    .update(emailChangeRequests)
    .set({ consumedAt: new Date() } as any)
    .where(and(eq(emailChangeRequests.userId, userId), isNull(emailChangeRequests.consumedAt)));

  const currentToken = randomHex(TOKEN_BYTES);
  const newToken = randomHex(TOKEN_BYTES);
  const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);

  const [row] = await db
    .insert(emailChangeRequests)
    .values({
      userId,
      currentEmail: currentEmail.toLowerCase(),
      newEmail: newEmail.toLowerCase(),
      currentToken,
      newToken,
      expiresAt,
    } as any)
    .returning();

  // Side effects — errors are logged but don't fail the request. The
  // user can retry; tokens are stored either way.
  try {
    await sendEmailChangeCurrent(currentEmail, currentName, currentEmail, newEmail, currentToken);
  } catch (err) {
    logger.error("[emailChange] Failed to send confirmation to current email", err);
  }
  try {
    await sendEmailChangeNew(newEmail, currentEmail, newToken);
  } catch (err) {
    logger.error("[emailChange] Failed to send verification to new email", err);
  }

  return { ok: true, requestId: row.id };
}

export type ConfirmResult =
  | { ok: true; finalized: boolean; newEmail?: string }
  | { ok: false; reason: "invalid" | "expired" | "consumed" };

async function confirmStep(
  db: any,
  token: string,
  which: "current" | "new",
): Promise<ConfirmResult> {
  const now = new Date();
  const tokenColumn = which === "current" ? emailChangeRequests.currentToken : emailChangeRequests.newToken;
  const [row] = await db
    .select()
    .from(emailChangeRequests)
    .where(eq(tokenColumn, token))
    .limit(1);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.consumedAt) return { ok: false, reason: "consumed" };
  if (new Date(row.expiresAt) <= now) return { ok: false, reason: "expired" };

  // Flip the corresponding confirmation flag.
  const patch =
    which === "current" ? { currentConfirmed: true } : { newConfirmed: true };
  await db
    .update(emailChangeRequests)
    .set(patch as any)
    .where(eq(emailChangeRequests.id, row.id));

  const bothConfirmed =
    (which === "current" ? true : row.currentConfirmed) &&
    (which === "new" ? true : row.newConfirmed);

  if (bothConfirmed) {
    await finalize(db, row.id, row.userId, row.newEmail);
    return { ok: true, finalized: true, newEmail: row.newEmail };
  }
  return { ok: true, finalized: false };
}

export const confirmCurrent = (db: any, token: string) => confirmStep(db, token, "current");
export const confirmNew = (db: any, token: string) => confirmStep(db, token, "new");

async function finalize(
  db: any,
  requestId: string,
  userId: string,
  newEmail: string,
): Promise<void> {
  const now = new Date();
  await db.update(users).set({ email: newEmail.toLowerCase() } as any).where(eq(users.id, userId));
  await db
    .update(emailChangeRequests)
    .set({ consumedAt: now } as any)
    .where(eq(emailChangeRequests.id, requestId));
  // Treat email change as "high-impact security mutation": kill every
  // other session so a stolen one (which initiated the request) loses
  // access immediately after the new owner confirms.
  await bumpSessionVersion(db, userId);
  await revokeAllSessionsForUser(db, userId, "email_changed");
}
