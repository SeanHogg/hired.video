/**
 * Per-platform managed-account publishers for the promotion queue. Each
 * takes the brand account's fresh access token and the creator's compiled
 * video and returns where it landed. Every platform — YouTube included —
 * reuses the lane-agnostic Lane-B adapters (services/social/publishers)
 * with the managed token, so a new PROMOTION_PLATFORMS entry needs no code here.
 */
import { PROMOTION_PLATFORMS, type PromotionPlatform } from "../../../../shared/promotions.js";
import { cdnUrl } from "../../utils/cdn.js";
import { fetchCompiledVideoBytes } from "../studio/compiled-video.js";
import { SOCIAL_VIDEO_PUBLISHERS } from "../social/publishers/index.js";

type VideoRow = Parameters<typeof fetchCompiledVideoBytes>[0];

export interface PromotionPublishInput {
  accessToken: string;
  video: VideoRow;
  title: string;
  /** Final post text, attribution already included. */
  description: string;
}

export interface PromotionPublishResult {
  externalId: string;
  /** Null when the platform finishes asynchronously without a post link. */
  externalUrl: string | null;
}

type PromotionPublisher = (input: PromotionPublishInput) => Promise<PromotionPublishResult>;

function viaSocialAdapter(platform: PromotionPlatform): PromotionPublisher {
  return ({ accessToken, video, title, description }) =>
    SOCIAL_VIDEO_PUBLISHERS[platform].publish({
      accessToken,
      video: { url: cdnUrl(video.r2Key!), bytes: () => fetchCompiledVideoBytes(video) },
      caption: description,
      title,
      // Brand-channel promotions go out public (other adapters ignore this).
      youtube: { privacy: "public" },
    });
}

export const PROMOTION_PUBLISHERS = Object.fromEntries(
  PROMOTION_PLATFORMS.map((p) => [p, viaSocialAdapter(p)]),
) as Record<PromotionPlatform, PromotionPublisher>;
