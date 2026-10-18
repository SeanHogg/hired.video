/**
 * ExternalEmailAccountsRepository — the connected-mailbox adapter over
 * provider_connections (purpose "email_inbox", W3-C migration 0600; was
 * external_email_accounts). Row ids were kept, so external_email_messages /
 * email_sync_runs still point at the same mailbox.
 *
 * Maps a provider connection to the mailbox shape the inbox code has always
 * used:
 *   accountEmail ← external_account_id   accountLabel ← handle
 *   oauthRefreshTokenEnc ← refresh_token_enc (open with connection-secrets.ts)
 *   status "paused" ⇄ status active + enabled = false
 *   sync cursors / push subscription ← config
 *
 * Encryption is a service-layer concern: the adapter stores whatever's in
 * `oauthRefreshTokenEnc` verbatim. Callers (email-integration route, oauth.ts)
 * seal / open it.
 */
import { and, eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import {
  ProviderConnectionsRepository,
  type ProviderConnectionFilter,
  type ProviderConnectionPatch,
  type ProviderConnectionRow,
} from "./providerConnectionsRepository.js";

const { providerConnections } = schema;

export type DbLike = any;

const PURPOSE = "email_inbox" as const;

/** Mailbox status as the API has always reported it. */
export type ExternalEmailAccountStatus = "active" | "paused" | "error" | "expired" | "revoked";

export interface ExternalEmailAccountRow {
  id: string;
  userId: string;
  provider: string;
  accountEmail: string;
  accountLabel: string | null;
  oauthRefreshTokenEnc: string | null;
  pushSubscriptionId: string | null;
  pushExpiresAt: Date | null;
  lastSyncedAt: Date | null;
  /** Gmail `users.history.list` cursor. */
  lastHistoryId: string | null;
  /** Outlook Graph `/me/messages/delta` link. */
  lastDeltaLink: string | null;
  scopes: string[] | null;
  status: string;
  lastError: string | null;
  /** numeric(4,3) as text, e.g. "0.500". */
  minRelevanceScore: string;
  activeProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ExternalEmailAccountInsert = Partial<ExternalEmailAccountRow> & {
  userId: string;
  provider: string;
  accountEmail: string;
};
export type ExternalEmailAccountPatch = Partial<ExternalEmailAccountRow>;

export interface IExternalEmailAccountsRepository {
  findAllForUser(userId: string): Promise<ExternalEmailAccountRow[]>;
  findById(id: string, userId: string): Promise<ExternalEmailAccountRow | null>;
  findByProviderEmail(
    userId: string,
    provider: string,
    email: string,
  ): Promise<ExternalEmailAccountRow | null>;
  upsert(input: ExternalEmailAccountInsert): Promise<ExternalEmailAccountRow>;
  patch(id: string, userId: string, patch: ExternalEmailAccountPatch): Promise<void>;
  remove(id: string, userId: string): Promise<void>;
  /** Mailboxes counted against the inbox cap (active, not paused). */
  countActiveForUser(userId: string): Promise<number>;
}

/** Join helpers for the messages repository (mailbox label / email / floor). */
export const mailboxJoin = {
  table: providerConnections,
  on: (accountIdColumn: unknown) => and(eq(providerConnections.id, accountIdColumn as any), eq(providerConnections.purpose, PURPOSE)),
  accountLabel: providerConnections.handle,
  accountEmail: providerConnections.externalAccountId,
  /** NULL only for a row that is not a mailbox — the inner join excludes those. */
  minRelevanceScore: providerConnections.minRelevanceScore,
};

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toScopes(scopes: string | null): string[] | null {
  if (!scopes) return null;
  return scopes.split(" ").filter(Boolean);
}

export function toMailbox(row: ProviderConnectionRow): ExternalEmailAccountRow {
  const config = (row.config ?? {}) as Record<string, unknown>;
  const pushExpiresAt = str(config.pushExpiresAt);
  return {
    id: row.id,
    userId: row.userId ?? "",
    provider: row.provider,
    accountEmail: row.externalAccountId ?? "",
    accountLabel: row.handle,
    oauthRefreshTokenEnc: row.refreshTokenEnc,
    pushSubscriptionId: str(config.pushSubscriptionId),
    pushExpiresAt: pushExpiresAt ? new Date(pushExpiresAt) : null,
    lastSyncedAt: row.lastSyncAt,
    lastHistoryId: str(config.lastHistoryId),
    lastDeltaLink: str(config.lastDeltaLink),
    scopes: toScopes(row.scopes),
    status: row.status === "active" && !row.enabled ? "paused" : row.status,
    lastError: row.lastError,
    minRelevanceScore: row.minRelevanceScore ?? "0.500",
    activeProfileId: row.activeProfileId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** A mailbox patch as a provider_connections patch. */
function toPatch(patch: ExternalEmailAccountPatch): ProviderConnectionPatch {
  const out: ProviderConnectionPatch = {};
  const config: Record<string, unknown> = {};
  if (patch.provider !== undefined) out.provider = patch.provider;
  if (patch.accountEmail !== undefined) out.externalAccountId = patch.accountEmail;
  if (patch.accountLabel !== undefined) out.handle = patch.accountLabel;
  if (patch.oauthRefreshTokenEnc !== undefined) out.refreshTokenEnc = patch.oauthRefreshTokenEnc;
  if (patch.lastSyncedAt !== undefined) out.lastSyncAt = patch.lastSyncedAt;
  if (patch.scopes !== undefined) {
    const scopes = patch.scopes as unknown;
    out.scopes = Array.isArray(scopes) ? scopes.join(" ") : typeof scopes === "string" ? scopes : null;
  }
  if (patch.status !== undefined) {
    if (patch.status === "paused") {
      out.status = "active";
      out.enabled = false;
    } else {
      out.status = patch.status === "expired" || patch.status === "revoked" || patch.status === "error" ? patch.status : "active";
      out.enabled = true;
    }
  }
  if (patch.lastError !== undefined) out.lastError = patch.lastError;
  if (patch.minRelevanceScore !== undefined) out.minRelevanceScore = patch.minRelevanceScore;
  if (patch.activeProfileId !== undefined) out.activeProfileId = patch.activeProfileId;
  if (patch.pushSubscriptionId !== undefined) config.pushSubscriptionId = patch.pushSubscriptionId;
  if (patch.pushExpiresAt !== undefined) config.pushExpiresAt = patch.pushExpiresAt ? new Date(patch.pushExpiresAt).toISOString() : null;
  if (patch.lastHistoryId !== undefined) config.lastHistoryId = patch.lastHistoryId;
  if (patch.lastDeltaLink !== undefined) config.lastDeltaLink = patch.lastDeltaLink;
  if (Object.keys(config).length > 0) out.configMerge = config;
  return out;
}

function owned(id: string, userId: string): ProviderConnectionFilter {
  return { id, purpose: PURPOSE, userId };
}

export class ExternalEmailAccountsRepository implements IExternalEmailAccountsRepository {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db: DbLike, now: () => Date = () => new Date()) {
    this.connections = new ProviderConnectionsRepository(db, now);
  }

  async findAllForUser(userId: string): Promise<ExternalEmailAccountRow[]> {
    return (await this.connections.list({ purpose: PURPOSE, userId })).map(toMailbox);
  }

  async findById(id: string, userId: string): Promise<ExternalEmailAccountRow | null> {
    const row = await this.connections.findOne(owned(id, userId));
    return row ? toMailbox(row) : null;
  }

  async findByProviderEmail(
    userId: string,
    provider: string,
    email: string,
  ): Promise<ExternalEmailAccountRow | null> {
    const row = await this.connections.findOne({ purpose: PURPOSE, userId, provider, externalAccountId: email });
    return row ? toMailbox(row) : null;
  }

  async upsert(input: ExternalEmailAccountInsert): Promise<ExternalEmailAccountRow> {
    const patch = toPatch(input);
    const { configMerge, ...fields } = patch;
    const row = await this.connections.upsert(
      { purpose: PURPOSE, userId: input.userId, provider: input.provider, externalAccountId: input.accountEmail },
      {
        ...fields,
        ownerKind: "user",
        ownerId: input.userId,
        userId: input.userId,
        provider: input.provider,
        purpose: PURPOSE,
        externalAccountId: input.accountEmail,
        // Newly connected mailboxes get the "relevant mail only" floor.
        minRelevanceScore: fields.minRelevanceScore ?? "0.500",
        config: configMerge ?? {},
      },
      patch,
    );
    return toMailbox(row);
  }

  async patch(id: string, userId: string, patch: ExternalEmailAccountPatch): Promise<void> {
    await this.connections.update(owned(id, userId), toPatch(patch));
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.connections.delete(owned(id, userId));
  }

  async countActiveForUser(userId: string): Promise<number> {
    return this.connections.count({ purpose: PURPOSE, userId, status: "active", enabled: true });
  }
}
