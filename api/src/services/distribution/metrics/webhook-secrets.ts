/**
 * Which secret signs each network's webhooks (#2048). Meta, TikTok and
 * LinkedIn sign with the developer app's client secret (the same Worker
 * Secret OAuth uses, platform-config.ts); X's Account Activity API signs
 * with the app's consumer secret; YouTube (WebSub) with the `hub.secret` we
 * chose when subscribing. Empty string = not configured → every delivery
 * is refused.
 */
import type { VideoPublishPlatform } from "../../../../../shared/social-platforms.js";
import { getEnv } from "../../../utils/env.js";
import { socialPlatformConfig } from "../../social/platform-config.js";

export function webhookSecretFor(platform: VideoPublishPlatform): string {
  switch (platform) {
    case "facebook":
    case "instagram":
    case "tiktok":
    case "linkedin":
      return socialPlatformConfig(platform).clientSecret();
    case "x":
      return getEnv("X_CONSUMER_SECRET");
    case "youtube":
      return getEnv("YOUTUBE_WEBSUB_SECRET");
  }
}

/** The token registered with Meta / WebSub for the subscription check. */
export function webhookVerifyToken(): string {
  return getEnv("SOCIAL_WEBHOOK_VERIFY_TOKEN");
}
