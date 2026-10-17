/**
 * AuthFlowRepository — the reads/writes the /api/auth challenge flows need
 * that the AuthTokensRepository / UsersRepository classes don't already
 * cover:
 *   • twoFactorCodes   — challenge lookup by id, re-issue, attempt counter
 *   • magicLinkTokens  — issue / find-valid / consume
 *   • emailVerificationTokens — retire every token for a user (resend)
 *   • users            — narrow projections (contact, /me summary) and the
 *                        magic-link "email proven" flag
 *
 * Zero business logic — typed Drizzle wrappers taking a `db` handle. Rules
 * (attempt caps, TTLs, enumeration-safe responses) live in services/auth/*.
 */

import { and, eq, gt } from "drizzle-orm";
import { schema } from "../db/index.js";

const { users, twoFactorCodes, magicLinkTokens, emailVerificationTokens } = schema;

export type DbLike = any;

export type TwoFactorChallengeRow = typeof twoFactorCodes.$inferSelect;
export type MagicLinkTokenRow = typeof magicLinkTokens.$inferSelect;

export interface UserContactRow {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean | null;
}

export interface UserSummaryRow {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean | null;
  isGuest: boolean | null;
  createdAt: Date;
}

// ── two-factor challenges ───────────────────────────────────────────────────

export async function findTwoFactorChallenge(db: DbLike, id: string): Promise<TwoFactorChallengeRow | null> {
  const [row] = await db.select().from(twoFactorCodes).where(eq(twoFactorCodes.id, id)).limit(1);
  return (row as TwoFactorChallengeRow) ?? null;
}

/** Retire every pending code for the user, then insert a fresh challenge. */
export async function reissueTwoFactorChallenge(
  db: DbLike,
  input: { userId: string; code: string; expiresAt: Date },
): Promise<TwoFactorChallengeRow> {
  await db
    .update(twoFactorCodes)
    .set({ used: true })
    .where(and(eq(twoFactorCodes.userId, input.userId), eq(twoFactorCodes.used, false)));
  const [row] = await db
    .insert(twoFactorCodes)
    .values({ userId: input.userId, code: input.code, expiresAt: input.expiresAt, used: false })
    .returning();
  return row as TwoFactorChallengeRow;
}

export async function setTwoFactorAttempts(db: DbLike, id: string, attempts: number): Promise<void> {
  await db.update(twoFactorCodes).set({ attempts }).where(eq(twoFactorCodes.id, id));
}

// ── magic links ─────────────────────────────────────────────────────────────

export async function retireOpenMagicLinks(db: DbLike, email: string): Promise<void> {
  await db
    .update(magicLinkTokens)
    .set({ used: true })
    .where(and(eq(magicLinkTokens.email, email), eq(magicLinkTokens.used, false)));
}

export async function insertMagicLink(
  db: DbLike,
  input: { email: string; token: string; expiresAt: Date; redirect: string },
): Promise<void> {
  await db.insert(magicLinkTokens).values({ ...input, used: false });
}

export async function findValidMagicLink(db: DbLike, token: string, now: Date): Promise<MagicLinkTokenRow | null> {
  const [row] = await db
    .select()
    .from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.token, token), eq(magicLinkTokens.used, false), gt(magicLinkTokens.expiresAt, now)))
    .limit(1);
  return (row as MagicLinkTokenRow) ?? null;
}

export async function markMagicLinkUsed(db: DbLike, id: string): Promise<void> {
  await db.update(magicLinkTokens).set({ used: true }).where(eq(magicLinkTokens.id, id));
}

// ── email verification ──────────────────────────────────────────────────────

export async function retireEmailVerificationTokensForUser(db: DbLike, userId: string): Promise<void> {
  await db.update(emailVerificationTokens).set({ used: true }).where(eq(emailVerificationTokens.userId, userId));
}

// ── users (narrow projections) ──────────────────────────────────────────────

const contactColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  emailVerified: users.emailVerified,
};

export async function findUserContactById(db: DbLike, id: string): Promise<UserContactRow | null> {
  const [row] = await db.select(contactColumns).from(users).where(eq(users.id, id)).limit(1);
  return (row as UserContactRow) ?? null;
}

export async function findUserContactByEmail(db: DbLike, email: string): Promise<UserContactRow | null> {
  const [row] = await db.select(contactColumns).from(users).where(eq(users.email, email)).limit(1);
  return (row as UserContactRow) ?? null;
}

/** The /api/auth/me projection — key order is the response's key order. */
export async function findUserSummaryById(db: DbLike, id: string): Promise<UserSummaryRow | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerified: users.emailVerified,
      isGuest: users.isGuest,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return (row as UserSummaryRow) ?? null;
}

export async function markEmailVerified(db: DbLike, userId: string): Promise<void> {
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
}
