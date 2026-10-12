/**
 * Public channel routes — `/u/:handle` lands here.
 *
 * GET    /api/channels/:handle               — public profile + video catalog
 *                                              + current video pitch (#2133)
 * GET    /api/channels/me/youtube            — list my ingests (auth)
 * POST   /api/channels/me/youtube            — paste a YouTube URL → ingest
 * PATCH  /api/channels/me/youtube/:id        — hide/unhide an ingest
 * DELETE /api/channels/me/youtube/:id        — remove an ingest
 * PATCH  /api/channels/me/profile-mode       — set my own profile_mode
 *
 * Everything routes through the shared `profile-mode.ts` resolver and
 * `youtube-ingest.ts` service per the standing DRY rule. The channel
 * page itself doesn't decide "is this user a creator" — it asks the
 * resolver, which is the single source of truth.
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";

import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  findUserByHandle,
  resolveProfileMode,
} from "../services/profile/profile-mode.js";
import {
  deleteIngest,
  ingestYoutubeUrl,
  listIngests,
  setIngestHidden,
} from "../services/profile/youtube-ingest.js";
import { getProfilePitch } from "../services/pitch/pitchService.js";

const { users, videos, studioProjects } = schema;

export const channelRoutes = new Hono<AppEnv>();

// Public — no auth gate. The handle IS the entry point.
channelRoutes.get("/:handle", async (c) => {
  const handle = c.req.param("handle");
  if (!handle) return c.json(error("BAD_REQUEST", "Missing handle"), 400);
  const db = getDb();
  const user = await findUserByHandle(db, handle);
  if (!user) return c.json(error("NOT_FOUND", "Channel not found"), 404);

  // Only videos whose studio_project is currently published surface on
  // a public channel page. The video.privacy_status mirror is kept in
  // step by PATCH /api/studio/projects/:id/status (gap #723), but the
  // INNER JOIN here is the structural gate so a future writer that
  // forgets to mirror can't leak an unpublished video onto the channel.
  // Profile-primary (the per-user "THE video on my profile" pointer
  // from migration 0088) leads the grid so the user's pinned choice
  // appears first regardless of recency (gap #725).
  //
  // The current video pitch (#2133) rides the same parallel fan-out: one
  // query (pitch takes LEFT JOIN the owner's profile-section overrides),
  // null when absent or when the owner hid the "videoResume" section —
  // the same rule /people/:id applies.
  const nativeVideosQuery = db
    .select({
      id: videos.id,
      title: videos.title,
      thumbnailUrl: videos.thumbnailUrl,
      r2Key: videos.r2Key,
      duration: videos.duration,
      createdAt: videos.createdAt,
      isProfilePrimary: studioProjects.isProfilePrimary,
    })
    .from(videos)
    .innerJoin(studioProjects, eq(studioProjects.videoId, videos.id))
    .where(and(
      eq(videos.userId, user.id),
      eq(videos.privacyStatus, "public"),
      eq(studioProjects.status, "published"),
    ))
    .orderBy(desc(studioProjects.isProfilePrimary), desc(videos.createdAt));

  const [resolution, youtubeIngests, nativeVideos, pitch] = await Promise.all([
    resolveProfileMode(db, user),
    listIngests(db, user.id),
    nativeVideosQuery,
    getProfilePitch({ id: user.id, role: user.role ?? null }),
  ]);

  return c.json(
    success({
      user: {
        id: user.id,
        handle: user.externalPublicHandle,
        name: user.name,
      },
      mode: resolution.mode,
      modeSetting: resolution.setting,
      modeAuto: resolution.auto,
      signals: resolution.signals,
      nativeVideos,
      youtubeIngests,
      pitch,
    }),
  );
});

// ── Authenticated self-management ────────────────────────────────────

channelRoutes.get("/me/youtube", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const ingests = await listIngests(db, userId, { includeHidden: true });
  return c.json(success(ingests));
});

const ingestSchema = z.object({ url: z.string().min(5).max(512) });
channelRoutes.post("/me/youtube", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ingestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(error("BAD_REQUEST", "Missing url"), 400);
  const db = getDb();
  try {
    const result = await ingestYoutubeUrl(db, userId, parsed.data.url);
    return c.json(success(result));
  } catch (err) {
    return c.json(
      error("INGEST_FAILED", err instanceof Error ? err.message : "Ingest failed"),
      400,
    );
  }
});

const patchSchema = z.object({ hidden: z.boolean() });
channelRoutes.patch("/me/youtube/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const parsed = patchSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(error("BAD_REQUEST", "Missing hidden"), 400);
  const db = getDb();
  await setIngestHidden(db, id, userId, parsed.data.hidden);
  return c.json(success({ ok: true }));
});

channelRoutes.delete("/me/youtube/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const db = getDb();
  await deleteIngest(db, id, userId);
  return c.json(success({ ok: true }));
});

const profileModeSchema = z.object({
  profileMode: z.enum(["resume", "channel", "auto"]),
});
channelRoutes.patch("/me/profile-mode", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = profileModeSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(error("BAD_REQUEST", "Invalid profileMode"), 400);
  const db = getDb();
   
  await db.update(users).set({ profileMode: parsed.data.profileMode } as any).where(eq(users.id, userId));
  // Re-resolve so the caller sees the effective mode (not just the
  // setting). Cheap — the resolver short-circuits when setting != auto.
  const [refreshed] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!refreshed) return c.json(error("NOT_FOUND", "User vanished"), 404);
  const resolution = await resolveProfileMode(db, refreshed);
  return c.json(success(resolution));
});
