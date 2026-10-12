// YouTube channel connection — thin route layer for #202.
//
// Connect / status / disconnect for the user's YouTube channel. Posting a
// video goes through the ONE social publish route
// (POST /api/studio/projects/:id/publish/social/youtube → services/social),
// gated by runSelfPublishGate like every other network.
//
// All business logic lives in `services/youtube/`. This file only:
//   1. Validates request bodies / URL params with Zod.
//   2. Delegates to the application services / use cases.
//   3. Maps domain errors → HTTP status codes via the canonical
//      `success` / `error` envelope from `types/index.ts`.

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { integrationRedirectUri } from "../utils/public-urls.js";
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
  hasRequiredYouTubeScopes,
  YouTubeAuthError,
  youtubeOAuthConfig,
} from "../services/youtube/youtubeOAuth.js";

export const youtubeRoutes = new Hono<AppEnv>();

const CallbackSchema = z.object({
  code: z.string().min(1),
});

// ─── GET /api/youtube/account ───────────────────────────────────────────────
youtubeRoutes.get("/account", async (c) => {
  const account = await getActiveAccount(c.var.user.sub);
  return c.json(success(account ? accountToDto(account) : null));
});

// ─── GET /api/youtube/auth-url ──────────────────────────────────────────────
youtubeRoutes.get("/auth-url", (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json(error("CONFIGURATION_ERROR", "YouTube integration is not configured"), 503);
  }
  return c.json(success({ authUrl: buildAuthUrl(youtubeOAuthConfig(c.env), integrationRedirectUri("youtube")) }));
});

// ─── POST /api/youtube/callback ─────────────────────────────────────────────
youtubeRoutes.post("/callback", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Missing OAuth callback code"), 400);

  const redirectUri = integrationRedirectUri("youtube");

  let tokens;
  try {
    tokens = await exchangeAuthCode(youtubeOAuthConfig(c.env), parsed.data.code, redirectUri);
  } catch (err) {
    if (err instanceof YouTubeAuthError && err.reason === "YOUTUBE_NOT_CONFIGURED") {
      return c.json(error("YOUTUBE_UNAVAILABLE", "YouTube integration not configured"), 503);
    }
    return c.json(error("OAUTH_EXCHANGE_FAILED", err instanceof Error ? err.message : "Code exchange failed"), 400);
  }

  // Granular consent: the user can click Continue without ticking the
  // YouTube boxes. Don't store a "connected" account that can't upload.
  if (!hasRequiredYouTubeScopes(tokens.scope)) {
    return c.json(error("SCOPES_NOT_GRANTED", "YouTube access was not granted — tick both YouTube permissions"), 400);
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
