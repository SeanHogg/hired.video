/**
 * Paid-media sync: resolve an ad account to a live access token
 * (decrypt, refresh when expiring, persist the rotated token).
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getAdapter, type PaidMediaEnv } from "./ports/registry.js";
import type { PaidMediaPlatform } from "../../db/schema/paidmedia.js";
import { AdConnections, type AdConnectionTokens } from "../provider-connections/ad-connections.js";

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
  const adConnections = new AdConnections(d);
  const connection = await adConnections.tokensFor(account.connectionId);
  if (!connection) throw new Error(`ads connection ${account.connectionId} not found`);
  const accessToken = await ensureFreshToken(adConnections, env, connection);
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
async function ensureFreshToken(adConnections: AdConnections, env: PaidMediaEnv, connection: AdConnectionTokens): Promise<string> {
  const now = Date.now();
  const expiresAt = connection.accessTokenExpiresAt ? connection.accessTokenExpiresAt.getTime() : null;
  if (expiresAt && expiresAt - now > 60_000) {
    return adConnections.open(connection, "accessTokenEnc");
  }
  if (!connection.refreshTokenEnc) {
    // No refresh path — caller must reconnect. Mark expired so UI can prompt.
    if (connection.status !== "expired") {
      await adConnections.markExpired(connection.id, "Access token expired and no refresh_token available");
    }
    return adConnections.open(connection, "accessTokenEnc"); // surface to adapter so the platform returns its own 401
  }
  const refreshToken = await adConnections.open(connection, "refreshTokenEnc");
  const adapter = getAdapter(env, connection.platform as PaidMediaPlatform);
  const tokens = await adapter.refreshAccessToken(refreshToken);
  await adConnections.saveRefreshed(connection, tokens);
  return tokens.accessToken;
}
