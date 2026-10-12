/**
 * Paid-media sync: resolve an ad account to a live access token
 * (decrypt, refresh when expiring, persist the rotated token).
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { decryptSecret } from "./secrets.js";
import { getAdapter, type PaidMediaEnv } from "./ports/registry.js";
import type { PaidMediaPlatform } from "../../db/schema/paidmedia.js";

export type DbHandle = ReturnType<typeof getDb>;

export interface ResolvedAccount {
  accountId: string;
  connectionId: string;
  platform: PaidMediaPlatform;
  externalAccountId: string;
  accessToken: string;
}

export async function resolveAccount(d: DbHandle, env: PaidMediaEnv, accountId: string): Promise<ResolvedAccount> {
  const [account] = await d.select().from(schema.paidMediaAccounts).where(eq(schema.paidMediaAccounts.id, accountId)).limit(1);
  if (!account) throw new Error(`paid_media_accounts ${accountId} not found`);
  const [connection] = await d.select().from(schema.paidMediaConnections).where(eq(schema.paidMediaConnections.id, account.connectionId)).limit(1);
  if (!connection) throw new Error(`paid_media_connections ${account.connectionId} not found`);
  const accessToken = await ensureFreshToken(d, env, connection);
  return {
    accountId,
    connectionId: connection.id,
    platform:     account.platform as PaidMediaPlatform,
    externalAccountId: account.externalAccountId,
    accessToken,
  };
}

/** Decrypt the connection's access token and refresh it if expired
 *  (or about to expire within 60s). Persists the new token+expiry. */
async function ensureFreshToken(d: DbHandle, env: PaidMediaEnv, connection: typeof schema.paidMediaConnections.$inferSelect): Promise<string> {
  const now = Date.now();
  const expiresAt = connection.accessTokenExpiresAt ? connection.accessTokenExpiresAt.getTime() : null;
  if (expiresAt && expiresAt - now > 60_000) {
    return decryptSecret(env, connection.accessTokenEnc);
  }
  if (!connection.refreshTokenEnc) {
    // No refresh path — caller must reconnect. Mark expired so UI can prompt.
    if (connection.status !== "expired") {
      await d.update(schema.paidMediaConnections)
        .set({ status: "expired", lastError: "Access token expired and no refresh_token available", updatedAt: new Date() })
        .where(eq(schema.paidMediaConnections.id, connection.id));
    }
    return decryptSecret(env, connection.accessTokenEnc); // surface to adapter so the platform returns its own 401
  }
  const refreshToken = await decryptSecret(env, connection.refreshTokenEnc);
  const adapter = getAdapter(env, connection.platform as PaidMediaPlatform);
  const tokens = await adapter.refreshAccessToken(refreshToken);
  const { encryptSecret } = await import("./secrets.js");
  const accessTokenEnc = await encryptSecret(env, tokens.accessToken);
  const refreshTokenEnc = tokens.refreshToken ? await encryptSecret(env, tokens.refreshToken) : connection.refreshTokenEnc;
  await d.update(schema.paidMediaConnections)
    .set({
      accessTokenEnc,
      refreshTokenEnc,
      accessTokenExpiresAt: tokens.expiresAt,
      status:               "active",
      lastError:            null,
      updatedAt:            new Date(),
    })
    .where(eq(schema.paidMediaConnections.id, connection.id));
  return tokens.accessToken;
}
