/**
 * Public badge catalog (the /rewards showcase, `GET /api/points/badges`).
 *
 * The `badges` table is platform-seeded (migrations only — no runtime
 * writer in the API), so the projected catalog is cached through the
 * canonical edge cache for an hour. If a runtime badge writer is ever
 * added it MUST call `invalidatePublicBadgeCatalog()`.
 */

import type { IPointsRepository } from "../../repositories/pointsRepository.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";

const BADGE_CATALOG_KEY = "badges:v1:public";
const BADGE_CATALOG_TTL_SECONDS = 60 * 60;

export interface PublicBadge {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tier: string;
  iconKey: string | null;
  pointsReward: number;
  roles: string[];
  isRepeatable: boolean;
}

const TIER_WEIGHT: Record<string, number> = { bronze: 0, silver: 1, gold: 2 };

/** Every active badge ordered by tier then name. JSON-safe DTO. */
export function getPublicBadgeCatalog(repo: Pick<IPointsRepository, "listBadges">): Promise<PublicBadge[]> {
  return getOrSetCached({
    key: BADGE_CATALOG_KEY,
    ttlSeconds: BADGE_CATALOG_TTL_SECONDS,
    loader: async () => {
      const rows = await repo.listBadges();
      return rows
        .slice()
        .sort((a, b) => {
          const aw = TIER_WEIGHT[a.tier] ?? 99;
          const bw = TIER_WEIGHT[b.tier] ?? 99;
          if (aw !== bw) return aw - bw;
          return a.name.localeCompare(b.name);
        })
        .map((b) => ({
          id: b.id,
          slug: b.slug,
          name: b.name,
          description: b.description,
          tier: b.tier,
          iconKey: b.iconKey,
          pointsReward: b.pointsReward,
          roles: b.roles as string[],
          isRepeatable: b.isRepeatable,
        }));
    },
  });
}

export function invalidatePublicBadgeCatalog(): void {
  invalidateCachedKey(BADGE_CATALOG_KEY);
}
