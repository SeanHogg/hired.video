import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { cdnUrl } from "../utils/cdn.js";

const { videos } = schema;

export const videoRoutes = new Hono<{ Variables: Variables }>();

const CreateVideoSchema = z.object({
  resumeId: z.string().uuid(),
  customScenePrompt: z.string().optional(),
  includeAvatar: z.boolean().default(false),
});

const EnhanceSummarySchema = z.object({
  resumeId: z.string().uuid(),
  summary: z.string().min(1),
});

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string) {
  return { success: false as const, error: { code, message }, timestamp: new Date().toISOString() };
}

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "auto",
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

function asIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toVideoDto(video: typeof videos.$inferSelect) {
  const status = (video.status ?? "Queued") as "Queued" | "Processing" | "Completed" | "Failed" | "Cancelled";
  return {
    id: video.id,
    resumeId: video.resumeId ?? "",
    userId: video.userId,
    status,
    filePath: video.youtubeUrl ?? (video.r2Key ? cdnUrl(video.r2Key) : null),
    includeAvatar: false,
    scenePrompt: null,
    errorMessage: video.errorMessage ?? null,
    operationId: null,
    generatedImagePath: null,
    generationStartedAt: status === "Processing" ? asIso(video.updatedAt) : null,
    generationCompletedAt: status === "Completed" ? asIso(video.updatedAt) : null,
    retryCount: 0,
    creationDateTime: asIso(video.createdAt),
    updateDateTime: asIso(video.updatedAt),
  };
}

videoRoutes.get("/user/all", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const userVideos = await db
    .select()
    .from(videos)
    .where(eq(videos.userId, user.sub))
    .orderBy(videos.updatedAt);

  return c.json(ok(userVideos.map(toVideoDto)));
});

videoRoutes.post("/generate", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateVideoSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body"), 400);
  }

  const db = getDb();

  const [video] = await db
    .insert(videos)
    .values({
      userId: user.sub,
      resumeId: parsed.data.resumeId,
      status: "Queued",
      storyboard: {
        includeAvatar: parsed.data.includeAvatar,
        customScenePrompt: parsed.data.customScenePrompt ?? null,
      },
    } as any)
    .returning();

  return c.json(ok(toVideoDto(video)), 202);
});

videoRoutes.post("/enhance-summary", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = EnhanceSummarySchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body"), 400);
  }

  return c.json(
    ok({
      enhancedSummary: parsed.data.summary,
      suggestedScenePrompt: "Professional office environment with modern technology",
    }),
  );
});

videoRoutes.get("/resume/:resumeId", async (c) => {
  const user = c.var.user;
  const resumeId = c.req.param("resumeId");
  const db = getDb();

  const rows = await db
    .select()
    .from(videos)
    .where(and(eq(videos.resumeId, resumeId), eq(videos.userId, user.sub)))
    .orderBy(videos.updatedAt);

  return c.json(ok(rows.map(toVideoDto)));
});

videoRoutes.get("/resume/:resumeId/can-generate", async (c) => {
  const user = c.var.user;
  const resumeId = c.req.param("resumeId");
  const db = getDb();

  const rows = await db
    .select({ status: videos.status })
    .from(videos)
    .where(and(eq(videos.resumeId, resumeId), eq(videos.userId, user.sub)));

  const blocked = rows.some((r) => r.status === "Queued" || r.status === "Processing");

  return c.json(
    ok({
      canGenerate: !blocked,
      reason: blocked ? "A video is already being generated for this resume" : undefined,
    }),
  );
});

videoRoutes.get("/resume/:resumeId/active", async (c) => {
  const user = c.var.user;
  const resumeId = c.req.param("resumeId");
  const db = getDb();

  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.resumeId, resumeId), eq(videos.userId, user.sub)))
    .limit(1);

  if (!video || (video.status !== "Queued" && video.status !== "Processing")) {
    return c.json(ok(null));
  }

  return c.json(ok(toVideoDto(video)));
});

videoRoutes.get("/:id/status", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

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
    return c.json(fail("NOT_FOUND", "Video not found"), 404);
  }

  const progressPercentage =
    video.status === "Completed" ? 100
    : video.status === "Processing" ? 55
    : video.status === "Queued" ? 5
    : 0;

  return c.json(
    ok({
      id: video.id,
      status: video.status,
      progressPercentage,
      estimatedTimeRemaining: video.status === "Processing" ? 60 : null,
      errorMessage: video.errorMessage ?? null,
      filePath: video.youtubeUrl ?? (video.r2Key ? cdnUrl(video.r2Key) : null),
    }),
  );
});

videoRoutes.get("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, user.sub)))
    .limit(1);

  if (!video) {
    return c.json(fail("NOT_FOUND", "Video not found"), 404);
  }

  return c.json(ok(toVideoDto(video)));
});

videoRoutes.post("/:id/cancel", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [existing] = await db
    .select({ id: videos.id, status: videos.status })
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(fail("NOT_FOUND", "Video not found"), 404);
  }

  if (existing.status !== "Queued" && existing.status !== "Processing") {
    return c.json(fail("CONFLICT", `Cannot cancel a video with status '${existing.status}'`), 409);
  }

  const [updated] = await db
    .update(videos)
    .set({ status: "Cancelled", updatedAt: new Date() } as any)
    .where(eq(videos.id, id))
    .returning();

  return c.json(ok(toVideoDto(updated)));
});

videoRoutes.delete("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [existing] = await db
    .select({ id: videos.id, r2Key: videos.r2Key })
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, user.sub)))
    .limit(1);

  if (!existing) {
    return c.json(fail("NOT_FOUND", "Video not found"), 404);
  }

  if (existing.r2Key) {
    const s3 = getS3Client();
    await s3
      .send(new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET ?? "hired.video", Key: existing.r2Key }))
      .catch((err: unknown) => {
        console.warn("[video] failed to delete S3 object", existing.r2Key, err);
      });
  }

  await db.delete(videos).where(eq(videos.id, id));
  return c.json(ok(undefined));
});
