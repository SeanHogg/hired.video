/**
 * FeedFeatureService — business logic for the SuperAdmin-curated dashboard
 * feed (feed_features, migration 0202).
 *
 * Read path (`getCardsForRole`) is the hot one: every dashboard load hits
 * it, the curated set changes rarely, and it's identical for everyone of a
 * given role. So it's served through the canonical read-through cache
 * (getOrSetCached — L1 isolate Map + L2 KV) keyed per role, and every write
 * invalidates the whole keyspace. The card is the stored embed_payload
 * snapshot, so no N+1 back to the source tables.
 */
import type {
  IFeedFeaturesRepository,
  FeedFeatureRow,
} from "../../repositories/feedFeaturesRepository.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import {
  FEED_FEATURE_ROLES,
  featureAppliesToRole,
  type FeedFeatureCard,
} from "../../../../shared/feed-features.js";

const CACHE_VERSION = "v1";
// 3600s: upsert/update/remove invalidate every role key — every write path invalidates explicitly; long TTL = few KV refills.
const CACHE_TTL_SECONDS = 3600;
const cacheKey = (role: string) => `feed:features:${CACHE_VERSION}:${role}`;

/** Admin-facing DTO — the full row plus nothing hidden (the embed_payload
 *  and roles are exactly what the curation UI edits). */
export interface FeedFeatureAdminDto {
  id: string;
  entityKind: string;
  entityId: string;
  roles: string[];
  title: string;
  embedPayload: Record<string, unknown>;
  rank: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class FeedFeatureService {
  constructor(private readonly repo: IFeedFeaturesRepository) {}

  /**
   * Render-ready cards for a viewer's role, ordered by curation rank. Each
   * card is the stored snapshot, stamped with its `featureId` + `rank` so
   * the frontend can de-dupe and the admin UI can round-trip. Cached.
   */
  async getCardsForRole(role: string): Promise<FeedFeatureCard[]> {
    return getOrSetCached<FeedFeatureCard[]>({
      key: cacheKey(role),
      ttlSeconds: CACHE_TTL_SECONDS,
      loader: async () => {
        const rows = await this.repo.listActive();
        return rows
          .filter((r) => featureAppliesToRole(r.roles, role))
          .map((r) => toCard(r));
      },
    });
  }

  /** Full list for the curation UI (active + inactive). Not cached — admin
   *  reads are low-volume and must reflect writes immediately. */
  async listForAdmin(): Promise<FeedFeatureAdminDto[]> {
    const rows = await this.repo.listAll();
    return rows.map(toAdminDto);
  }

  async create(input: {
    entityKind: string;
    entityId: string;
    roles: string[];
    title: string;
    embedPayload: Record<string, unknown>;
    rank?: number;
    isActive?: boolean;
    createdBy?: string | null;
  }): Promise<FeedFeatureAdminDto> {
    const row = await this.repo.upsert(input);
    this.invalidateAll();
    return toAdminDto(row);
  }

  async update(
    id: string,
    patch: {
      roles?: string[];
      title?: string;
      embedPayload?: Record<string, unknown>;
      rank?: number;
      isActive?: boolean;
    },
  ): Promise<FeedFeatureAdminDto | null> {
    const row = await this.repo.update(id, patch);
    this.invalidateAll();
    return row ? toAdminDto(row) : null;
  }

  async remove(id: string): Promise<boolean> {
    const ok = await this.repo.remove(id);
    if (ok) this.invalidateAll();
    return ok;
  }

  /** Drop every per-role cache key. The keyspace is the bounded role list,
   *  so a full sweep is cheap and avoids stale curated feeds. */
  private invalidateAll(): void {
    for (const role of FEED_FEATURE_ROLES) {
      invalidateCachedKey(cacheKey(role));
    }
  }
}

function toCard(r: FeedFeatureRow): FeedFeatureCard {
  const payload = (r.embedPayload ?? {}) as Record<string, unknown>;
  return {
    ...payload,
    featureId: r.id,
    // Fall back to the row's discriminator/id if the snapshot omitted them
    // so the renderer always has a `type` + `id` to dispatch on.
    type: (payload.type as string) ?? r.entityKind,
    id: (payload.id as string) ?? r.entityId,
    title: (payload.title as string) ?? (payload.name as string) ?? r.title,
    rank: r.rank,
  };
}

function toAdminDto(r: FeedFeatureRow): FeedFeatureAdminDto {
  return {
    id: r.id,
    entityKind: r.entityKind,
    entityId: r.entityId,
    roles: r.roles ?? [],
    title: r.title,
    embedPayload: (r.embedPayload ?? {}) as Record<string, unknown>,
    rank: r.rank,
    isActive: r.isActive,
    createdAt: (r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)),
    updatedAt: (r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt)),
  };
}
