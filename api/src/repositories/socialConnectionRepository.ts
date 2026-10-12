/**
 * SocialConnectionRepository — pure data access for the two social
 * connection tables (migration 0217):
 *   social_connections — Layer 3, end-user accounts (Lane B)
 *   managed_accounts   — Layer 2, hired.video brand accounts (Lane A)
 *
 * No business logic / caching / encryption — that lives in
 * services/social/social-connection-service.ts, which owns the cache,
 * token decryption, and lane-availability resolution.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import type {
  SocialConnectionRow,
  SocialConnectionInsert,
  ManagedAccountRow,
  ManagedAccountInsert,
} from "../db/schema/social.js";

const { socialConnections, managedAccounts } = schema;

export type DbLike = any;

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

export interface ISocialConnectionRepository {
  // Layer 3 — user connections
  listForOwner(userId: string, companyId: string | null): Promise<SocialConnectionRow[]>;
  findForOwner(userId: string, companyId: string | null, platform: string): Promise<SocialConnectionRow | null>;
  upsertConnection(input: UpsertSocialConnectionInput): Promise<SocialConnectionRow>;
  /** Persist refreshed tokens on an existing row. */
  updateTokens(id: string, patch: { accessTokenEnc: string; refreshTokenEnc: string | null; accessTokenExpiresAt: Date | null; status?: string }): Promise<void>;
  removeConnection(userId: string, companyId: string | null, platform: string): Promise<boolean>;

  // Layer 2 — managed brand accounts (platform-global)
  listManaged(): Promise<ManagedAccountRow[]>;
  findManaged(platform: string): Promise<ManagedAccountRow | null>;
  upsertManaged(input: UpsertManagedAccountInput): Promise<ManagedAccountRow>;
  updateManagedTokens(id: string, patch: { accessTokenEnc: string; refreshTokenEnc: string | null; accessTokenExpiresAt: Date | null; status?: string }): Promise<void>;
  removeManaged(platform: string): Promise<boolean>;
}

function ownerWhere(userId: string, companyId: string | null) {
  return and(
    eq(socialConnections.userId, userId),
    companyId == null ? isNull(socialConnections.companyId) : eq(socialConnections.companyId, companyId),
  );
}

export class SocialConnectionRepository implements ISocialConnectionRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ── Layer 3 ────────────────────────────────────────────────────────────
  async listForOwner(userId: string, companyId: string | null): Promise<SocialConnectionRow[]> {
    return this.db.select().from(socialConnections).where(ownerWhere(userId, companyId));
  }

  async findForOwner(userId: string, companyId: string | null, platform: string): Promise<SocialConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(socialConnections)
      .where(and(ownerWhere(userId, companyId), eq(socialConnections.platform, platform)))
      .limit(1);
    return row ?? null;
  }

  async upsertConnection(input: UpsertSocialConnectionInput): Promise<SocialConnectionRow> {
    const existing = await this.findForOwner(input.userId, input.companyId, input.platform);
    if (existing) {
      const [row] = await this.db
        .update(socialConnections)
        .set({
          externalAccountId: input.externalAccountId,
          handle: input.handle,
          avatarUrl: input.avatarUrl,
          accessTokenEnc: input.accessTokenEnc,
          refreshTokenEnc: input.refreshTokenEnc ?? existing.refreshTokenEnc,
          accessTokenExpiresAt: input.accessTokenExpiresAt,
          scopes: input.scopes,
          status: "active",
          lastError: null,
          updatedAt: this.now(),
        })
        .where(eq(socialConnections.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(socialConnections)
      .values({
        userId: input.userId,
        companyId: input.companyId,
        platform: input.platform,
        externalAccountId: input.externalAccountId,
        handle: input.handle,
        avatarUrl: input.avatarUrl,
        accessTokenEnc: input.accessTokenEnc,
        refreshTokenEnc: input.refreshTokenEnc,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        scopes: input.scopes,
      } as SocialConnectionInsert)
      .returning();
    return row;
  }

  async updateTokens(id: string, patch: { accessTokenEnc: string; refreshTokenEnc: string | null; accessTokenExpiresAt: Date | null; status?: string }): Promise<void> {
    await this.db
      .update(socialConnections)
      .set({
        accessTokenEnc: patch.accessTokenEnc,
        refreshTokenEnc: patch.refreshTokenEnc,
        accessTokenExpiresAt: patch.accessTokenExpiresAt,
        status: patch.status ?? "active",
        updatedAt: this.now(),
      })
      .where(eq(socialConnections.id, id));
  }

  async removeConnection(userId: string, companyId: string | null, platform: string): Promise<boolean> {
    const deleted = await this.db
      .delete(socialConnections)
      .where(and(ownerWhere(userId, companyId), eq(socialConnections.platform, platform)))
      .returning({ id: socialConnections.id });
    return deleted.length > 0;
  }

  // ── Layer 2 ────────────────────────────────────────────────────────────
  async listManaged(): Promise<ManagedAccountRow[]> {
    return this.db.select().from(managedAccounts);
  }

  async findManaged(platform: string): Promise<ManagedAccountRow | null> {
    const [row] = await this.db.select().from(managedAccounts).where(eq(managedAccounts.platform, platform)).limit(1);
    return row ?? null;
  }

  async upsertManaged(input: UpsertManagedAccountInput): Promise<ManagedAccountRow> {
    const existing = await this.findManaged(input.platform);
    if (existing) {
      const [row] = await this.db
        .update(managedAccounts)
        .set({
          externalAccountId: input.externalAccountId,
          handle: input.handle,
          avatarUrl: input.avatarUrl,
          accessTokenEnc: input.accessTokenEnc,
          refreshTokenEnc: input.refreshTokenEnc ?? existing.refreshTokenEnc,
          accessTokenExpiresAt: input.accessTokenExpiresAt,
          scopes: input.scopes,
          status: "active",
          lastError: null,
          connectedByUserId: input.connectedByUserId,
          updatedAt: this.now(),
        })
        .where(eq(managedAccounts.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(managedAccounts)
      .values({
        platform: input.platform,
        externalAccountId: input.externalAccountId,
        handle: input.handle,
        avatarUrl: input.avatarUrl,
        accessTokenEnc: input.accessTokenEnc,
        refreshTokenEnc: input.refreshTokenEnc,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        scopes: input.scopes,
        connectedByUserId: input.connectedByUserId,
      } as ManagedAccountInsert)
      .returning();
    return row;
  }

  async updateManagedTokens(id: string, patch: { accessTokenEnc: string; refreshTokenEnc: string | null; accessTokenExpiresAt: Date | null; status?: string }): Promise<void> {
    await this.db
      .update(managedAccounts)
      .set({
        accessTokenEnc: patch.accessTokenEnc,
        refreshTokenEnc: patch.refreshTokenEnc,
        accessTokenExpiresAt: patch.accessTokenExpiresAt,
        status: patch.status ?? "active",
        updatedAt: this.now(),
      })
      .where(eq(managedAccounts.id, id));
  }

  async removeManaged(platform: string): Promise<boolean> {
    const deleted = await this.db
      .delete(managedAccounts)
      .where(eq(managedAccounts.platform, platform))
      .returning({ id: managedAccounts.id });
    return deleted.length > 0;
  }
}
