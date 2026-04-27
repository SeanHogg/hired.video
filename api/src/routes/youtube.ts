// YouTube Pro publish flow — thin route layer for #202.
//
// All business logic lives in `services/youtube/`. This file only:
//   1. Validates request bodies / URL params with Zod.
//   2. Delegates to the application services / use cases.
//   3. Maps domain errors → HTTP status codes via the canonical
//      `success` / `error` envelope from `types/index.ts`.

import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { error, success } from "../types/index.js";
import { requirePremium } from "../middleware/auth-gates.js";
import {
  accountToDto,
  deactivateAllForUser,
  getActiveAccount,
  upsertAccount,
} from "../services/youtube/youtubeAccountRepository.js";
import {
  buildAuthUrl,
  exchangeAuthCode,
  expiresInToDate,
  fetchPrimaryChannel,
  fetchUserInfo,
  YouTubeAuthError,
  youtubeOAuthConfig,
} from "../services/youtube/youtubeOAuth.js";
import {
  publishVideoToYouTube,
  PublishVideoError,
  type PublishVideoErrorKind,
} from "../services/youtube/publishVideoUseCase.js";

export const youtubeRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const CallbackSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url().optional(),
});

const PublishSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(5000).default(""),
  privacy: z.enum(["public", "private", "unlisted"]).default("unlisted"),
  tags: z.array(z.string().max(30)).max(15).optional(),
});

function defaultRedirectUri(env: Env): string {
  return `${env.FRONTEND_URL ?? ""}/studio/youtube/callback`;
}

/** Map a `PublishVideoError.kind` to its HTTP status + envelope code. */
const PUBLISH_ERROR_HTTP: Record<PublishVideoErrorKind, { status: 400 | 401 | 404 | 409 | 502; code: string }> = {
  VIDEO_NOT_FOUND:       { status: 404, code: "NOT_FOUND" },
  VIDEO_NOT_READY:       { status: 409, code: "VIDEO_NOT_READY" },
  ACCOUNT_NOT_CONNECTED: { status: 409, code: "NOT_CONNECTED" },
  AUTH_FAILED:           { status: 401, code: "YOUTUBE_AUTH" },
  MEDIA_FETCH_FAILED:    { status: 502, code: "MEDIA_FETCH_FAILED" },
  UPLOAD_FAILED:         { status: 502, code: "YOUTUBE_UPLOAD_FAILED" },
};

// ─── GET /api/youtube/account ───────────────────────────────────────────────
youtubeRoutes.get("/account", async (c) => {
  const account = await getActiveAccount(c.var.user.sub);
  return c.json(success(account ? accountToDto(account) : null));
});

// ─── GET /api/youtube/auth-url ──────────────────────────────────────────────
youtubeRoutes.get("/auth-url", (c) => {
  if (!c.env.YOUTUBE_CLIENT_ID) {
    return c.json(error("CONFIGURATION_ERROR", "YouTube integration is not configured"), 503);
  }
  return c.json(success({ authUrl: buildAuthUrl(youtubeOAuthConfig(c.env), defaultRedirectUri(c.env)) }));
});

// ─── POST /api/youtube/callback ─────────────────────────────────────────────
youtubeRoutes.post("/callback", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Missing OAuth callback code"), 400);

  const redirectUri = parsed.data.redirectUri ?? defaultRedirectUri(c.env);

  let tokens;
  try {
    tokens = await exchangeAuthCode(youtubeOAuthConfig(c.env), parsed.data.code, redirectUri);
  } catch (err) {
    if (err instanceof YouTubeAuthError && err.reason === "YOUTUBE_NOT_CONFIGURED") {
      return c.json(error("YOUTUBE_UNAVAILABLE", "YouTube integration not configured"), 503);
    }
    return c.json(error("OAUTH_EXCHANGE_FAILED", err instanceof Error ? err.message : "Code exchange failed"), 400);
  }

  const [userInfo, channel] = await Promise.all([
    fetchUserInfo(tokens.access_token),
    fetchPrimaryChannel(tokens.access_token),
  ]);

  const saved = await upsertAccount({
    userId:         user.sub,
    googleId:       userInfo.sub ?? `user_${user.sub.slice(0, 8)}`,
    accessToken:    tokens.access_token,
    refreshToken:   tokens.refresh_token ?? null,
    tokenExpiresAt: expiresInToDate(tokens.expires_in),
    scopes:         tokens.scope,
    channelId:      channel?.id ?? null,
    channelTitle:   channel?.title ?? null,
    displayName:    userInfo.name ?? null,
    email:          userInfo.email ?? null,
  });

  return c.json(success(accountToDto(saved)));
});

// ─── POST /api/youtube/disconnect ───────────────────────────────────────────
youtubeRoutes.post("/disconnect", async (c) => {
  await deactivateAllForUser(c.var.user.sub);
  return c.json(success(undefined));
});

// ─── POST /api/youtube/publish/:videoId ─────────────────────────────────────
youtubeRoutes.post("/publish/:videoId", requirePremium("YouTube Publishing"), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid publish metadata", parsed.error.flatten()), 400);
  }

  try {
    const result = await publishVideoToYouTube({
      userId:      c.var.user.sub,
      videoId:     c.req.param("videoId"),
      meta:        parsed.data,
      oauthConfig: youtubeOAuthConfig(c.env),
    });
    return c.json(success(result));
  } catch (err) {
    if (err instanceof PublishVideoError) {
      const { status, code } = PUBLISH_ERROR_HTTP[err.kind];
      return c.json(error(code, err.message), status);
    }
    throw err;
  }
});

// ─── Company-channel admin (SuperAdmin) endpoints ──────────────────────────
youtubeRoutes.get("/company/status", (c) => {
  const configured = Boolean(c.env.YOUTUBE_CLIENT_ID && c.env.YOUTUBE_REFRESH_TOKEN);
  return c.json(success(configured));
});

youtubeRoutes.get("/company/auth-url", (c) => {
  if (!c.env.YOUTUBE_CLIENT_ID) {
    return c.json(error("CONFIGURATION_ERROR", "YOUTUBE_CLIENT_ID is not configured"), 500);
  }
  return c.json(success({ authUrl: buildAuthUrl(youtubeOAuthConfig(c.env), defaultRedirectUri(c.env)) }));
});
