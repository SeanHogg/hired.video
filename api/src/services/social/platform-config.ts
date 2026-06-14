/**
 * Backend-only OAuth config for the social connection layer — endpoints,
 * scopes (per lane), env-var key names, and identity parsing, keyed by the
 * shared `SocialPlatform` ids. Layer 1 of PRD §5.0: the developer-app
 * credentials live in Worker Secrets; this maps each platform id to which
 * secret keys to read and how to run its authorization-code flow.
 *
 * Adding a platform's connection = one entry here + the matching secrets in
 * wrangler.toml. The OAuth runner (social-oauth.ts) is config-driven off
 * this table — routes never name a platform's endpoints.
 *
 * NOTE: per-platform endpoints/scopes follow each provider's published
 * OAuth docs; exact scope strings + token-exchange quirks need verification
 * against live developer credentials (logged as a gap). The framework is
 * provider-agnostic; a wrong scope string is a one-line fix here.
 */

import type { SocialLane, SocialPlatform } from "../../../../shared/social-platforms.js";

function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

export interface SocialIdentity {
  /** Platform's stable account id. */
  externalId: string;
  /** Human handle/name shown in the UI. */
  handle: string;
  avatarUrl?: string;
}

export interface SocialOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Seconds until the access token expires, if the platform returns it. */
  expiresInSec?: number;
  scopes?: string;
}

export interface SocialPlatformConfig {
  platform: SocialPlatform;
  authUrl: string;
  tokenUrl: string;
  /** Param name the platform expects for the client id. Most use
   *  `client_id`; TikTok uses `client_key`. */
  clientIdParam: string;
  /** OAuth 2.0 PKCE required (X). When true the runner adds a code
   *  challenge on authorize and carries the verifier in signed state. */
  pkce: boolean;
  /** Reads the client id from Secrets (layer 1). Empty string ⇒ not configured. */
  clientId: () => string;
  clientSecret: () => string;
  /** Scopes requested for each lane. Lane A (managed/brand) and Lane B
   *  (self/member) can differ — notably LinkedIn (org vs member). */
  scopesByLane: Record<SocialLane, string[]>;
  /** Extra static params appended to the authorize URL. */
  extraAuthParams?: Record<string, string>;
  /** Fetch + parse the connected account's identity for display. */
  fetchIdentity: (accessToken: string) => Promise<SocialIdentity>;
}

const JSON_HEADERS = { Accept: "application/json", "User-Agent": "hired.video" };

async function getJson(url: string, accessToken: string): Promise<any> {
  const res = await fetch(url, {
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`identity fetch failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

export const SOCIAL_PLATFORM_CONFIG: Record<SocialPlatform, SocialPlatformConfig> = {
  // YouTube rides Google OAuth. Reuses the dedicated YOUTUBE_* app (already
  // in wrangler.toml) so publishing scopes stay separate from login.
  youtube: {
    platform: "youtube",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdParam: "client_id",
    pkce: false,
    clientId: () => getEnv("YOUTUBE_CLIENT_ID"),
    clientSecret: () => getEnv("YOUTUBE_CLIENT_SECRET"),
    scopesByLane: {
      managed: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
      self: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
    },
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    fetchIdentity: async (token) => {
      const d = await getJson(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        token,
      );
      const ch = d?.items?.[0];
      return {
        externalId: ch?.id ?? "unknown",
        handle: ch?.snippet?.title ?? "YouTube channel",
        avatarUrl: ch?.snippet?.thumbnails?.default?.url,
      };
    },
  },

  // TikTok Content Posting API (Login Kit). Note `client_key` param name and
  // the open.tiktokapis.com token host (NOT business-api, which is the ads
  // integration in paid-media/).
  tiktok: {
    platform: "tiktok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdParam: "client_key",
    pkce: false,
    clientId: () => getEnv("TIKTOK_CONTENT_CLIENT_KEY"),
    clientSecret: () => getEnv("TIKTOK_CONTENT_CLIENT_SECRET"),
    scopesByLane: {
      managed: ["user.info.basic", "video.publish", "video.upload"],
      self: ["user.info.basic", "video.publish", "video.upload"],
    },
    fetchIdentity: async (token) => {
      const d = await getJson(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        token,
      );
      const u = d?.data?.user;
      return {
        externalId: u?.open_id ?? "unknown",
        handle: u?.display_name ?? "TikTok account",
        avatarUrl: u?.avatar_url,
      };
    },
  },

  // Instagram + Facebook both ride the Meta app (META_APP_ID/SECRET, shared
  // with paid-media's Meta adapter). IG publishing needs a Business/Creator
  // account linked to a Page.
  instagram: {
    platform: "instagram",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientIdParam: "client_id",
    pkce: false,
    clientId: () => getEnv("META_APP_ID"),
    clientSecret: () => getEnv("META_APP_SECRET"),
    scopesByLane: {
      managed: ["instagram_basic", "instagram_content_publish", "pages_show_list", "business_management"],
      self: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    },
    fetchIdentity: async (token) => {
      const d = await getJson("https://graph.facebook.com/v21.0/me?fields=id,name", token);
      return { externalId: d?.id ?? "unknown", handle: d?.name ?? "Instagram account" };
    },
  },

  facebook: {
    platform: "facebook",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientIdParam: "client_id",
    pkce: false,
    clientId: () => getEnv("META_APP_ID"),
    clientSecret: () => getEnv("META_APP_SECRET"),
    scopesByLane: {
      managed: ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "business_management"],
      self: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    },
    fetchIdentity: async (token) => {
      const d = await getJson("https://graph.facebook.com/v21.0/me?fields=id,name", token);
      return { externalId: d?.id ?? "unknown", handle: d?.name ?? "Facebook account" };
    },
  },

  // LinkedIn — Lane A (Company Page) needs the Community Management API
  // (w_organization_social); Lane B (member feed) needs w_member_social.
  linkedin: {
    platform: "linkedin",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientIdParam: "client_id",
    pkce: false,
    clientId: () => getEnv("LINKEDIN_CLIENT_ID"),
    clientSecret: () => getEnv("LINKEDIN_CLIENT_SECRET"),
    scopesByLane: {
      managed: ["openid", "profile", "w_organization_social", "r_organization_social"],
      self: ["openid", "profile", "w_member_social"],
    },
    fetchIdentity: async (token) => {
      const d = await getJson("https://api.linkedin.com/v2/userinfo", token);
      return { externalId: d?.sub ?? "unknown", handle: d?.name ?? "LinkedIn account", avatarUrl: d?.picture };
    },
  },

  // X (Twitter) — OAuth 2.0 with PKCE; requires a paid API tier.
  x: {
    platform: "x",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    clientIdParam: "client_id",
    pkce: true,
    clientId: () => getEnv("X_CLIENT_ID"),
    clientSecret: () => getEnv("X_CLIENT_SECRET"),
    scopesByLane: {
      managed: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      self: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    },
    fetchIdentity: async (token) => {
      const d = await getJson("https://api.x.com/2/users/me", token);
      return { externalId: d?.data?.id ?? "unknown", handle: d?.data?.username ? `@${d.data.username}` : "X account" };
    },
  },
};

export function socialPlatformConfig(platform: SocialPlatform): SocialPlatformConfig {
  return SOCIAL_PLATFORM_CONFIG[platform];
}

/** Layer 1 check: is the platform's developer app configured (secret present)? */
export function isPlatformConfigured(platform: SocialPlatform): boolean {
  const cfg = SOCIAL_PLATFORM_CONFIG[platform];
  return Boolean(cfg.clientId() && cfg.clientSecret());
}
