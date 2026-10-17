/**
 * AuthTokensRepository — the authentication-credential aggregate.
 *
 * Covers every short-lived and long-lived token / proof-of-identity:
 *   • passwordResetTokens, emailVerificationTokens, twoFactorCodes
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

import { and, eq, gt } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  passwordResetTokens,
  emailVerificationTokens,
  twoFactorCodes,
  refreshTokens,
  webauthnCredentials: passkeys,
  passwordHistory,
} = schema;

export type DbLike = any;

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type PasswordResetTokenInsert = typeof passwordResetTokens.$inferInsert;
export type EmailVerificationTokenRow = typeof emailVerificationTokens.$inferSelect;
export type EmailVerificationTokenInsert = typeof emailVerificationTokens.$inferInsert;
export type TwoFactorCodeRow = typeof twoFactorCodes.$inferSelect;
export type TwoFactorCodeInsert = typeof twoFactorCodes.$inferInsert;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type RefreshTokenInsert = typeof refreshTokens.$inferInsert;
export type PasskeyRow = typeof passkeys.$inferSelect;
export type PasskeyInsert = typeof passkeys.$inferInsert;

export interface IAuthTokensRepository {
  findValidPasswordResetToken(token: string): Promise<PasswordResetTokenRow | null>;
  invalidatePasswordResetsForUser(userId: string): Promise<void>;
  insertPasswordResetToken(input: PasswordResetTokenInsert): Promise<void>;
  markPasswordResetUsed(id: string): Promise<void>;
  findValidEmailVerificationToken(token: string): Promise<EmailVerificationTokenRow | null>;
  insertEmailVerificationToken(input: EmailVerificationTokenInsert): Promise<void>;
  markEmailVerificationUsed(id: string): Promise<void>;
  insertTwoFactorCode(input: TwoFactorCodeInsert): Promise<void>;
  findValid2faCode(userId: string, code: string): Promise<TwoFactorCodeRow | null>;
  markTwoFactorCodeUsed(id: string): Promise<void>;
  insertRefreshToken(input: RefreshTokenInsert): Promise<void>;
  findRefreshToken(token: string): Promise<RefreshTokenRow | null>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteRefreshTokensForUser(userId: string): Promise<void>;
  findPasskeyByCredentialId(credentialId: string): Promise<PasskeyRow | null>;
  findPasskeysForUser(userId: string): Promise<PasskeyRow[]>;
  insertPasskey(input: PasskeyInsert): Promise<PasskeyRow>;
  deletePasskey(id: string, userId: string): Promise<boolean>;
  insertPasswordHistory(userId: string, passwordHash: string): Promise<void>;
}

export class AuthTokensRepository implements IAuthTokensRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findValidPasswordResetToken(token: string): Promise<PasswordResetTokenRow | null> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, this.now()),
      ))
      .limit(1);
    return (row as PasswordResetTokenRow) ?? null;
  }

  async invalidatePasswordResetsForUser(userId: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ used: true } as any)
      .where(eq(passwordResetTokens.userId, userId));
  }

  async insertPasswordResetToken(input: PasswordResetTokenInsert): Promise<void> {
    await this.db.insert(passwordResetTokens).values(input as any);
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await this.db.update(passwordResetTokens).set({ used: true } as any).where(eq(passwordResetTokens.id, id));
  }

  async findValidEmailVerificationToken(token: string): Promise<EmailVerificationTokenRow | null> {
    const [row] = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(and(
        eq(emailVerificationTokens.token, token),
        eq(emailVerificationTokens.used, false),
        gt(emailVerificationTokens.expiresAt, this.now()),
      ))
      .limit(1);
    return (row as EmailVerificationTokenRow) ?? null;
  }

  async insertEmailVerificationToken(input: EmailVerificationTokenInsert): Promise<void> {
    await this.db.insert(emailVerificationTokens).values(input as any);
  }

  async markEmailVerificationUsed(id: string): Promise<void> {
    await this.db.update(emailVerificationTokens).set({ used: true } as any).where(eq(emailVerificationTokens.id, id));
  }

  async insertTwoFactorCode(input: TwoFactorCodeInsert): Promise<void> {
    await this.db.insert(twoFactorCodes).values(input as any);
  }

  async findValid2faCode(userId: string, code: string): Promise<TwoFactorCodeRow | null> {
    const [row] = await this.db
      .select()
      .from(twoFactorCodes)
      .where(and(
        eq(twoFactorCodes.userId, userId),
        eq(twoFactorCodes.code, code),
        eq(twoFactorCodes.used, false),
        gt(twoFactorCodes.expiresAt, this.now()),
      ))
      .limit(1);
    return (row as TwoFactorCodeRow) ?? null;
  }

  async markTwoFactorCodeUsed(id: string): Promise<void> {
    await this.db.update(twoFactorCodes).set({ used: true } as any).where(eq(twoFactorCodes.id, id));
  }

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

  async insertPasswordHistory(userId: string, passwordHash: string): Promise<void> {
    await this.db.insert(passwordHistory).values({ userId, passwordHash } as any);
  }
}
