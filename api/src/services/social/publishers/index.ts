/**
 * Registry: one publisher adapter per VideoPublishPlatform. The Record type
 * makes adding a platform to VIDEO_PUBLISH_PLATFORMS a compile error until
 * its adapter is registered here.
 */
import type { VideoPublishPlatform } from "../../../../../shared/social-platforms.js";
import { createFacebookPublisher, createFacebookViewReader } from "./facebook.js";
import { createInstagramPublisher, createInstagramViewReader } from "./instagram.js";
import { createLinkedInPublisher, createLinkedInViewReader } from "./linkedin.js";
import { createTikTokMetricsReader, createTikTokPublisher } from "./tiktok.js";
import { createXMetricsReader, createXPublisher } from "./x.js";
import { createYouTubeMetricsReader, createYouTubePublisher } from "./youtube.js";
import {
  viewsOf,
  viewsOnlyMetrics,
  type SocialMetricsReader,
  type SocialVideoPublisher,
  type SocialViewReader,
} from "./types.js";

export const SOCIAL_VIDEO_PUBLISHERS: Record<VideoPublishPlatform, SocialVideoPublisher> = {
  youtube: createYouTubePublisher(),
  tiktok: createTikTokPublisher(),
  instagram: createInstagramPublisher(),
  x: createXPublisher(),
  facebook: createFacebookPublisher(),
  linkedin: createLinkedInPublisher(),
};

/** One metrics reader per adapter (#2048): views always, plus the
 *  engagement counts where the same stats call carries them (YouTube,
 *  TikTok, X); Meta insights and LinkedIn analytics report views only. */
export const SOCIAL_METRICS_READERS: Record<VideoPublishPlatform, SocialMetricsReader> = {
  youtube: createYouTubeMetricsReader(),
  tiktok: createTikTokMetricsReader(),
  instagram: viewsOnlyMetrics(createInstagramViewReader()),
  x: createXMetricsReader(),
  facebook: viewsOnlyMetrics(createFacebookViewReader()),
  linkedin: viewsOnlyMetrics(createLinkedInViewReader()),
};

/** One view reader per adapter: the views of the SAME stats call, so Lane A
 *  reach and the off-platform metrics share one reader per network. Same
 *  compile-time completeness as above. */
export const SOCIAL_VIEW_READERS: Record<VideoPublishPlatform, SocialViewReader> = {
  youtube: viewsOf(SOCIAL_METRICS_READERS.youtube),
  tiktok: viewsOf(SOCIAL_METRICS_READERS.tiktok),
  instagram: createInstagramViewReader(),
  x: viewsOf(SOCIAL_METRICS_READERS.x),
  facebook: createFacebookViewReader(),
  linkedin: createLinkedInViewReader(),
};

export {
  SocialPublishError,
  type PostMetrics,
  type SocialMetricsReader,
  type SocialPublishErrorKind,
  type SocialVideoPublisher,
  type SocialViewReader,
  type YouTubePostSettings,
} from "./types.js";
