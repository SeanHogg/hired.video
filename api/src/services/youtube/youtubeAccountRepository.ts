/**
 * YouTube channel connections — the adapter over provider_connections
 * (purpose "youtube", provider "google", W3-C migration 0600; was
 * youtube_accounts).
 *
 *   googleId ← external_account_id   channelTitle ← handle
 *   channelId / email ← config       isActive ← status "active"
 *
 * Wraps the data access so the OAuth and upload services never touch the
 * schema directly. All public methods take a `Db` instance so unit tests can
 * swap in fakes / transactions without a global side effect.
 *
 * Tokens are sealed with the one provider_connections scheme
 * (services/provider-connections/connection-secrets.ts). This module is the
 * only place that sees ciphertext: reads return decrypted tokens (re-sealing
 * a legacy value on the way), writes take plaintext.
 */
import { getDb } from "../../db/index.js";
import type { Db } from "../../db/index.js";
import {
  ProviderConnectionsRepository,
  type ProviderConnectionRow,
} from "../../repositories/providerConnectionsRepository.js";
import {
  openAndResealSecret,
  sealConnectionSecret,
} from "../provider-connections/connection-secrets.js";

const PURPOSE = "youtube" as const;
const PROVIDER = "google";
/** YouTube wrote plaintext before CREDENTIALS_KMS_KEY existed — keep that. */
const SEAL = { allowPlaintextFallback: true } as const;

/** A connected YouTube channel with its tokens decrypted. */
export interface YouTubeAccount {
  id: string;
  userId: string;
  googleId: string;
  channelId: string | null;
  channelTitle: string | null;
  displayName: string | null;
  email: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

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

function repo(db: Db): ProviderConnectionsRepository {
  return new ProviderConnectionsRepository(db);
}

function configString(row: ProviderConnectionRow, key: string): string | null {
  const v = (row.config ?? {})[key];
  return typeof v === "string" ? v : null;
}

async function decrypt(row: ProviderConnectionRow, db: Db): Promise<YouTubeAccount> {
  const connections = repo(db);
  const reseal = (column: "accessTokenEnc" | "refreshTokenEnc", stored: string | null) =>
    openAndResealSecret(stored, (next) => connections.resealSecret(row.id, column, stored as string, next));
  return {
    id: row.id,
    userId: row.userId ?? "",
    googleId: row.externalAccountId ?? "",
    channelId: configString(row, "channelId"),
    channelTitle: row.handle,
    displayName: row.displayName,
    email: configString(row, "email"),
    accessToken: (await reseal("accessTokenEnc", row.accessTokenEnc)) ?? "",
    refreshToken: await reseal("refreshTokenEnc", row.refreshTokenEnc),
    tokenExpiresAt: row.expiresAt,
    scopes: row.scopes,
    isActive: row.status === "active",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Caller's currently-active YouTube account, if any. */
export async function getActiveAccount(userId: string, db: Db = getDb()): Promise<YouTubeAccount | null> {
  const row = await repo(db).findOne({ purpose: PURPOSE, userId, status: "active" });
  return row ? decrypt(row, db) : null;
}

/** Lookup by (userId, googleId) — used for re-auth upserts. */
export async function findAccountByGoogleId(
  userId: string,
  googleId: string,
  db: Db = getDb(),
): Promise<YouTubeAccount | null> {
  const row = await repo(db).findOne({ purpose: PURPOSE, userId, externalAccountId: googleId });
  return row ? decrypt(row, db) : null;
}

/**
 * Upsert by (userId, googleId). Google only returns `refresh_token` on the
 * very first consent so callers should pass `null` on re-auth and we'll
 * preserve the existing one.
 */
export async function upsertAccount(input: UpsertAccountInput, db: Db = getDb()): Promise<YouTubeAccount> {
  const existing = await findAccountByGoogleId(input.userId, input.googleId, db);
  const accessTokenEnc = await sealConnectionSecret(input.accessToken, SEAL);
  const refreshTokenEnc = await sealConnectionSecret(input.refreshToken ?? existing?.refreshToken, SEAL);
  const channelId = input.channelId ?? existing?.channelId ?? null;
  const email = input.email ?? existing?.email ?? null;
  const fields = {
    accessTokenEnc,
    refreshTokenEnc,
    expiresAt: input.tokenExpiresAt,
    scopes: input.scopes,
    handle: input.channelTitle ?? existing?.channelTitle ?? null,
    displayName: input.displayName ?? existing?.displayName ?? null,
    config: {
      ...(channelId ? { channelId } : {}),
      ...(email ? { email } : {}),
    },
    status: "active" as const,
    lastError: null,
  };

  const connections = repo(db);
  const row = existing
    ? await connections.updateById(existing.id, fields)
    : await connections.insert({
        ownerKind: "user",
        ownerId: input.userId,
        userId: input.userId,
        provider: PROVIDER,
        purpose: PURPOSE,
        externalAccountId: input.googleId,
        ...fields,
      });
  if (!row) throw new Error(`YouTube connection ${existing?.id} disappeared during upsert`);
  return decrypt(row, db);
}

/** Persist a refreshed access token + new expiry. */
export async function rotateAccessToken(
  accountId: string,
  rotation: RotateTokenInput,
  db: Db = getDb(),
): Promise<void> {
  await repo(db).update(
    { id: accountId, purpose: PURPOSE },
    { accessTokenEnc: await sealConnectionSecret(rotation.accessToken, SEAL), expiresAt: rotation.tokenExpiresAt },
  );
}

/** Soft-delete: revoke every connection owned by `userId` (kept for audit). */
export async function deactivateAllForUser(userId: string, db: Db = getDb()): Promise<void> {
  await repo(db).update({ purpose: PURPOSE, userId }, { status: "revoked" });
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
