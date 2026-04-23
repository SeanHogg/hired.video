/**
 * PreferencesRepository — all userId-keyed preference tables:
 *   • accountPreferences — theme / language / timezone / email toggles
 *   • privacyPreferences — who can see what
 *   • cookiePreferences  — opt-in cookie categories
 *   • jobPreferences     — desired title / location / salary etc.
 *
 * These share the same "one row per user, upsert semantics" shape, so
 * one repository keeps the CRUD patterns uniform.
 */

import { eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { accountPreferences, privacyPreferences, cookiePreferences, jobPreferences } = schema;

export type DbLike = any;

export type AccountPreferencesRow = typeof accountPreferences.$inferSelect;
export type AccountPreferencesInsert = typeof accountPreferences.$inferInsert;
export type PrivacyPreferencesRow = typeof privacyPreferences.$inferSelect;
export type PrivacyPreferencesInsert = typeof privacyPreferences.$inferInsert;
export type CookiePreferencesRow = typeof cookiePreferences.$inferSelect;
export type CookiePreferencesInsert = typeof cookiePreferences.$inferInsert;
export type JobPreferencesRow = typeof jobPreferences.$inferSelect;
export type JobPreferencesInsert = typeof jobPreferences.$inferInsert;

export interface IPreferencesRepository {
  findAccountByUserId(userId: string): Promise<AccountPreferencesRow | null>;
  upsertAccount(userId: string, patch: Partial<AccountPreferencesInsert>): Promise<void>;
  findPrivacyByUserId(userId: string): Promise<PrivacyPreferencesRow | null>;
  upsertPrivacy(userId: string, patch: Partial<PrivacyPreferencesInsert>): Promise<void>;
  findCookieByUserId(userId: string): Promise<CookiePreferencesRow | null>;
  upsertCookie(userId: string, patch: Partial<CookiePreferencesInsert>): Promise<void>;
  findJobByUserId(userId: string): Promise<JobPreferencesRow | null>;
  upsertJob(userId: string, patch: Partial<JobPreferencesInsert>): Promise<void>;
}

export class PreferencesRepository implements IPreferencesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findAccountByUserId(userId: string): Promise<AccountPreferencesRow | null> {
    const [row] = await this.db.select().from(accountPreferences).where(eq(accountPreferences.userId, userId)).limit(1);
    return (row as AccountPreferencesRow) ?? null;
  }

  async upsertAccount(userId: string, patch: Partial<AccountPreferencesInsert>): Promise<void> {
    const values = { userId, ...patch, updatedAt: this.now() };
    await this.db
      .insert(accountPreferences)
      .values(values as any)
      .onConflictDoUpdate({
        target: accountPreferences.userId,
        set: { ...patch, updatedAt: this.now() } as any,
      });
  }

  async findPrivacyByUserId(userId: string): Promise<PrivacyPreferencesRow | null> {
    const [row] = await this.db.select().from(privacyPreferences).where(eq(privacyPreferences.userId, userId)).limit(1);
    return (row as PrivacyPreferencesRow) ?? null;
  }

  async upsertPrivacy(userId: string, patch: Partial<PrivacyPreferencesInsert>): Promise<void> {
    const values = { userId, ...patch, updatedAt: this.now() };
    await this.db
      .insert(privacyPreferences)
      .values(values as any)
      .onConflictDoUpdate({
        target: privacyPreferences.userId,
        set: { ...patch, updatedAt: this.now() } as any,
      });
  }

  async findCookieByUserId(userId: string): Promise<CookiePreferencesRow | null> {
    const [row] = await this.db.select().from(cookiePreferences).where(eq(cookiePreferences.userId, userId)).limit(1);
    return (row as CookiePreferencesRow) ?? null;
  }

  async upsertCookie(userId: string, patch: Partial<CookiePreferencesInsert>): Promise<void> {
    const values = { userId, ...patch, updatedAt: this.now(), consentedAt: this.now() };
    await this.db
      .insert(cookiePreferences)
      .values(values as any)
      .onConflictDoUpdate({
        target: cookiePreferences.userId,
        set: { ...patch, updatedAt: this.now(), consentedAt: this.now() } as any,
      });
  }

  async findJobByUserId(userId: string): Promise<JobPreferencesRow | null> {
    const [row] = await this.db.select().from(jobPreferences).where(eq(jobPreferences.userId, userId)).limit(1);
    return (row as JobPreferencesRow) ?? null;
  }

  async upsertJob(userId: string, patch: Partial<JobPreferencesInsert>): Promise<void> {
    const values = { userId, ...patch, updatedAt: this.now() };
    await this.db
      .insert(jobPreferences)
      .values(values as any)
      .onConflictDoUpdate({
        target: jobPreferences.userId,
        set: { ...patch, updatedAt: this.now() } as any,
      });
  }
}
