/**
 * Feed trending read models — anonymous-visible (Public posts only,
 * community excluded), so both are served through the shared read-through
 * cache with a 300s TTL: ranking is slow-changing and per-reaction
 * invalidation would be far heavier than a 5-minute refresh window.
 */

import { getDb } from "../../db/index.js";
import { FEED_REACTIONS } from "../../../../shared/feed-reactions.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import {
  selectTrendingPosts,
  selectTrendingTags,
  type TrendingTagRow,
} from "../../repositories/feedPostsRepository.js";

/** Top hashtags by post frequency (last 30 days). */
export function getTrendingTags(limit: number): Promise<TrendingTagRow[]> {
  return getOrSetCached<TrendingTagRow[]>({
    key: `feed:v1:trending-tags:${limit}`,
    ttlSeconds: 300,
    loader: () => selectTrendingTags(getDb(), limit),
  });
}

/** Public posts ranked by recent engagement (weighted reactions + reposts +
 *  comments) over the last 21 days. */
export function getTrendingPosts(limit: number): Promise<Array<Record<string, unknown>>> {
  // Reaction weights live in the shared SSoT — build the CASE from there so
  // the ranking can't drift from the picker. Values are code constants
  // (no user input), so raw interpolation is safe.
  const reactionWeightCase = FEED_REACTIONS.map((r) => `WHEN '${r.type}' THEN ${r.weight}`).join(" ");

  return getOrSetCached<Array<Record<string, unknown>>>({
    key: `feed:trending-posts:${limit}`,
    ttlSeconds: 300,
    loader: async () => {
      const rows = await selectTrendingPosts(getDb(), limit, reactionWeightCase);
      // Keep only posts with any engagement — a brand-new feed shouldn't
      // surface a "Trending" box full of zero-engagement posts.
      return rows.filter((r) => Number(r.score) > 0);
    },
  });
}
