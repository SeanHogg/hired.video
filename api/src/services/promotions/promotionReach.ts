/**
 * Reach of promoted posts on hired.video's brand accounts (#2046): views per
 * published submission, read from each platform's stats API with the managed
 * token. A post the platform doesn't answer for (deleted, still processing,
 * token missing the stats scope) reports null rather than a made-up number.
 *
 * Platform stats move slowly and the APIs are quota-metered, so every read
 * goes through the shared read-through cache (1h), and a new publish drops
 * the summary key.
 */
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import type { PromotionPlatform } from "../../../../shared/promotions.js";
import { PROMOTION_PLATFORMS } from "../../../../shared/promotions.js";
import { SOCIAL_VIEW_READERS, type SocialViewReader } from "../social/publishers/index.js";
import { socialConnectionServiceFor } from "../social/social-connection-factory.js";
import type { SocialEnv } from "../social/social-connection-service.js";
import * as repo from "./promotionRepository.js";
import { logger } from "../../lib/logger.js";

const TTL_SECONDS = 60 * 60;
const SUMMARY_KEY = "promo:reach:summary";
const projectKey = (projectId: string) => `promo:reach:project:${projectId}`;

/** Every promotion platform's reader — a new platform without one is a compile error. */
const VIEW_READERS: Record<PromotionPlatform, SocialViewReader> = SOCIAL_VIEW_READERS;

/** Views keyed by submission id (null = the platform didn't report it or the read failed). */
async function readViews(rows: repo.PromotionSubmission[], env: SocialEnv | undefined): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  const social = socialConnectionServiceFor(env);
  const byPlatform = new Map<PromotionPlatform, repo.PromotionSubmission[]>();
  for (const row of rows) {
    out[row.id] = null;
    if (row.status !== "published" || !row.externalId) continue;
    const p = row.platform as PromotionPlatform;
    byPlatform.set(p, [...(byPlatform.get(p) ?? []), row]);
  }
  await Promise.all(
    [...byPlatform].map(async ([platform, published]) => {
      const reader = VIEW_READERS[platform];
      try {
        const token = await social.getFreshManagedAccessToken(platform);
        if (!token) return;
        const views = await reader(token, published.map((r) => r.externalId!));
        for (const r of published) out[r.id] = views.get(r.externalId!) ?? null;
      } catch (err) {
        logger.warn("[promotions] reach read failed", { platform, error: err });
      }
    }),
  );
  return out;
}

/** Per-submission views for one project's promotions (creator view). */
export function projectReach(
  projectId: string,
  rows: repo.PromotionSubmission[],
  env: SocialEnv | undefined,
): Promise<Record<string, number | null>> {
  if (!rows.some((r) => r.status === "published")) return Promise.resolve({});
  // Per-project → isolate-only (unbounded keys; no KV write per fill).
  return getOrSetIsolateCached({ key: projectKey(projectId), ttlSeconds: TTL_SECONDS, loader: () => readViews(rows, env) });
}

export interface ReachSummary {
  platforms: Array<{ platform: PromotionPlatform; posts: number; views: number | null }>;
}

/** Brand-channel reach across every published promotion (SuperAdmin view). */
export function reachSummary(env: SocialEnv | undefined): Promise<ReachSummary> {
  return getOrSetCached({
    key: SUMMARY_KEY,
    ttlSeconds: TTL_SECONDS,
    loader: async () => {
      const published = await repo.listRecentPublished();
      const views = await readViews(published, env);
      return {
        platforms: PROMOTION_PLATFORMS.map((platform) => {
          const rows = published.filter((r) => r.platform === platform);
          const known = rows.map((r) => views[r.id]).filter((v): v is number => v != null);
          return { platform, posts: rows.length, views: known.length ? known.reduce((a, b) => a + b, 0) : null };
        }),
      };
    },
  });
}

/** Drop cached reach after a new publish so it shows up on the next read. */
export function invalidateReach(projectId: string): void {
  invalidateCachedKey(SUMMARY_KEY);
  invalidateIsolateKey(projectKey(projectId));
}
