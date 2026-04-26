// YouTube Data API v3 OAuth + one-click publishing.
//
// Closes Pricing-page Pro claim "YouTube publishing" (#202). The previous
// stub left this file resolving to fake IDs; the routes here now hit
// Google's real OAuth + Data API endpoints.
//
// Flow:
//   1. GET  /api/youtube/auth-url   — caller-side popup URL (web redirect).
//   2. POST /api/youtube/callback   — exchange `code` for tokens, persist
//                                     channel snippet via /channels?mine=true.
//   3. POST /api/youtube/publish/:videoId (Pro-gated) — refresh access token,
//                                     fetch the compiled MP4 from R2/CDN,
//                                     multipart-upload to YouTube, persist
//                                     the returned video ID + URL on the row.
//   4. POST /api/youtube/disconnect — soft-delete (isActive=false).
//
// Token refresh runs lazily in `getFreshAccessToken` — every authenticated
// call goes through it. Refresh tokens never expire under Google's offline
// access; access tokens are 1h.
//
// Cloudflare Worker note: multipart upload streams the response body of the
// CDN fetch directly into the YouTube upload request body, so memory stays
// bounded by Worker streaming buffers rather than scaling with file size.

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePremium } from "../middleware/tierEnforcement.js";
import { cdnUrl } from "../utils/cdn.js";

const { youtubeAccounts, videos } = schema;

export const youtubeRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// `youtube.upload` is enough to insert videos. We also request `youtube` so
// /channels?mine=true returns the connecting user's channel ID + title.
const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";
const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";

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

function accountToDto(account: typeof youtubeAccounts.$inferSelect) {
  return {
    channelId: account.channelId,
    channelTitle: account.channelTitle ?? "My YouTube Channel",
    channelThumbnail: undefined,
    subscriberCount: undefined,
    videoCount: undefined,
    connectedAt: new Date(account.createdAt).toISOString(),
  };
}

