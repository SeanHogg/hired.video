/**
 * Inbound social webhook use cases (#2048) behind
 * /api/social/webhooks/:platform:
 *
 *   checkDelivery     signature check with the network's scheme and secret
 *                     (refused when the secret isn't configured)
 *   ingestDelivery    after the route has acknowledged: re-key publications
 *                     whose async publish finished, then refresh today's
 *                     snapshot for the posts the event names (only posts
 *                     hired.video published — everything else is ignored)
 *   subscriptionReply the GET handshake each network runs when the
 *                     subscription is registered
 */
import type { VideoPublishPlatform } from "../../../../../shared/social-platforms.js";
import * as metricsRepo from "../../../repositories/externalPostMetricsRepository.js";
import { confirmPublishedPost } from "../../studio/publication-service.js";
import type { SocialPublisherEnv } from "../../social/build-social-publisher.js";
import { parseWebhookEvents } from "./webhook-events.js";
import { handshakeReply, verifyDelivery, type HandshakeReply, type SignedRequest } from "./webhook-signatures.js";
import { webhookSecretFor, webhookVerifyToken } from "./webhook-secrets.js";
import { syncPublicationMetrics, type MetricsSyncDeps } from "./sync-post-metrics.js";
import { WEBHOOK_METRICS_SUBREQUEST_BUDGET } from "../subrequest-budget.js";

export interface WebhookDeps {
  secretFor?: (platform: VideoPublishPlatform) => string;
  nowSec?: () => number;
}

export async function checkDelivery(
  platform: VideoPublishPlatform,
  req: SignedRequest,
  deps: WebhookDeps = {},
): Promise<boolean> {
  const secret = (deps.secretFor ?? webhookSecretFor)(platform);
  if (!secret) return false;
  return verifyDelivery(platform, req, secret, (deps.nowSec ?? (() => Math.floor(Date.now() / 1000)))());
}

export interface IngestDeps {
  confirm?: typeof confirmPublishedPost;
  findPublications?: typeof metricsRepo.findByExternalIds;
  sync?: typeof syncPublicationMetrics;
  syncDeps?: MetricsSyncDeps;
}

export async function ingestDelivery(
  platform: VideoPublishPlatform,
  body: string,
  env: SocialPublisherEnv | undefined,
  deps: IngestDeps = {},
): Promise<{ confirmed: number; refreshed: number }> {
  const events = parseWebhookEvents(platform, body);
  let confirmed = 0;
  for (const c of events.confirmations) {
    const projectId = await (deps.confirm ?? confirmPublishedPost)({
      destination: platform,
      pendingExternalId: c.pendingId,
      externalId: c.postId,
    });
    if (projectId) confirmed++;
  }
  if (events.postIds.length === 0) return { confirmed, refreshed: 0 };
  const publications = await (deps.findPublications ?? metricsRepo.findByExternalIds)({
    destination: platform,
    externalIds: events.postIds,
  });
  if (publications.length === 0) return { confirmed, refreshed: 0 };
  const summary = await (deps.sync ?? syncPublicationMetrics)(publications, env, {
    budget: WEBHOOK_METRICS_SUBREQUEST_BUDGET,
    ...deps.syncDeps,
  });
  return { confirmed, refreshed: summary.stored };
}

export function subscriptionReply(
  platform: VideoPublishPlatform,
  query: (name: string) => string | undefined,
): Promise<HandshakeReply> {
  return handshakeReply(platform, query, { secret: webhookSecretFor(platform), verifyToken: webhookVerifyToken() });
}
