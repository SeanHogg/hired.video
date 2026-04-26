/**
 * Persistence layer for `youtube_accounts`.
 *
 * Wraps the Drizzle calls so the OAuth and upload services never touch
 * the schema directly. All public methods take a `Db` instance so unit
 * tests can swap in fakes / transactions without a global side effect.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { Db } from "../../db/index.js";

export type YouTubeAccount = typeof schema.youtubeAccounts.$inferSelect;

export interface UpsertAccountInput {
  userId: string;
  googleId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date;
  scopes: string;
  channelId: string | null;
  channelTitle: string | null;
  displayName: string | null;
  email: string | null;
}

export interface RotateTokenInput {
  accessToken: string;
  tokenExpiresAt: Date;
}

const { youtubeAccounts } = schema;

/** Caller's currently-active YouTube account, if any. */
export async function getActiveAccount(userId: string, db: Db = getDb()): Promise<YouTubeAccount | null> {
  const [row] = await db.select().from(youtubeAccounts)
    .where(and(eq(youtubeAccounts.userId, userId), eq(youtubeAccounts.isActive, true)))
    .limit(1);
  return row ?? null;
}

/** Lookup by (userId, googleId) — used for re-auth upserts. */
export async function findAccountByGoogleId(
  userId: string,
  googleId: string,
  db: Db = getDb(),
): Promise<YouTubeAccount | null> {
  const [row] = await db.select().from(youtubeAccounts)
    .where(and(eq(youtubeAccounts.userId, userId), eq(youtubeAccounts.googleId, googleId)))
    .limit(1);
  return row ?? null;
}

/**
 * Upsert by (userId, googleId). Google only returns `refresh_token` on the
 * very first consent so callers should pass `null` on re-auth and we'll
 * preserve the existing one.
 */
export async function upsertAccount(input: UpsertAccountInput, db: Db = getDb()): Promise<YouTubeAccount> {
  const existing = await findAccountByGoogleId(input.userId, input.googleId, db);

  if (existing) {
    const [updated] = await db.update(youtubeAccounts).set({
      accessToken:    input.accessToken,
      refreshToken:   input.refreshToken ?? existing.refreshToken,
      tokenExpiresAt: input.tokenExpiresAt,
      scopes:         input.scopes,
      channelId:      input.channelId ?? existing.channelId,
      channelTitle:   input.channelTitle ?? existing.channelTitle,
      displayName:    input.displayName ?? existing.displayName,
      email:          input.email ?? existing.email,
      isActive:       true,
      updatedAt:      new Date(),
    } as any).where(eq(youtubeAccounts.id, existing.id)).returning();
    return updated;
  }

  const [inserted] = await db.insert(youtubeAccounts).values({
    userId:         input.userId,
    googleId:       input.googleId,
    accessToken:    input.accessToken,
    refreshToken:   input.refreshToken,
    tokenExpiresAt: input.tokenExpiresAt,
    scopes:         input.scopes,
    channelId:      input.channelId,
    channelTitle:   input.channelTitle,
    displayName:    input.displayName,
    email:          input.email,
    isActive:       true,
  } as any).returning();
  return inserted;
}

/** Persist a refreshed access token + new expiry. */
export async function rotateAccessToken(
  accountId: string,
  rotation: RotateTokenInput,
  db: Db = getDb(),
): Promise<void> {
  await db.update(youtubeAccounts).set({
    accessToken:    rotation.accessToken,
    tokenExpiresAt: rotation.tokenExpiresAt,
    updatedAt:      new Date(),
  } as any).where(eq(youtubeAccounts.id, accountId));
}

/** Soft-delete: flip isActive=false for every connection owned by `userId`. */
export async function deactivateAllForUser(userId: string, db: Db = getDb()): Promise<void> {
  await db.update(youtubeAccounts)
    .set({ isActive: false, updatedAt: new Date() } as any)
    .where(eq(youtubeAccounts.userId, userId));
}

/** Public DTO — only fields safe to expose to the frontend. */
export function accountToDto(account: YouTubeAccount): {
  channelId: string | null;
  channelTitle: string;
  channelThumbnail: undefined;
  subscriberCount: undefined;
  videoCount: undefined;
  connectedAt: string;
} {
  return {
    channelId: account.channelId,
    channelTitle: account.channelTitle ?? "My YouTube Channel",
    channelThumbnail: undefined,
    subscriberCount: undefined,
    videoCount: undefined,
    connectedAt: new Date(account.createdAt).toISOString(),
  };
}