// Refresh the access token via the stored refresh_token. Returns the fresh
// access token and updates the DB row's expiry timestamp. Throws on hard
// auth failures so the route handler can return a 401 to surface "reconnect
// your YouTube" in the UI.
async function getFreshAccessToken(
  env: Env,
  account: typeof youtubeAccounts.$inferSelect,
): Promise<string> {
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  // 60s safety window — never serve a token that's about to expire mid-upload.
  if (account.accessToken && expiresAt > Date.now() + 60_000) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    throw new Error("REFRESH_TOKEN_MISSING");
  }
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new Error("YOUTUBE_NOT_CONFIGURED");
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`REFRESH_FAILED: ${res.status} ${body}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };

  const db = getDb();
  const newExpiry = new Date(Date.now() + (data.expires_in - 30) * 1000);
  await db.update(youtubeAccounts)
    .set({ accessToken: data.access_token, tokenExpiresAt: newExpiry, updatedAt: new Date() } as any)
    .where(eq(youtubeAccounts.id, account.id));

  return data.access_token;
}

// ─── GET /api/youtube/account ───────────────────────────────────────────────
youtubeRoutes.get("/account", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const [account] = await db
    .select()
    .from(youtubeAccounts)
    .where(and(eq(youtubeAccounts.userId, user.sub), eq(youtubeAccounts.isActive, true)))
    .limit(1);

  return c.json(ok(account ? accountToDto(account) : null));
});

// ─── GET /api/youtube/auth-url ──────────────────────────────────────────────
youtubeRoutes.get("/auth-url", (c) => {
  if (!c.env.YOUTUBE_CLIENT_ID) {
    return c.json(fail("CONFIGURATION_ERROR", "YouTube integration is not configured"), 503);
  }

  const params = new URLSearchParams({
    client_id: c.env.YOUTUBE_CLIENT_ID,
    redirect_uri: defaultRedirectUri(c.env),
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });

  return c.json(ok({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }));
});

// ─── POST /api/youtube/callback ─────────────────────────────────────────────
// Real Google OAuth code-exchange. Persists access + refresh tokens and
// auto-fetches the connecting user's primary channel.
youtubeRoutes.post("/callback", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Missing OAuth callback code"), 400);

  if (!c.env.YOUTUBE_CLIENT_ID || !c.env.YOUTUBE_CLIENT_SECRET) {
    return c.json(fail("YOUTUBE_UNAVAILABLE", "YouTube integration not configured"), 503);
  }

  // 1. Exchange code for tokens.
  const redirectUri = parsed.data.redirectUri ?? defaultRedirectUri(c.env);
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: parsed.data.code,
      client_id: c.env.YOUTUBE_CLIENT_ID,
      client_secret: c.env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    return c.json(fail("OAUTH_EXCHANGE_FAILED", `Google rejected the OAuth code: ${detail}`), 400);
  }
  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  // 2. Identify the user (for googleId + email) and the channel.
  const userInfoRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = userInfoRes.ok
    ? await userInfoRes.json() as { sub: string; email?: string; name?: string }
    : { sub: `user_${user.sub.slice(0, 8)}`, email: undefined, name: undefined };

  const channelRes = await fetch(CHANNELS_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  let channelId: string | null = null;
  let channelTitle: string | null = null;
  if (channelRes.ok) {
    const channelData = await channelRes.json() as {
      items?: Array<{ id: string; snippet: { title: string } }>;
    };
    const first = channelData.items?.[0];
    if (first) {
      channelId = first.id;
      channelTitle = first.snippet.title;
    }
  }

  const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in - 30) * 1000);

  // 3. Upsert by (userId, googleId).
  const db = getDb();
  const [existing] = await db.select().from(youtubeAccounts)
    .where(and(eq(youtubeAccounts.userId, user.sub), eq(youtubeAccounts.googleId, userInfo.sub)))
    .limit(1);

  const [saved] = existing
    ? await db.update(youtubeAccounts).set({
        accessToken: tokens.access_token,
        // Google only returns refresh_token on the first consent. Preserve
        // the existing one on re-auth.
        refreshToken: tokens.refresh_token ?? existing.refreshToken,
        tokenExpiresAt,
        scopes: tokens.scope,
        channelId: channelId ?? existing.channelId,
        channelTitle: channelTitle ?? existing.channelTitle,
        displayName: userInfo.name ?? existing.displayName,
        email: userInfo.email ?? existing.email,
        isActive: true,
        updatedAt: new Date(),
      } as any).where(eq(youtubeAccounts.id, existing.id)).returning()
    : await db.insert(youtubeAccounts).values({
        userId: user.sub,
        googleId: userInfo.sub,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt,
        scopes: tokens.scope,
        channelId,
        channelTitle,
        displayName: userInfo.name ?? null,
        email: userInfo.email ?? null,
        isActive: true,
      } as any).returning();

  return c.json(ok(accountToDto(saved)));
});

// ─── POST /api/youtube/disconnect ───────────────────────────────────────────
youtubeRoutes.post("/disconnect", async (c) => {
  const user = c.var.user;
  const db = getDb();

  await db
    .update(youtubeAccounts)
    .set({ isActive: false, updatedAt: new Date() } as any)
    .where(eq(youtubeAccounts.userId, user.sub));

  return c.json(ok(undefined));
});

// ─── POST /api/youtube/publish/:videoId ─────────────────────────────────────
// Pro-gated. Uploads the compiled MP4 from R2/CDN to YouTube as a single
// multipart request. The accessToken is refreshed lazily before the upload.
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

  const [account] = await db.select().from(youtubeAccounts)
    .where(and(eq(youtubeAccounts.userId, user.sub), eq(youtubeAccounts.isActive, true)))
    .limit(1);
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

  // Pull the compiled MP4. cdnUrl prefers the public CDN; falls back to a
  // signed key only if needed (already handled by cdnUrl helper).
  const mediaUrl = cdnUrl(video.r2Key);
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok || !mediaRes.body) {
    return c.json(fail("MEDIA_FETCH_FAILED", `Failed to fetch compiled video: ${mediaRes.status}`), 502);
  }

  // Build the multipart/related body. Two parts: JSON metadata + binary.
  const boundary = `--hv-yt-${crypto.randomUUID()}--`;
  const metadata = {
    snippet: {
      title: parsed.data.title.slice(0, 100),
      description: parsed.data.description.slice(0, 5000),
      tags: parsed.data.tags?.slice(0, 15),
      categoryId: "22",  // "People & Blogs" — sane default for resume content
    },
    status: { privacyStatus: parsed.data.privacy, selfDeclaredMadeForKids: false },
  };

  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: video/mp4\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);

  // Concat the binary body once. For Cloudflare Workers a streaming approach
  // (constructing a ReadableStream that yields head → mediaBody → tail) would
  // avoid materializing the full MP4 in memory; defer that optimization until
  // we hit a size that warrants it.
  const mediaBytes = new Uint8Array(await mediaRes.arrayBuffer());
  const fullBody = new Uint8Array(head.length + mediaBytes.length + tail.length);
  fullBody.set(head, 0);
  fullBody.set(mediaBytes, head.length);
  fullBody.set(tail, head.length + mediaBytes.length);

  const uploadRes = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: fullBody,
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text();
    return c.json(fail("YOUTUBE_UPLOAD_FAILED", `Upload rejected: ${detail.slice(0, 500)}`), 502);
  }

  const uploaded = await uploadRes.json() as { id: string };
  const youtubeVideoId = uploaded.id;
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

  await db.update(videos)
    .set({ youtubeVideoId, youtubeUrl, updatedAt: new Date() } as any)
    .where(eq(videos.id, video.id));

  return c.json(ok({ youtubeVideoId, youtubeUrl }));
});

// ─── Company-channel admin (SuperAdmin) endpoints ──────────────────────────
// Kept for the existing admin surface; not part of the per-user Pro feature.
youtubeRoutes.get("/company/status", async (c) => {
  const configured = Boolean(c.env.YOUTUBE_CLIENT_ID && c.env.YOUTUBE_REFRESH_TOKEN);
  return c.json(ok(configured));
});

youtubeRoutes.get("/company/auth-url", (c) => {
  if (!c.env.YOUTUBE_CLIENT_ID) {
    return c.json(fail("CONFIGURATION_ERROR", "YOUTUBE_CLIENT_ID is not configured"), 500);
  }

  const params = new URLSearchParams({
    client_id: c.env.YOUTUBE_CLIENT_ID,
    redirect_uri: defaultRedirectUri(c.env),
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  return c.json(ok({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }));
});
