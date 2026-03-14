import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../types";
import { success, error } from "../types";
import { getDb, schema } from "../db";

const { videos } = schema;

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateVideoSchema = z.object({
  resumeId: z.string().uuid(),
  customScenePrompt: z.string().optional(),
  includeAvatar: z.boolean().default(false),
});

const EnhanceSummarySchema = z.object({
  resumeId: z.string().uuid(),
  summary: z.string().min(1),
});

// ============================================================================
// ROUTES
// ============================================================================

export const videoRoutes = new Hono<AppEnv>();

/** GET /api/video/user/all — list all videos for the current user */
videoRoutes.get("/user/all", async (c) => {
  const user = c.var.user;
  const db = getDb(c.env.DATABASE_URL);

  const userVideos = await db
    .select()
    .from(videos)
    .where(eq(videos.userId, user.sub))
    .orderBy(videos.createdAt);

  return c.json(success(userVideos));
});

/** POST /api/video/generate — queue a new video generation job */
videoRoutes.post("/generate", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateVideoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb(c.env.DATABASE_URL);

  const [video] = await db
    .insert(videos)
    .values({
      userId: user.sub,
      resumeId: parsed.data.resumeId,
      status: "Queued",
    })
    .returning();

  // TODO: enqueue actual video generation via Cloudflare Queue / Durable Object
  return c.json(success(video), 202);
});

/** POST /api/video/enhance-summary — AI-enhanced summary (must come before /:id) */
videoRoutes.post("/enhance-summary", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = EnhanceSummarySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  // TODO: call AI service (OpenRouter) to enhance the summary
  return c.json(
    success({
      enhancedSummary: parsed.data.summary,
      suggestedScenePrompt: "Professional office environment with modern technology",
    }),
  );
});

/** GET /api/video/resume/:resumeId — all videos for a resume */
videoRoutes.get("/resume/:resumeId", async (c) => {
  const user = c.var.user;
  const resumeId = c.req.param("resumeId");
  const db = getDb(c.env.DATABASE_URL);

  const resumeVideos = await db
    .select()
    .from(videos)
    .where(and(eq(videos.resumeId, resumeId), eq(videos.userId, user.sub)))
    .orderBy(videos.createdAt);

  return c.json(success(resumeVideos));
});

/** GET /api/video/resume/:resumeId/can-generate */
videoRoutes.get("/resume/:resumeId/can-generate", async (c) => {
  const user = c.var.user;
  const resumeId = c.req.param("resumeId");
  const db = getDb(c.env.DATABASE_URL);

  const activeVideo = await db
    .select({ id: videos.id, status: videos.status })
    .from(videos)
    .where(
      and(
        eq(videos.resumeId, resumeId),
        eq(videos.userId, user.sub),
      ),
    )
    .limit(1);

  const processing = activeVideo.find(
    (v) => v.status === "Queued" || v.status === "Processing",
  );

  return c.json(
    success({
      canGenerate: !processing,
      reason: processing ? "A video is already being generated for this resume" : undefined,
    }),
  );
});

/** GET /api/video/resume/:resumeId/active — currently active generation */
videoRoutes.get("/resume/:resumeId/active", async (c) => {
  const user = c.var.user;
  const resumeId = c.req.param("resumeId");
  const db = getDb(c.env.DATABASE_URL);

  const [active] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.resumeId, resumeId), eq(videos.userId, user.sub)))
    .limit(1);

  const activeVideo =
    active && (active.status === "Queued" || active.status === "Processing")
      ? active
      : null;

  return c.json(success(activeVideo));
});

/** GET /api/video/:id — get a single video */
videoRoutes.get("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, user.sub)))
    .limit(1);

  if (!video) {
    return c.json(error("NOT_FOUND", "Video not found"), 404);
  }

  return c.json(success(video));
});

/** GET /api/video/:id/status — lightweight status poll */
videoRoutes.get("/:id/status", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [video] = await db
    .select({
      id: videos.id,
      status: videos.status,
      errorMessage: videos.errorMessage,
      youtubeUrl: videos.youtubeUrl,
      r2Key: videos.r2Key,
      updatedAt: videos.updatedAt,
    })
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, user.sub)))
    .limit(1);

  if (!video) {
    return c.json(error("NOT_FOUND", "Video not found"), 404);
  }

  const progressPercentage =
    video.status === "Completed" ? 100
    : video.status === "Processing" ? 50
    : video.status === "Queued" ? 0
    : video.status === "Failed" ? 0
    : 100;

  return c.json(
    success({
      id: video.id,
      status: video.status,
      progressPercentage,
      estimatedTimeRemaining: video.status === "Processing" ? 60 : null,
      errorMessage: video.errorMessage,
      filePath: video.youtubeUrl ?? video.r2Key,
    }),
  );
});

/** POST /api/video/:id/cancel — cancel a queued/processing video */
videoRoutes.post("/:id/cancel", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select({ id: videos.id, status: videos.status })
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(error("NOT_FOUND", "Video not found"), 404);
  }

  if (existing.status !== "Queued" && existing.status !== "Processing") {
    return c.json(error("CONFLICT", `Cannot cancel a video with status '${existing.status}'`), 409);
  }

  const [updated] = await db
    .update(videos)
    .set({ status: "Cancelled", updatedAt: new Date() })
    .where(eq(videos.id, id))
    .returning();

  return c.json(success(updated));
});

/** DELETE /api/video/:id — delete a video record */
videoRoutes.delete("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select({ id: videos.id, r2Key: videos.r2Key })
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(error("NOT_FOUND", "Video not found"), 404);
  }

  // Remove from R2 if present
  if (existing.r2Key) {
    await c.env.VIDEO_BUCKET.delete(existing.r2Key).catch((err) => {
      console.warn("[video] failed to delete R2 object", existing.r2Key, err);
    });
  }

  await db.delete(videos).where(eq(videos.id, id));

  return c.json(success(null, "Video deleted"));
});
