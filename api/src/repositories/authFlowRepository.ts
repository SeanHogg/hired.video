/**
 * AuthFlowRepository — the user reads/writes the /api/auth challenge flows
 * need that UsersRepository doesn't already cover: narrow projections
 * (contact, /me summary) and the magic-link "email proven" flag. One-time
 * tokens (2FA challenges, magic links, verification) live in
 * AuthTokensRepository.
 *
 * Zero business logic — typed Drizzle wrappers taking a `db` handle. Rules
 * (attempt caps, TTLs, enumeration-safe responses) live in services/auth/*.
 */

import { eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import { randomHex } from "../utils/crypto.js";
import { AuthTokensRepository } from "./authTokensRepository.js";

const { users } = schema;

export type DbLike = any;

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

/** Whether the user has a password sign-in method (OAuth-only accounts don't). */
export async function userHasPassword(db: DbLike, userId: string): Promise<boolean> {
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  return !!row?.passwordHash;
}

/** Set a password hash + stamp `passwordChangedAt` (OAuth "add password"). */
export async function setPasswordHashStamped(db: DbLike, userId: string, passwordHash: string, at: Date = new Date()): Promise<void> {
  await db.update(users).set({ passwordHash, passwordChangedAt: at } as any).where(eq(users.id, userId));
}

/** The password-age baseline: when it was last changed, else account creation. */
export async function findPasswordAgeById(
  db: DbLike,
  id: string,
): Promise<{ passwordChangedAt: Date | null; createdAt: Date } | null> {
  const [row] = await db
    .select({ passwordChangedAt: users.passwordChangedAt, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

export async function markEmailVerified(db: DbLike, userId: string): Promise<void> {
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
}

/**
 * Mint a magic-link token for `email`: retire every open link for the
 * address, store a fresh one-time token (TTL + post-login redirect chosen by
 * the caller) and return it. The ONE mint used by sign-in, OAuth's email
 * fallback and partner claim links.
 */
export async function mintMagicLinkToken(
  db: DbLike,
  input: { email: string; ttlMs: number; redirect: string },
): Promise<string> {
  const tokens = new AuthTokensRepository(db);
  await tokens.retireOpenMagicLinks(input.email);
  const token = randomHex(32);
  await tokens.insertMagicLink({ email: input.email, token, expiresAt: new Date(Date.now() + input.ttlMs), redirect: input.redirect });
  return token;
}
