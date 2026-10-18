/**
 * AuthTokensRepository — the authentication-credential aggregate.
 *
 * Covers every short-lived and long-lived token / proof-of-identity:
 *   • authTokens — one-time tokens/codes by purpose (email verification,
 *     password reset, magic link, 2FA challenge) — the ONLY module that
 *     reads or writes `auth_tokens` (W3-B, migration 0591)
 *   • refreshTokens
 *   • webauthnCredentials (passkeys)
 *   • passwordHistory
 *
 * One aggregate because these all share the same lifecycle shape
 * (issue → consume/expire) and the same transactional boundary: a
 * password rotation invalidates reset tokens AND archives the old
 * hash in a single service operation.
 *
 * Access control (modules, permissions, API keys) is a separate
 * aggregate — see AuthzRepository. Audit (who did what) is another —
 * see AuditRepository.
 */

import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { AuthTokenPurpose } from "../../../shared/auth-tokens.js";

const {
  authTokens,
  refreshTokens,
  webauthnCredentials: passkeys,
  passwordHistory,
} = schema;

export type DbLike = any;

type AuthTokenDbRow = typeof authTokens.$inferSelect;

/** A one-time token row. `used` mirrors `usedAt` for the pre-merge readers. */
export interface AuthTokenRow {
  id: string;
  purpose: string;
  userId: string | null;
  email: string | null;
  token: string;
  expiresAt: Date;
  used: boolean;
  usedAt: Date | null;
  attempts: number;
  redirect: string | null;
  createdAt: Date;
}

export interface PasswordResetTokenRow extends AuthTokenRow {
  userId: string;
}
export type EmailVerificationTokenRow = PasswordResetTokenRow;
/** A login 2FA challenge; `code` is the emailed 6-digit code. */
export interface TwoFactorCodeRow extends AuthTokenRow {
  userId: string;
  code: string;
}
export interface MagicLinkTokenRow extends AuthTokenRow {
  email: string;
  redirect: string;
}

export interface PasswordResetTokenInsert {
  userId: string;
  token: string;
  expiresAt: Date;
}
export type EmailVerificationTokenInsert = PasswordResetTokenInsert;
export interface TwoFactorCodeInsert {
  userId: string;
  code: string;
  expiresAt: Date;
}

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type RefreshTokenInsert = typeof refreshTokens.$inferInsert;
export type PasskeyRow = typeof passkeys.$inferSelect;
export type PasskeyInsert = typeof passkeys.$inferInsert;

/** Magic links land here when the caller supplies no redirect (the old
 *  magic_link_tokens.redirect default). */
export const MAGIC_LINK_DEFAULT_REDIRECT = "/dashboard";

function toRow(r: AuthTokenDbRow): AuthTokenRow {
  return {
    id: r.id,
    purpose: r.purpose,
    userId: r.userId ?? null,
    email: r.email ?? null,
    token: r.token,
    expiresAt: r.expiresAt,
    used: r.usedAt != null,
    usedAt: r.usedAt ?? null,
    attempts: r.attempts ?? 0,
    redirect: r.redirect ?? null,
    createdAt: r.createdAt,
  };
}

const toTwoFactorRow = (r: AuthTokenDbRow): TwoFactorCodeRow =>
  ({ ...toRow(r), code: r.token }) as TwoFactorCodeRow;

