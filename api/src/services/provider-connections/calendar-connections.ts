/**
 * Connected calendars (Google, Outlook) — the adapter over
 * provider_connections purpose "calendar" (W3-C, migration 0600; was
 * calendar_connections). Row ids were kept, so
 * scheduled_events.calendar_connection_id still names the same calendar.
 *
 *   calendarName ← handle      calendarId ← config.calendarId
 *   isActive ← status "active"  syncEnabled ← enabled
 *
 * Tokens are sealed with the one connection-secrets scheme; calendar wrote
 * plaintext before CREDENTIALS_KMS_KEY existed, so it keeps the plaintext
 * fallback for a key-less environment.
 */
import { getDb } from "../../db/index.js";
import {
  ProviderConnectionsRepository,
  type ProviderConnectionRow,
} from "../../repositories/providerConnectionsRepository.js";
import { openAndResealSecret, sealConnectionSecret } from "./connection-secrets.js";

const PURPOSE = "calendar" as const;
const SEAL = { allowPlaintextFallback: true } as const;

/** The public list shape GET /api/calendar/connections has always returned. */
export interface CalendarConnectionView {
  id: string;
  provider: string;
  calendarName: string | null;
  isActive: boolean;
  syncEnabled: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

/** What a sync run needs — tokens stay sealed until `openTokens`. */
export interface SyncableCalendar {
  id: string;
  provider: string;
  tokenExpiresAt: Date | null;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
}

export class CalendarConnections {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db = getDb()) {
    this.connections = new ProviderConnectionsRepository(db);
  }

  async listForUser(userId: string): Promise<CalendarConnectionView[]> {
    const rows = await this.connections.list({ purpose: PURPOSE, userId });
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      calendarName: r.handle,
      isActive: r.status === "active",
      syncEnabled: r.enabled,
      lastSyncedAt: r.lastSyncAt,
      createdAt: r.createdAt,
    }));
  }

  /** Soft-disconnect (kept for scheduled_events history). False = not the caller's. */
  async disconnect(id: string, userId: string): Promise<boolean> {
    const updated = await this.connections.update({ id, purpose: PURPOSE, userId }, { status: "revoked" });
    return updated.length > 0;
  }

  /** Store the tokens from an OAuth callback — one calendar per (user, provider). */
  async saveOAuth(input: {
    userId: string;
    provider: string;
    calendarName: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date;
  }): Promise<void> {
    const accessTokenEnc = await sealConnectionSecret(input.accessToken, SEAL);
    const refreshTokenEnc = await sealConnectionSecret(input.refreshToken, SEAL);
    await this.connections.upsert(
      { purpose: PURPOSE, userId: input.userId, provider: input.provider },
      {
        ownerKind: "user",
        ownerId: input.userId,
        userId: input.userId,
        provider: input.provider,
        purpose: PURPOSE,
        handle: input.calendarName,
        accessTokenEnc,
        refreshTokenEnc,
        expiresAt: input.expiresAt,
        status: "active",
        enabled: true,
      },
      {
        accessTokenEnc,
        ...(refreshTokenEnc ? { refreshTokenEnc } : {}),
        expiresAt: input.expiresAt,
        status: "active",
        enabled: true,
      },
    );
  }

  /** Active calendars to sync for a user. */
  async listActive(userId: string): Promise<SyncableCalendar[]> {
    const rows = await this.connections.list({ purpose: PURPOSE, userId, status: "active" });
    return rows.map(toSyncable);
  }

  async markSynced(id: string): Promise<void> {
    await this.connections.update({ id, purpose: PURPOSE }, { lastSyncAt: new Date() });
  }

  /** Decrypt both tokens (re-sealing a legacy value). */
  async openTokens(conn: SyncableCalendar): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    const reseal = (column: "accessTokenEnc" | "refreshTokenEnc", stored: string | null) =>
      openAndResealSecret(stored, (next) => this.connections.resealSecret(conn.id, column, stored as string, next));
    return {
      accessToken: await reseal("accessTokenEnc", conn.accessTokenEnc),
      refreshToken: await reseal("refreshTokenEnc", conn.refreshTokenEnc),
    };
  }

  /** Persist a refreshed access token (and a rotated refresh token). */
  async saveRefreshed(id: string, tokens: { accessToken: string; refreshToken?: string; expiresAt: Date }): Promise<void> {
    const accessTokenEnc = await sealConnectionSecret(tokens.accessToken, SEAL);
    const refreshTokenEnc = tokens.refreshToken ? await sealConnectionSecret(tokens.refreshToken, SEAL) : null;
    await this.connections.update(
      { id, purpose: PURPOSE },
      { accessTokenEnc, ...(refreshTokenEnc ? { refreshTokenEnc } : {}), expiresAt: tokens.expiresAt },
    );
  }
}

function toSyncable(row: ProviderConnectionRow): SyncableCalendar {
  return {
    id: row.id,
    provider: row.provider,
    tokenExpiresAt: row.expiresAt,
    accessTokenEnc: row.accessTokenEnc,
    refreshTokenEnc: row.refreshTokenEnc,
  };
}
