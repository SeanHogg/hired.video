/**
 * buildSocialPublisher(env) — the composition root of the social publish
 * seam: the adapter registry (one `SocialVideoPublisher` per network,
 * publishers/index.ts) plus the self-lane token source, bound to the
 * Worker's env. Every Lane-B post — YouTube, TikTok, Instagram, X, a
 * Facebook Page, LinkedIn — resolves its adapter and token here, so the use
 * case (publish-project-video.ts) never names a network or a token store.
 *
 * Token stores: every network lives in provider_connections, but YouTube
 * channels are their own purpose ("youtube", connected via /api/youtube with
 * the Google OAuth client) while every other network is purpose
 * "social_publish". The source hides that split: it answers a fresh access
 * token, or null when the user has no usable connection (missing, revoked,
 * refresh failed).
 */
import type { VideoPublishPlatform } from "../../../../shared/social-platforms.js";
import { getActiveAccount } from "../youtube/youtubeAccountRepository.js";
import { getFreshAccessToken, YouTubeAuthError, youtubeOAuthConfig } from "../youtube/youtubeOAuth.js";
import { socialConnectionServiceFor } from "./social-connection-factory.js";
import type { SocialEnv } from "./social-connection-service.js";
import { SOCIAL_VIDEO_PUBLISHERS, type SocialVideoPublisher } from "./publishers/index.js";

export type SocialPublisherEnv = SocialEnv & { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string };

/** A fresh self-lane access token for (user, platform), or null when not connected. */
export type SelfTokenSource = (userId: string, platform: VideoPublishPlatform) => Promise<string | null>;

export interface SocialPublisher {
  adapters: Record<VideoPublishPlatform, SocialVideoPublisher>;
  selfAccessToken: SelfTokenSource;
}

async function youtubeSelfAccessToken(env: SocialPublisherEnv | undefined, userId: string): Promise<string | null> {
  const account = await getActiveAccount(userId);
  if (!account) return null;
  try {
    return await getFreshAccessToken(youtubeOAuthConfig(env ?? {}), account);
  } catch (err) {
    // A revoked / unrefreshable channel is "connect again", not a crash.
    if (err instanceof YouTubeAuthError) return null;
    throw err;
  }
}

export function buildSocialPublisher(env: SocialPublisherEnv | undefined): SocialPublisher {
  return {
    adapters: SOCIAL_VIDEO_PUBLISHERS,
    selfAccessToken: (userId, platform) =>
      platform === "youtube"
        ? youtubeSelfAccessToken(env, userId)
        : socialConnectionServiceFor(env).getFreshSelfAccessToken(userId, null, platform),
  };
}
