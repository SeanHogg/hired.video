/**
 * Adapter registry — the single dispatch point. All service code calls
 * `getAdapter(env, platform)`; nothing else imports a concrete adapter
 * module directly.
 */

import { PAID_MEDIA_PLATFORMS, type PaidMediaPlatform } from "../../../db/schema/paidmedia.js";
import { PaidMediaAdapterError, type AdapterConfig, type PaidMediaAdapter } from "./adapter.js";
import { createMetaAdapter } from "../adapters/meta/index.js";
import { createGoogleAdsAdapter } from "../adapters/google/index.js";
import { createLinkedInAdapter } from "../adapters/linkedin/index.js";
import { createTikTokAdapter } from "../adapters/tiktok/index.js";
import { createBingAdapter } from "../adapters/bing/index.js";

/** Cloudflare Worker env shape consumed by adapters. The full Env type
 *  in worker.ts has many more fields; this is the interface-segregated
 *  subset. */
export interface PaidMediaEnv {
  // Meta (Facebook / Instagram)
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  // Google Ads (uses Google OAuth credentials)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  // LinkedIn
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  // TikTok For Business
  TIKTOK_APP_ID?: string;
  TIKTOK_APP_SECRET?: string;
  // Microsoft Advertising (Bing)
  MICROSOFT_ADS_CLIENT_ID?: string;
  MICROSOFT_ADS_CLIENT_SECRET?: string;
  MICROSOFT_ADS_DEVELOPER_TOKEN?: string;
  // Encryption for credential columns
  PAID_MEDIA_KMS_KEY?: string;
}

function configFor(env: PaidMediaEnv, platform: PaidMediaPlatform): AdapterConfig {
  switch (platform) {
    case "meta":
      return { clientId: env.META_APP_ID, clientSecret: env.META_APP_SECRET, appId: env.META_APP_ID };
    case "google":
      return {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN,
      };
    case "linkedin":
      return { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET };
    case "tiktok":
      return { clientId: env.TIKTOK_APP_ID, clientSecret: env.TIKTOK_APP_SECRET, appId: env.TIKTOK_APP_ID };
    case "bing":
      return {
        clientId: env.MICROSOFT_ADS_CLIENT_ID,
        clientSecret: env.MICROSOFT_ADS_CLIENT_SECRET,
        developerToken: env.MICROSOFT_ADS_DEVELOPER_TOKEN,
      };
  }
}

/** Build the adapter for a platform. Caches per-env to avoid recreating
 *  short-lived state, though Cloudflare Workers' execution model keeps
 *  each request isolated anyway. */
export function getAdapter(env: PaidMediaEnv, platform: PaidMediaPlatform): PaidMediaAdapter {
  const config = configFor(env, platform);
  switch (platform) {
    case "meta": return createMetaAdapter(config);
    case "google": return createGoogleAdsAdapter(config);
    case "linkedin": return createLinkedInAdapter(config);
    case "tiktok": return createTikTokAdapter(config);
    case "bing": return createBingAdapter(config);
  }
}

/** All adapters paired with their static metadata — for /api/paid-media/platforms. */
export function listAdapters(env: PaidMediaEnv): Array<{
  platform: PaidMediaPlatform;
  configured: boolean;
  capabilities: ReturnType<PaidMediaAdapter["capabilities"]>;
}> {
  return PAID_MEDIA_PLATFORMS.map((platform) => {
    const a = getAdapter(env, platform);
    return {
      platform,
      configured: a.isConfigured(),
      capabilities: a.capabilities(),
    };
  });
}

export function assertPlatform(platform: string): asserts platform is PaidMediaPlatform {
  if (!(PAID_MEDIA_PLATFORMS as readonly string[]).includes(platform)) {
    throw new PaidMediaAdapterError(
      "meta" as PaidMediaPlatform,
      "VALIDATION_ERROR",
      `Unknown platform: ${platform}`,
    );
  }
}
