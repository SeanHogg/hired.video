/**
 * SocialConnectionRepository — the social-publishing adapter over
 * provider_connections (W3-C, migration 0600; was social_connections +
 * managed_accounts, mig 0217):
 *   purpose "social_publish" — Layer 3, end-user accounts (Lane B), owned by
 *                              the user (owner user) or a member inside a
 *                              company workspace (owner workspace)
 *   purpose "managed_social" — Layer 2, hired.video brand accounts (Lane A),
 *                              owner platform, one per network
 *
 * Maps rows to the shape the social service always used. No business logic /
 * caching / encryption — that lives in services/social/social-connection-
 * service.ts, which owns the cache, token decryption (connection-secrets.ts)
 * and lane-availability resolution.
 */
import type { ProviderConnectionStatus } from "../../../shared/provider-connections.js";
import {
  ProviderConnectionsRepository,
  type ProviderConnectionFilter,
  type ProviderConnectionRow,
} from "./providerConnectionsRepository.js";
import type { ConnectionSecretColumn } from "../services/provider-connections/connection-secrets.js";

export type DbLike = any;

interface SocialAccountFields {
  id: string;
  platform: string;
  externalAccountId: string | null;
  handle: string | null;
  avatarUrl: string | null;
  /** Stored secret (canonical or legacy) — open with connection-secrets.ts. */
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string;
  status: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialConnectionRow extends SocialAccountFields {
  userId: string;
  companyId: string | null;
}

export interface ManagedAccountRow extends SocialAccountFields {
  connectedByUserId: string | null;
}

export interface UpsertSocialConnectionInput {
  userId: string;
  companyId: string | null;
  platform: string;
  externalAccountId: string | null;
  handle: string | null;
  avatarUrl: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string;
}

export interface UpsertManagedAccountInput {
  platform: string;
  externalAccountId: string | null;
  handle: string | null;
  avatarUrl: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string;
  connectedByUserId: string | null;
}

export type SocialTokenPatch = {
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  status?: ProviderConnectionStatus;
};

export interface ISocialConnectionRepository {
  // Layer 3 — user connections
  listForOwner(userId: string, companyId: string | null): Promise<SocialConnectionRow[]>;
  findForOwner(userId: string, companyId: string | null, platform: string): Promise<SocialConnectionRow | null>;
  upsertConnection(input: UpsertSocialConnectionInput): Promise<SocialConnectionRow>;
  /** Persist refreshed tokens on an existing row. */
  updateTokens(id: string, patch: SocialTokenPatch): Promise<void>;
  removeConnection(userId: string, companyId: string | null, platform: string): Promise<boolean>;

  // Layer 2 — managed brand accounts (platform-global)
  listManaged(): Promise<ManagedAccountRow[]>;
  findManaged(platform: string): Promise<ManagedAccountRow | null>;
  upsertManaged(input: UpsertManagedAccountInput): Promise<ManagedAccountRow>;
  updateManagedTokens(id: string, patch: SocialTokenPatch): Promise<void>;
  removeManaged(platform: string): Promise<boolean>;