export interface IAuthTokensRepository {
  findValidPasswordResetToken(token: string): Promise<PasswordResetTokenRow | null>;
  invalidatePasswordResetsForUser(userId: string): Promise<void>;
  insertPasswordResetToken(input: PasswordResetTokenInsert): Promise<void>;
  markPasswordResetUsed(id: string): Promise<void>;
  findValidEmailVerificationToken(token: string): Promise<EmailVerificationTokenRow | null>;
  insertEmailVerificationToken(input: EmailVerificationTokenInsert): Promise<void>;
  markEmailVerificationUsed(id: string): Promise<void>;
  /** Retire every email-verification token of the user (resend). */
  retireEmailVerificationTokensForUser(userId: string): Promise<void>;
  insertTwoFactorCode(input: TwoFactorCodeInsert): Promise<void>;
  findValid2faCode(userId: string, code: string): Promise<TwoFactorCodeRow | null>;
  markTwoFactorCodeUsed(id: string): Promise<void>;
  /** The 2FA challenge by id (= the login tempAuthToken), used or not. */
  findTwoFactorChallenge(id: string): Promise<TwoFactorCodeRow | null>;
  /** Retire every open code for the user, then insert a fresh challenge. */
  reissueTwoFactorChallenge(input: TwoFactorCodeInsert): Promise<TwoFactorCodeRow>;
  setTwoFactorAttempts(id: string, attempts: number): Promise<void>;
  retireOpenMagicLinks(email: string): Promise<void>;
  insertMagicLink(input: { email: string; token: string; expiresAt: Date; redirect?: string | null }): Promise<void>;
  findValidMagicLink(token: string): Promise<MagicLinkTokenRow | null>;
  markMagicLinkUsed(id: string): Promise<void>;
  /** Retire every user-keyed one-time token (reset, verification, 2FA) —
   *  account erasure / lockdown. */
  retireAllForUser(userId: string): Promise<void>;
  insertRefreshToken(input: RefreshTokenInsert): Promise<void>;
  findRefreshToken(token: string): Promise<RefreshTokenRow | null>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteRefreshTokensForUser(userId: string): Promise<void>;
  findPasskeyByCredentialId(credentialId: string): Promise<PasskeyRow | null>;
  findPasskeysForUser(userId: string): Promise<PasskeyRow[]>;
  insertPasskey(input: PasskeyInsert): Promise<PasskeyRow>;
  deletePasskey(id: string, userId: string): Promise<boolean>;
  recordPasskeyUse(id: string, signCount: number, usedAt: Date): Promise<void>;
  insertPasswordHistory(userId: string, passwordHash: string): Promise<void>;
  /** The user's most recent `limit` password hashes, newest first. */
  findRecentPasswordHashes(userId: string, limit: number): Promise<string[]>;
}

