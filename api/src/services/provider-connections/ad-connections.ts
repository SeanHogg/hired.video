/**
 * Paid-media ad-platform connections (Meta, Google Ads, LinkedIn, TikTok,
 * Bing) — the adapter over provider_connections purpose "ads" (W3-C,
 * migration 0600; was paid_media_connections). Row ids were kept, so
 * paid_media_accounts.connection_id still names the same connection.
 *
 * One connection per (workspace owner, platform): owner "user" for a
 * personal workspace, owner "workspace" (owner_id = company) for a company
 * workspace, `user_id` = the owning member either way.
 *
 *   platform ← provider   externalUserId ← external_account_id
 *   externalUserHandle ← handle   accessTokenExpiresAt ← expires_at
 *
 * Tokens are sealed with the one connection-secrets scheme (paid media was
 * always encrypted — no plaintext fallback).
 */
import { and, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  ProviderConnectionsRepository,
  type ProviderConnectionFilter,
  type ProviderConnectionRow,
} from "../../repositories/providerConnectionsRepository.js";
import { openAndResealSecret, sealConnectionSecret } from "./connection-secrets.js";

const PURPOSE = "ads" as const;
const { providerConnections } = schema;

/** The list shape GET /api/paid-media/connections has always returned. */
export interface AdConnectionView {
  id: string;
  userId: string;
  companyId: string | null;
  platform: string;
  externalUserId: string | null;
  externalUserHandle: string | null;
  scopes: string;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  accessTokenExpiresAt: Date | null;
  createdAt: Date;
}

/** What token refresh needs — tokens stay sealed until opened. */
export interface AdConnectionTokens {
  id: string;
  platform: string;
  status: string;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
}

export interface AdOAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: Date | null;
  scopes: string;
  externalUserId?: string | null;
  externalUserHandle?: string | null;
}

function ownerFilter(userId: string, companyId: string | null): ProviderConnectionFilter {
  return companyId == null
    ? { purpose: PURPOSE, ownerKind: "user", ownerId: userId, userId, companyId: null }
    : { purpose: PURPOSE, ownerKind: "workspace", ownerId: companyId, userId, companyId };
}

function toView(row: ProviderConnectionRow): AdConnectionView {
  return {
    id: row.id,
    userId: row.userId ?? "",
    companyId: row.companyId,
    platform: row.provider,
    externalUserId: row.externalAccountId,
    externalUserHandle: row.handle,
    scopes: row.scopes ?? "",
    status: row.status,
    lastSyncedAt: row.lastSyncAt,
    lastError: row.lastError,
    accessTokenExpiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export class AdConnections {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db = getDb()) {
    this.connections = new ProviderConnectionsRepository(db);
  }

  /** Persist an OAuth result for the workspace owner; returns the connection id. */
  async saveOAuth(owner: { userId: string; companyId: string | null }, platform: string, tokens: AdOAuthTokens): Promise<string> {
    const accessTokenEnc = await sealConnectionSecret(tokens.accessToken);
    const refreshTokenEnc = await sealConnectionSecret(tokens.refreshToken);
    const match = { ...ownerFilter(owner.userId, owner.companyId), provider: platform };
    const existing = await this.connections.findOne(match);
    if (existing) {
      await this.connections.updateById(existing.id, {
        externalAccountId: tokens.externalUserId ?? existing.externalAccountId,
        handle: tokens.externalUserHandle ?? existing.handle,
        accessTokenEnc,
        refreshTokenEnc: refreshTokenEnc ?? existing.refreshTokenEnc,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        status: "active",
        lastError: null,
      });
      return existing.id;
    }
    const row = await this.connections.insert({
      ownerKind: match.ownerKind!,
      ownerId: match.ownerId as string,
      userId: owner.userId,
      companyId: owner.companyId,
      provider: platform,
      purpose: PURPOSE,
      externalAccountId: tokens.externalUserId ?? null,
      handle: tokens.externalUserHandle ?? null,
      accessTokenEnc,
      refreshTokenEnc,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      status: "active",
    });
    return row.id;
  }

  async setLastError(id: string, message: string): Promise<void> {
    await this.connections.update({ id, purpose: PURPOSE }, { lastError: message });
  }

  /** Connections visible to an actor: personal rows of `userIds`, plus every
   *  row of the `companyIds` workspaces. */
  async listForWorkspaces(userIds: string[], companyIds: string[]): Promise<AdConnectionView[]> {
    const personal = and(inArray(providerConnections.userId, userIds), isNull(providerConnections.companyId));
    const company = companyIds.length ? inArray(providerConnections.companyId, companyIds) : undefined;
    const rows = await this.connections.listWhere({ purpose: PURPOSE }, or(personal, company));
    return rows.map(toView);
  }

  async findOwner(id: string): Promise<{ id: string; userId: string; companyId: string | null } | null> {
    const row = await this.connections.findOne({ id, purpose: PURPOSE });
    return row ? { id: row.id, userId: row.userId ?? "", companyId: row.companyId } : null;
  }

  async remove(id: string): Promise<void> {
    await this.connections.delete({ id, purpose: PURPOSE });
  }

  async tokensFor(id: string): Promise<AdConnectionTokens | null> {
    const row = await this.connections.findOne({ id, purpose: PURPOSE });
    if (!row) return null;
    return {
      id: row.id,
      platform: row.provider,
      status: row.status,
      accessTokenEnc: row.accessTokenEnc,
      refreshTokenEnc: row.refreshTokenEnc,
      accessTokenExpiresAt: row.expiresAt,
    };
  }

  /** Decrypt one token (re-sealing a legacy value). */
  async open(conn: AdConnectionTokens, column: "accessTokenEnc" | "refreshTokenEnc"): Promise<string> {
    const stored = conn[column];
    const value = await openAndResealSecret(stored, (next) =>
      this.connections.resealSecret(conn.id, column, stored as string, next),
    );
    return value ?? "";
  }

  async markExpired(id: string, message: string): Promise<void> {
    await this.connections.update({ id, purpose: PURPOSE }, { status: "expired", lastError: message });
  }

  async saveRefreshed(conn: AdConnectionTokens, tokens: { accessToken: string; refreshToken?: string | null; expiresAt: Date | null }): Promise<void> {
    const accessTokenEnc = await sealConnectionSecret(tokens.accessToken);
    const refreshTokenEnc = tokens.refreshToken ? await sealConnectionSecret(tokens.refreshToken) : conn.refreshTokenEnc;
    await this.connections.update(
      { id: conn.id, purpose: PURPOSE },
      { accessTokenEnc, refreshTokenEnc, expiresAt: tokens.expiresAt, status: "active", lastError: null },
    );
  }
}