  /** Lazy re-seal of a legacy-encrypted token (either layer). */
  resealSecret(id: string, column: ConnectionSecretColumn, expected: string, next: string): Promise<void>;
}

const SELF = "social_publish" as const;
const MANAGED = "managed_social" as const;

function selfOwner(userId: string, companyId: string | null): ProviderConnectionFilter {
  return companyId == null
    ? { purpose: SELF, ownerKind: "user", ownerId: userId, userId, companyId: null }
    : { purpose: SELF, ownerKind: "workspace", ownerId: companyId, userId, companyId };
}

function accountFields(row: ProviderConnectionRow): SocialAccountFields {
  return {
    id: row.id,
    platform: row.provider,
    externalAccountId: row.externalAccountId,
    handle: row.handle,
    avatarUrl: row.avatarUrl,
    accessTokenEnc: row.accessTokenEnc ?? "",
    refreshTokenEnc: row.refreshTokenEnc,
    accessTokenExpiresAt: row.expiresAt,
    scopes: row.scopes ?? "",
    status: row.status,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSelf(row: ProviderConnectionRow): SocialConnectionRow {
  return { ...accountFields(row), userId: row.userId ?? "", companyId: row.companyId };
}

function toManaged(row: ProviderConnectionRow): ManagedAccountRow {
  return { ...accountFields(row), connectedByUserId: row.connectedByUserId };
}

function tokenPatch(patch: SocialTokenPatch) {
  return {
    accessTokenEnc: patch.accessTokenEnc,
    refreshTokenEnc: patch.refreshTokenEnc,
    expiresAt: patch.accessTokenExpiresAt,
    status: patch.status ?? "active",
  };
}

export class SocialConnectionRepository implements ISocialConnectionRepository {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db: DbLike, now: () => Date = () => new Date()) {
    this.connections = new ProviderConnectionsRepository(db, now);
  }

  // ── Layer 3 ────────────────────────────────────────────────────────────
  async listForOwner(userId: string, companyId: string | null): Promise<SocialConnectionRow[]> {
    return (await this.connections.list(selfOwner(userId, companyId))).map(toSelf);
  }

  async findForOwner(userId: string, companyId: string | null, platform: string): Promise<SocialConnectionRow | null> {
    const row = await this.connections.findOne({ ...selfOwner(userId, companyId), provider: platform });
    return row ? toSelf(row) : null;
  }

  async upsertConnection(input: UpsertSocialConnectionInput): Promise<SocialConnectionRow> {
    const owner = selfOwner(input.userId, input.companyId);
    const existing = await this.connections.findOne({ ...owner, provider: input.platform });
    const fields = {
      externalAccountId: input.externalAccountId,
      handle: input.handle,
      avatarUrl: input.avatarUrl,
      accessTokenEnc: input.accessTokenEnc,
      expiresAt: input.accessTokenExpiresAt,
      scopes: input.scopes,
    };
    if (existing) {
      const row = await this.connections.updateById(existing.id, {
        ...fields,
        refreshTokenEnc: input.refreshTokenEnc ?? existing.refreshTokenEnc,
        status: "active",
        lastError: null,
      });
      return toSelf(row ?? existing);
    }
    const row = await this.connections.insert({
      ownerKind: owner.ownerKind!,
      ownerId: owner.ownerId as string,
      userId: input.userId,
      companyId: input.companyId,
      provider: input.platform,
      purpose: SELF,
      ...fields,
      refreshTokenEnc: input.refreshTokenEnc,
    });
    return toSelf(row);
  }

  async updateTokens(id: string, patch: SocialTokenPatch): Promise<void> {
    await this.connections.update({ id, purpose: SELF }, tokenPatch(patch));
  }

  async removeConnection(userId: string, companyId: string | null, platform: string): Promise<boolean> {
    const deleted = await this.connections.delete({ ...selfOwner(userId, companyId), provider: platform });
    return deleted.length > 0;
  }

  // ── Layer 2 ────────────────────────────────────────────────────────────
  async listManaged(): Promise<ManagedAccountRow[]> {
    return (await this.connections.list({ purpose: MANAGED })).map(toManaged);
  }

  async findManaged(platform: string): Promise<ManagedAccountRow | null> {
    const row = await this.connections.findOne({ purpose: MANAGED, provider: platform });
    return row ? toManaged(row) : null;
  }

  async upsertManaged(input: UpsertManagedAccountInput): Promise<ManagedAccountRow> {
    const existing = await this.connections.findOne({ purpose: MANAGED, provider: input.platform });
    const fields = {
      externalAccountId: input.externalAccountId,
      handle: input.handle,
      avatarUrl: input.avatarUrl,
      accessTokenEnc: input.accessTokenEnc,
      expiresAt: input.accessTokenExpiresAt,
      scopes: input.scopes,
      connectedByUserId: input.connectedByUserId,
    };
    if (existing) {
      const row = await this.connections.updateById(existing.id, {
        ...fields,
        refreshTokenEnc: input.refreshTokenEnc ?? existing.refreshTokenEnc,
        status: "active",
        lastError: null,
      });
      return toManaged(row ?? existing);
    }
    const row = await this.connections.insert({
      ownerKind: "platform",
      ownerId: null,
      provider: input.platform,
      purpose: MANAGED,
      ...fields,
      refreshTokenEnc: input.refreshTokenEnc,
    });
    return toManaged(row);
  }

  async updateManagedTokens(id: string, patch: SocialTokenPatch): Promise<void> {
    await this.connections.update({ id, purpose: MANAGED }, tokenPatch(patch));
  }

  async removeManaged(platform: string): Promise<boolean> {
    const deleted = await this.connections.delete({ purpose: MANAGED, provider: platform });
    return deleted.length > 0;
  }

  async resealSecret(id: string, column: ConnectionSecretColumn, expected: string, next: string): Promise<void> {
    await this.connections.resealSecret(id, column, expected, next);
  }
}
