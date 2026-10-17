/**
 * Persistence layer for `youtube_accounts`.
 *
 * Wraps the Drizzle calls so the OAuth and upload services never touch
 * the schema directly. All public methods take a `Db` instance so unit
 * tests can swap in fakes / transactions without a global side effect.
 *
 * Tokens are encrypted at rest (access_token_enc / refresh_token_enc via
 * services/crypto/credential-columns.ts). This module is the only place that
 * sees ciphertext: reads return decrypted tokens, writes take plaintext.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { Db } from "../../db/index.js";
import { openCredential, sealCredential } from "../crypto/credential-columns.js";

type YouTubeAccountRow = typeof schema.youtubeAccounts.$inferSelect;

/** A `youtube_accounts` row with its tokens decrypted. */
export type YouTubeAccount = Omit<YouTubeAccountRow, "accessToken" | "accessTokenEnc" | "refreshTokenEnc"> & {
  accessToken: string;
};

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

async function decrypt(row: YouTubeAccountRow): Promise<YouTubeAccount> {
  const { accessTokenEnc, refreshTokenEnc, ...rest } = row;
  return {
    ...rest,
    accessToken: (await openCredential(accessTokenEnc, row.accessToken)) ?? "",
    refreshToken: await openCredential(refreshTokenEnc, row.refreshToken),
  };
}

/** Caller's currently-active YouTube account, if any. */
export async function getActiveAccount(userId: string, db: Db = getDb()): Promise<YouTubeAccount | null> {
  const [row] = await db.select().from(youtubeAccounts)
    .where(and(eq(youtubeAccounts.userId, userId), eq(youtubeAccounts.isActive, true)))
    .limit(1);
  return row ? decrypt(row) : null;
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
  return row ? decrypt(row) : null;
}

/**
 * Upsert by (userId, googleId). Google only returns `refresh_token` on the
 * very first consent so callers should pass `null` on re-auth and we'll
 * preserve the existing one.
 */
export async function upsertAccount(input: UpsertAccountInput, db: Db = getDb()): Promise<YouTubeAccount> {
  const existing = await findAccountByGoogleId(input.userId, input.googleId, db);
  const access = await sealCredential(input.accessToken);
  const refresh = await sealCredential(input.refreshToken ?? existing?.refreshToken);

  if (existing) {
    const [updated] = await db.update(youtubeAccounts).set({
      accessToken:     access.plain,
      accessTokenEnc:  access.enc,
      refreshToken:    refresh.plain,
      refreshTokenEnc: refresh.enc,
      tokenExpiresAt: input.tokenExpiresAt,
      scopes:         input.scopes,
      channelId:      input.channelId ?? existing.channelId,
      channelTitle:   input.channelTitle ?? existing.channelTitle,
      displayName:    input.displayName ?? existing.displayName,
      email:          input.email ?? existing.email,
      isActive:       true,
      updatedAt:      new Date(),
    } as any).where(eq(youtubeAccounts.id, existing.id)).returning();
    return decrypt(updated);
  }

  const [inserted] = await db.insert(youtubeAccounts).values({
    userId:         input.userId,
    googleId:       input.googleId,
    accessToken:     access.plain,
    accessTokenEnc:  access.enc,
    refreshToken:    refresh.plain,
    refreshTokenEnc: refresh.enc,
    tokenExpiresAt: input.tokenExpiresAt,
    scopes:         input.scopes,
    channelId:      input.channelId,
    channelTitle:   input.channelTitle,
    displayName:    input.displayName,
    email:          input.email,
    isActive:       true,
  } as any).returning();
  return decrypt(inserted);
}

/** Persist a refreshed access token + new expiry. */
export async function rotateAccessToken(
  accountId: string,
  rotation: RotateTokenInput,
  db: Db = getDb(),
): Promise<void> {
  const access = await sealCredential(rotation.accessToken);
  await db.update(youtubeAccounts).set({
    accessToken:    access.plain,
    accessTokenEnc: access.enc,
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
