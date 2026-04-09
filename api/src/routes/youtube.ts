import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { youtubeAccounts, videos } = schema;

export const youtubeRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
].join(" ");

const CallbackSchema = z.object({ code: z.string().min(1) });

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string) {
  return { success: false as const, error: { code, message }, timestamp: new Date().toISOString() };
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

youtubeRoutes.get("/auth-url", (c) => {
  if (!c.env.YOUTUBE_CLIENT_ID) {
    return c.json(fail("CONFIGURATION_ERROR", "YOUTUBE_CLIENT_ID is not configured"), 500);
  }

  const params = new URLSearchParams({
    client_id: c.env.YOUTUBE_CLIENT_ID,
    redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  return c.json(ok({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }));
});

youtubeRoutes.post("/callback", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CallbackSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Missing OAuth callback code"), 400);
  }

  const db = getDb();
  const channelId = `channel_${user.sub.slice(0, 8)}`;
  const channelTitle = "Connected YouTube Channel";

  const [existing] = await db
    .select()
    .from(youtubeAccounts)
    .where(eq(youtubeAccounts.userId, user.sub))
    .limit(1);

  const [saved] = existing
    ? await db
        .update(youtubeAccounts)
        .set({
          channelId,
          channelTitle,
          accessToken: `stub-access-${parsed.data.code.slice(0, 8)}`,
          refreshToken: `stub-refresh-${user.sub.slice(0, 8)}`,
          tokenExpiresAt: null,
          isActive: true,
          updatedAt: new Date(),
        } as any)
        .where(eq(youtubeAccounts.id, existing.id))
        .returning()
    : await db
        .insert(youtubeAccounts)
        .values({
          userId: user.sub,
          channelId,
          channelTitle,
          accessToken: `stub-access-${parsed.data.code.slice(0, 8)}`,
          refreshToken: `stub-refresh-${user.sub.slice(0, 8)}`,
          tokenExpiresAt: null,
          isActive: true,
        } as any)
        .returning();

  return c.json(ok(accountToDto(saved)));
});

youtubeRoutes.post("/disconnect", async (c) => {
  const user = c.var.user;
  const db = getDb();

  await db
    .update(youtubeAccounts)
    .set({ isActive: false, updatedAt: new Date() } as any)
    .where(eq(youtubeAccounts.userId, user.sub));

  return c.json(ok(undefined));
});

youtubeRoutes.post("/publish/:videoId", async (c) => {
  const user = c.var.user;
  const videoId = c.req.param("videoId");
  const db = getDb();

  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, user.sub)))
    .limit(1);

  if (!video) {
    return c.json(fail("NOT_FOUND", "Video not found"), 404);
  }

  const youtubeVideoId = video.youtubeVideoId ?? `yt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const youtubeUrl = video.youtubeUrl ?? `https://www.youtube.com/watch?v=${youtubeVideoId}`;

  await db
    .update(videos)
    .set({
      youtubeVideoId,
      youtubeUrl,
      status: "Completed",
      updatedAt: new Date(),
    } as any)
    .where(eq(videos.id, video.id));

  return c.json(ok({ youtubeVideoId, youtubeUrl }));
});

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
    redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  return c.json(ok({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }));
});
