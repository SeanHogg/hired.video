/**
 * FeedFeaturesRepository — pure data access for feed_features (migration
 * 0202), the SuperAdmin-curated dashboard feed.
 *
 * No business logic / caching — that lives in
 * services/feed/FeedFeatureService.ts, which owns the per-role read-through
 * cache and the cache invalidation on every write.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { feedFeatures } = schema;

export type DbLike = any;

export type FeedFeatureRow = typeof feedFeatures.$inferSelect;
export type FeedFeatureInsert = typeof feedFeatures.$inferInsert;

export interface UpsertFeedFeatureInput {
  entityKind: string;
  entityId: string;
  roles: string[];
  title: string;
  embedPayload: Record<string, unknown>;
  rank?: number;
  isActive?: boolean;
  createdBy?: string | null;
}

export interface PatchFeedFeatureInput {
  roles?: string[];
  title?: string;
  embedPayload?: Record<string, unknown>;
  rank?: number;
  isActive?: boolean;
}

export interface IFeedFeaturesRepository {
  /** Active rows only, ordered by rank then recency — the dashboard read. */
  listActive(): Promise<FeedFeatureRow[]>;
  /** Every row (active + inactive), ordered for the admin list. */
  listAll(): Promise<FeedFeatureRow[]>;
  findById(id: string): Promise<FeedFeatureRow | null>;
  /** Insert, or update in place when (entity_kind, entity_id) already
   *  exists — the unique index makes an entity pinnable at most once. */
  upsert(input: UpsertFeedFeatureInput): Promise<FeedFeatureRow>;
  update(id: string, patch: PatchFeedFeatureInput): Promise<FeedFeatureRow | null>;
  remove(id: string): Promise<boolean>;
}

export class FeedFeaturesRepository implements IFeedFeaturesRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listActive(): Promise<FeedFeatureRow[]> {
    return this.db
      .select()
      .from(feedFeatures)
      .where(eq(feedFeatures.isActive, true))
      .orderBy(asc(feedFeatures.rank), asc(feedFeatures.createdAt));
  }

  async listAll(): Promise<FeedFeatureRow[]> {
    return this.db
      .select()
      .from(feedFeatures)
      .orderBy(asc(feedFeatures.rank), asc(feedFeatures.createdAt));
  }

  async findById(id: string): Promise<FeedFeatureRow | null> {
    const [row] = await this.db
      .select()
      .from(feedFeatures)
      .where(eq(feedFeatures.id, id))
      .limit(1);
    return row ?? null;
  }

  async upsert(input: UpsertFeedFeatureInput): Promise<FeedFeatureRow> {
    const now = this.now();
    const [row] = await this.db
      .insert(feedFeatures)
      .values({
        entityKind: input.entityKind,
        entityId: input.entityId,
        roles: input.roles,
        title: input.title,
        embedPayload: input.embedPayload,
        rank: input.rank ?? 0,
        isActive: input.isActive ?? true,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      } as FeedFeatureInsert)
      .onConflictDoUpdate({
        target: [feedFeatures.entityKind, feedFeatures.entityId],
        set: {
          roles: input.roles,
          title: input.title,
          embedPayload: input.embedPayload,
          rank: input.rank ?? 0,
          isActive: input.isActive ?? true,
          updatedAt: now,
        },
      })
      .returning();
    return row;
  }

  async update(id: string, patch: PatchFeedFeatureInput): Promise<FeedFeatureRow | null> {
    const set: Record<string, unknown> = { updatedAt: this.now() };
    if (patch.roles !== undefined) set.roles = patch.roles;
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.embedPayload !== undefined) set.embedPayload = patch.embedPayload;
    if (patch.rank !== undefined) set.rank = patch.rank;
    if (patch.isActive !== undefined) set.isActive = patch.isActive;

    const [row] = await this.db
      .update(feedFeatures)
      .set(set as any)
      .where(eq(feedFeatures.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(feedFeatures)
      .where(eq(feedFeatures.id, id))
      .returning({ id: feedFeatures.id });
    return rows.length > 0;
  }
}
