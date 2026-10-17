/**
 * Off-platform reach ingestion (#2048): read the counts each network
 * reports for posts hired.video published there, and store today's snapshot
 * (external_post_metrics).
 *
 *   syncPublicationMetrics   the shared ingest step — groups posts by
 *                            (poster, network) so each group costs ONE token
 *                            lookup + ONE batched stats call (the adapters'
 *                            metrics readers, publishers/index.ts — never
 *                            one call per post), writes every snapshot in
 *                            one upsert, then bumps each touched project's
 *                            metrics cache version
 *   processExternalPostMetrics  the half-hourly cron step: a bounded batch of
 *                            published posts with no snapshot for today
 *
 * Webhooks (ingest-webhook.ts) call syncPublicationMetrics for the posts an
 * event names, so a network's push refreshes today's row early.
 *
 * Tokens: a post is read with the connection of the account that posted it
 * (`posterUserId` — the recorded poster, else the scheduled job's creator,
 * else the project owner), so a delegate's post of a company video is read
 * with the delegate's account. A poster with no usable connection is
 * skipped (its counts stay unknown), never an error.
 *
 * Budget: each group's read is costed (subrequest-budget.ts) before it
 * runs; a group that doesn't fit the run's budget is trimmed or left for
 * the next run (no snapshot today = still due).
 */
import { isVideoPublishPlatform, VIDEO_PUBLISH_PLATFORMS, type VideoPublishPlatform } from "../../../../../shared/social-platforms.js";
import type { PostMetricCounts } from "../../../../../shared/social-publish-jobs.js";
import { bumpCacheVersion } from "../../../utils/edge-cache.js";
import * as metricsRepo from "../../../repositories/externalPostMetricsRepository.js";
import { SOCIAL_METRICS_READERS, type SocialMetricsReader } from "../../social/publishers/index.js";
import { buildSocialPublisher, type SelfTokenSource, type SocialPublisherEnv } from "../../social/build-social-publisher.js";
import {
  METRICS_FIXED_COST,
  METRICS_SUBREQUEST_BUDGET,
  metricsGroupCost,
  metricsPostsThatFit,
} from "../subrequest-budget.js";
import { logger } from "../../../lib/logger.js";

/** Posts the cron considers per run; the subrequest budget decides how many it reads. */
export const METRICS_SYNC_BATCH = 20;

export const metricsVersionNamespace = (projectId: string) => `social-metrics:${projectId}`;

export interface MetricsSyncDeps {
  readers?: Record<VideoPublishPlatform, SocialMetricsReader>;
  selfAccessToken?: SelfTokenSource;
  upsert?: typeof metricsRepo.upsertSnapshots;
  bumpVersion?: (namespace: string) => void;
  now?: () => Date;
  /** Subrequests the reads may spend (default METRICS_SUBREQUEST_BUDGET). */
  budget?: number;
}

export interface MetricsSyncSummary {
  posts: number;
  stored: number;
  groupsFailed: number;
  /** Posts left for a later run because the budget ran out. */
  deferred: number;
}

export async function syncPublicationMetrics(
  publications: readonly metricsRepo.SyncablePublication[],
  env: SocialPublisherEnv | undefined,
  deps: MetricsSyncDeps = {},
): Promise<MetricsSyncSummary> {
  const readers = deps.readers ?? SOCIAL_METRICS_READERS;
  const tokenFor = deps.selfAccessToken ?? buildSocialPublisher(env).selfAccessToken;
  const now = (deps.now ?? (() => new Date()))();
  const summary: MetricsSyncSummary = { posts: publications.length, stored: 0, groupsFailed: 0, deferred: 0 };
  let remaining = (deps.budget ?? METRICS_SUBREQUEST_BUDGET) - METRICS_FIXED_COST;

  const groups = new Map<string, { owner: string; platform: VideoPublishPlatform; posts: metricsRepo.SyncablePublication[] }>();
  for (const p of publications) {
    if (!isVideoPublishPlatform(p.destination)) continue;
    const key = `${p.posterUserId}:${p.destination}`;
    const group = groups.get(key);
    if (group) group.posts.push(p);
    else groups.set(key, { owner: p.posterUserId, platform: p.destination, posts: [p] });
  }

  const rows: Array<{ publicationId: string; projectId: string; counts: PostMetricCounts }> = [];
  for (const { owner, platform, posts: all } of groups.values()) {
    const fit = metricsPostsThatFit(platform, all.length, remaining);
    summary.deferred += all.length - fit;
    if (fit === 0) continue;
    const posts = all.slice(0, fit);
    remaining -= metricsGroupCost(platform, fit);
    try {
      const token = await tokenFor(owner, platform);
      if (!token) continue;
      const read = await readers[platform](token, posts.map((p) => p.externalId));
      for (const p of posts) {
        const m = read.get(p.externalId);
        if (!m) continue;
        rows.push({ publicationId: p.id, projectId: p.projectId, counts: m });
      }
    } catch (err) {
      summary.groupsFailed++;
      logger.warn("[distribution] metrics read failed", { platform, error: err });
    }
  }
  if (rows.length === 0) return summary;

  await (deps.upsert ?? metricsRepo.upsertSnapshots)(rows, now);
  summary.stored = rows.length;
  const bump = deps.bumpVersion ?? bumpCacheVersion;
  for (const projectId of new Set(rows.map((r) => r.projectId))) bump(metricsVersionNamespace(projectId));
  return summary;
}

/** The cron step (half-hourly tick). */
export async function processExternalPostMetrics(env: SocialPublisherEnv | undefined): Promise<void> {
  const due = await metricsRepo.listDueForSync({
    destinations: VIDEO_PUBLISH_PLATFORMS,
    now: new Date(),
    limit: METRICS_SYNC_BATCH,
  });
  if (due.length === 0) return;
  const summary = await syncPublicationMetrics(due, env);
  logger.info("[scheduled] external post metrics", summary);
}