export class AuthTokensRepository implements IAuthTokensRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── one-time tokens: generic primitives ─────────────────────────────────

  private async issue(purpose: AuthTokenPurpose, input: {
    userId?: string | null;
    email?: string | null;
    token: string;
    expiresAt: Date;
    redirect?: string | null;
  }): Promise<AuthTokenDbRow> {
    const [row] = await this.db
      .insert(authTokens)
      .values({
        purpose,
        userId: input.userId ?? null,
        email: input.email ?? null,
        token: input.token,
        expiresAt: input.expiresAt,
        redirect: input.redirect ?? null,
      })
      .returning();
    return row as AuthTokenDbRow;
  }

  /** Unused + unexpired token of a purpose. */
  private async findValid(purpose: AuthTokenPurpose, token: string): Promise<AuthTokenDbRow | null> {
    const [row] = await this.db
      .select()
      .from(authTokens)
      .where(and(
        eq(authTokens.purpose, purpose),
        eq(authTokens.token, token),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, this.now()),
      ))
      .limit(1);
    return (row as AuthTokenDbRow) ?? null;
  }

  private async markUsed(id: string): Promise<void> {
    await this.db.update(authTokens).set({ usedAt: this.now() }).where(eq(authTokens.id, id));
  }

  private async retireForUser(purposes: AuthTokenPurpose[], userId: string): Promise<void> {
    await this.db
      .update(authTokens)
      .set({ usedAt: this.now() })
      .where(and(eq(authTokens.userId, userId), inArray(authTokens.purpose, purposes), isNull(authTokens.usedAt)));
  }

  // ── password reset ──────────────────────────────────────────────────────

  async findValidPasswordResetToken(token: string): Promise<PasswordResetTokenRow | null> {
    const row = await this.findValid("password_reset", token);
    return row ? (toRow(row) as PasswordResetTokenRow) : null;
  }

  async invalidatePasswordResetsForUser(userId: string): Promise<void> {
    await this.retireForUser(["password_reset"], userId);
  }

  async insertPasswordResetToken(input: PasswordResetTokenInsert): Promise<void> {
    await this.issue("password_reset", input);
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await this.markUsed(id);
  }

  // ── email verification ──────────────────────────────────────────────────

  async findValidEmailVerificationToken(token: string): Promise<EmailVerificationTokenRow | null> {
    const row = await this.findValid("email_verification", token);
    return row ? (toRow(row) as EmailVerificationTokenRow) : null;
  }

  async insertEmailVerificationToken(input: EmailVerificationTokenInsert): Promise<void> {
    await this.issue("email_verification", input);
  }

  async markEmailVerificationUsed(id: string): Promise<void> {
    await this.markUsed(id);
  }

  async retireEmailVerificationTokensForUser(userId: string): Promise<void> {
    await this.retireForUser(["email_verification"], userId);
  }

  // ── two-factor challenges ───────────────────────────────────────────────

  async insertTwoFactorCode(input: TwoFactorCodeInsert): Promise<void> {
    await this.issue("two_factor", { userId: input.userId, token: input.code, expiresAt: input.expiresAt });
  }

  async findValid2faCode(userId: string, code: string): Promise<TwoFactorCodeRow | null> {
    const [row] = await this.db
      .select()
      .from(authTokens)
      .where(and(
        eq(authTokens.purpose, "two_factor"),
        eq(authTokens.userId, userId),
        eq(authTokens.token, code),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, this.now()),
      ))
      .limit(1);
    return row ? toTwoFactorRow(row as AuthTokenDbRow) : null;
  }

  async markTwoFactorCodeUsed(id: string): Promise<void> {
    await this.markUsed(id);
  }

  async findTwoFactorChallenge(id: string): Promise<TwoFactorCodeRow | null> {
    const [row] = await this.db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.id, id), eq(authTokens.purpose, "two_factor")))
      .limit(1);
    return row ? toTwoFactorRow(row as AuthTokenDbRow) : null;
  }

  async reissueTwoFactorChallenge(input: TwoFactorCodeInsert): Promise<TwoFactorCodeRow> {
    await this.retireForUser(["two_factor"], input.userId);
    const row = await this.issue("two_factor", { userId: input.userId, token: input.code, expiresAt: input.expiresAt });
    return toTwoFactorRow(row);
  }

  async setTwoFactorAttempts(id: string, attempts: number): Promise<void> {
    await this.db.update(authTokens).set({ attempts }).where(eq(authTokens.id, id));
  }

  // ── magic links ─────────────────────────────────────────────────────────

  async retireOpenMagicLinks(email: string): Promise<void> {
    await this.db
      .update(authTokens)
      .set({ usedAt: this.now() })
      .where(and(eq(authTokens.purpose, "magic_link"), eq(authTokens.email, email), isNull(authTokens.usedAt)));
  }

  async insertMagicLink(input: { email: string; token: string; expiresAt: Date; redirect?: string | null }): Promise<void> {
    await this.issue("magic_link", { ...input, redirect: input.redirect ?? MAGIC_LINK_DEFAULT_REDIRECT });
  }

  async findValidMagicLink(token: string): Promise<MagicLinkTokenRow | null> {
    const row = await this.findValid("magic_link", token);
    return row ? (toRow(row) as MagicLinkTokenRow) : null;
  }

  async markMagicLinkUsed(id: string): Promise<void> {
    await this.markUsed(id);
  }

  async retireAllForUser(userId: string): Promise<void> {
    await this.retireForUser(["password_reset", "email_verification", "two_factor"], userId);
  }

  // ── refresh tokens ──────────────────────────────────────────────────────

  async insertRefreshToken(input: RefreshTokenInsert): Promise<void> {
    await this.db.insert(refreshTokens).values(input as any);
  }

  async findRefreshToken(token: string): Promise<RefreshTokenRow | null> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.token, token), gt(refreshTokens.expiresAt, this.now())))
      .limit(1);
    return (row as RefreshTokenRow) ?? null;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await this.db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async deleteRefreshTokensForUser(userId: string): Promise<void> {
    await this.db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }

  async findPasskeyByCredentialId(credentialId: string): Promise<PasskeyRow | null> {
    const [row] = await this.db.select().from(passkeys).where(eq(passkeys.credentialId, credentialId)).limit(1);
    return (row as PasskeyRow) ?? null;
  }

  async findPasskeysForUser(userId: string): Promise<PasskeyRow[]> {
    return (await this.db.select().from(passkeys).where(eq(passkeys.userId, userId))) as PasskeyRow[];
  }

  async insertPasskey(input: PasskeyInsert): Promise<PasskeyRow> {
    const [row] = await this.db.insert(passkeys).values(input as any).returning();
    return row as PasskeyRow;
  }

  async deletePasskey(id: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
      .limit(1);
    if (!row) return false;
    await this.db.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)));
    return true;
  }

  /** Stamp a successful assertion: the authenticator's new sign counter
   *  and the last-used time shown on the credentials list. */
  async recordPasskeyUse(id: string, signCount: number, usedAt: Date): Promise<void> {
    await this.db.update(passkeys).set({ signCount, lastUsedAt: usedAt } as any).where(eq(passkeys.id, id));
  }

  async insertPasswordHistory(userId: string, passwordHash: string): Promise<void> {
    await this.db.insert(passwordHistory).values({ userId, passwordHash } as any);
  }

  async findRecentPasswordHashes(userId: string, limit: number): Promise<string[]> {
    const rows = (await this.db
      .select({ passwordHash: passwordHistory.passwordHash })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(limit)) as Array<{ passwordHash: string }>;
    return rows.map((r) => r.passwordHash);
  }
}
