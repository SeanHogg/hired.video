// YouTube Pro publish flow — thin route layer for #202.
//
// All business logic lives in `services/youtube/` (oauth, upload, account
// repository). This file only:
//   1. Validates request bodies + URL params.
//   2. Resolves the caller's account via the repository.
//   3. Delegates token refresh + upload to the services.
//   4. Translates service errors into the API's success/error envelope.
//
// Mount: app.route("/api/youtube", youtubeRoutes).

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePremium } from "../middleware/tierEnforcement.js";
import { cdnUrl } from "../utils/cdn.js";
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
  getFreshAccessToken,
  YouTubeAuthError,
} from "../services/youtube/youtubeOAuth.js";
import { uploadVideo, YouTubeUploadError } from "../services/youtube/youtubeUpload.js";

const { videos } = schema;

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

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

function defaultRedirectUri(env: Env): string {
  return `${env.FRONTEND_URL ?? ""}/studio/youtube/callback`;
}

// ─── GET /api/youtube/account ───────────────────────────────────────────────
youtubeRoutes.get("/account", async (c) => {
  const account = await getActiveAccount(c.var.user.sub);
  return c.json(ok(account ? accountToDto(account) : null));
});

// ─── GET /api/youtube/auth-url ──────────────────────────────────────────────
youtubeRoutes.get("/auth-url", (c) => {
  if (!c.env.YOUTUBE_CLIENT_ID) {
    return c.json(fail("CONFIGURATION_ERROR", "YouTube integration is not configured"), 503);
  }
  return c.json(ok({ authUrl: buildAuthUrl(c.env, defaultRedirectUri(c.env)) }));
});

// ─── POST /api/youtube/callback ─────────────────────────────────────────────
youtubeRoutes.post("/callback", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Missing OAuth callback code"), 400);

  const redirectUri = parsed.data.redirectUri ?? defaultRedirectUri(c.env);

  let tokens;
  try {
    tokens = await exchangeAuthCode(c.env, parsed.data.code, redirectUri);
  } catch (err) {
    if (err instanceof YouTubeAuthError && err.reason === "YOUTUBE_NOT_CONFIGURED") {
      return c.json(fail("YOUTUBE_UNAVAILABLE", "YouTube integration not configured"), 503);
    }
    return c.json(fail("OAUTH_EXCHANGE_FAILED", err instanceof Error ? err.message : "Code exchange failed"), 400);
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

  return c.json(ok(accountToDto(saved)));
});

// ─── POST /api/youtube/disconnect ───────────────────────────────────────────
youtubeRoutes.post("/disconnect", async (c) => {
  await deactivateAllForUser(c.var.user.sub);
  return c.json(ok(undefined));
});

// ─── POST /api/youtube/publish/:videoId ─────────────────────────────────────
youtubeRoutes.post("/publish/:videoId", requirePremium("YouTube Publishing"), async (c) => {
  const user = c.var.user;
  const videoId = c.req.param("videoId");
  const body = await c.req.json().catch(() => null);
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid publish metadata", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, user.sub)))
    .limit(1);
  if (!video) return c.json(fail("NOT_FOUND", "Video not found"), 404);
  if (!video.r2Key) {
    return c.json(fail("VIDEO_NOT_READY", "The video has not finished compiling yet."), 409);
  }

  const account = await getActiveAccount(user.sub);
  if (!account) {
    return c.json(fail("NOT_CONNECTED", "Connect your YouTube channel before publishing."), 409);
  }

  let accessToken: string;
  try {
    accessToken = await getFreshAccessToken(c.env, account);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token refresh failed";
    return c.json(fail("YOUTUBE_AUTH", `Reconnect your YouTube channel: ${message}`), 401);
  }

  const mediaRes = await fetch(cdnUrl(video.r2Key));
  if (!mediaRes.ok) {
    return c.json(fail("MEDIA_FETCH_FAILED", `Failed to fetch compiled video: ${mediaRes.status}`), 502);
  }
  const mediaBytes = new Uint8Array(await mediaRes.arrayBuffer());

  let result;
  try {
    result = await uploadVideo(accessToken, parsed.data, mediaBytes);
  } catch (err) {
    if (err instanceof YouTubeUploadError) {
      return c.json(fail("YOUTUBE_UPLOAD_FAILED", err.message), 502);
    }
    throw err;
  }

  await db.update(videos)
    .set({
      youtubeVideoId: result.youtubeVideoId,
      youtubeUrl:     result.youtubeUrl,
      updatedAt:      new Date(),
    } as any)
    .where(eq(videos.id, video.id));

  return c.json(ok(result));
});

// ─── Company-channel admin (SuperAdmin) endpoints ──────────────────────────
youtubeRoutes.get("/company/status", (c) => {
  const configured = Boolean(c.env.YOUTUBE_CLIENT_ID && c.env.YOUTUBE_REFRESH_TOKEN);
  return c.json(ok(configured));
});

youtubeRoutes.get("/company/auth-url", (c) => {
  if (!c.env.YOUTUBE_CLIENT_ID) {
    return c.json(fail("CONFIGURATION_ERROR", "YOUTUBE_CLIENT_ID is not configured"), 500);
  }
  return c.json(ok({ authUrl: buildAuthUrl(c.env, defaultRedirectUri(c.env)) }));
});
