import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { studioProjects, videos } = schema;

export const studioRoutes = new Hono<{ Variables: Variables }>();

const StoryboardSceneSchema = z.object({
  duration: z.number(),
  type: z.enum(["intro", "achievement", "skills", "closing"]),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.string().optional(),
  skills: z.array(z.string()).optional(),
  visual: z.string(),
  camera: z.string(),
});

const StoryboardSchema = z.object({
  style: z.object({
    theme: z.string(),
    color_palette: z.array(z.string()),
    font_style: z.string(),
  }),
  scenes: z.array(StoryboardSceneSchema),
});

const GenerateStoryboardSchema = z.object({
  resumeText: z.string().min(20),
  targetDuration: z.number().min(30).max(600).default(120),
});

const PublishVideoSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(""),
  privacyStatus: z.enum(["public", "private", "unlisted"]).default("unlisted"),
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

function asIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function mapStudioStatus(raw: string): "Draft" | "Processing" | "Publishing" | "Completed" | "Failed" {
  const v = raw.toLowerCase();
  if (v === "draft" || v === "pending") return "Draft";
  if (v === "publishing") return "Publishing";
  if (v === "published" || v === "completed") return "Completed";
  if (v === "publish_failed" || v === "failed") return "Failed";
  return "Processing";
}

function normalizeStoryboard(input: unknown): z.infer<typeof StoryboardSchema> | null {
  const parsed = StoryboardSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  const old = input as { scenes?: Array<{ title?: string; narration?: string; visuals?: string; duration?: number }> } | null;
  if (!old?.scenes?.length) return null;

  const converted = {
    style: {
      theme: "professional",
      color_palette: ["#0f172a", "#2563eb", "#14b8a6"],
      font_style: "Inter",
    },
    scenes: old.scenes.slice(0, 4).map((s, idx) => ({
      duration: s.duration ?? 8,
      type: (idx === 0 ? "intro" : idx === old.scenes.length - 1 ? "closing" : idx % 2 === 0 ? "skills" : "achievement") as
        | "intro"
        | "achievement"
        | "skills"
        | "closing",
      title: s.title,
      text: s.narration,
      visual: s.visuals ?? "Professional office background",
      camera: "medium",
    })),
  };

  return StoryboardSchema.parse(converted);
}

function buildMockStoryboard(resumeText: string, targetDuration: number): z.infer<typeof StoryboardSchema> {
  const cleaned = resumeText.replace(/\s+/g, " ").trim();
  const intro = cleaned.slice(0, 140) || "Professional introduction";
  const perScene = Math.max(8, Math.round(targetDuration / 4));

  return {
    style: {
      theme: "professional",
      color_palette: ["#0f172a", "#2563eb", "#14b8a6"],
      font_style: "Inter",
    },
    scenes: [
      {
        duration: perScene,
        type: "intro",
        title: "Professional Introduction",
        subtitle: intro,
        visual: "Modern office with subtle gradient backdrop",
        camera: "close-up",
      },
      {
        duration: perScene,
        type: "achievement",
        title: "Key Achievements",
        text: "Highlight measurable impact, outcomes, and leadership.",
        visual: "Data charts and milestones animation",
        camera: "medium",
      },
      {
        duration: perScene,
        type: "skills",
        title: "Core Skills",
        skills: ["Communication", "Problem Solving", "Leadership", "Execution"],
        visual: "Skill badges orbiting around profile silhouette",
        camera: "wide",
      },
      {
        duration: perScene,
        type: "closing",
        title: "Let us connect",
        text: "Open to discussing how I can contribute.",
        visual: "Clean branded outro card",
        camera: "static",
      },
    ],
  };
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

function getBucket(): string {
  return process.env.STORAGE_BUCKET ?? "myvideoresume";
}

function canUseObjectStorage(): boolean {
  return Boolean(process.env.STORAGE_ENDPOINT && process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY);
}

function toProjectDto(
  project: typeof studioProjects.$inferSelect,
  linkedVideo?: typeof videos.$inferSelect | null,
) {
  const storyboard = normalizeStoryboard(project.storyboard);
  return {
    id: project.id,
    userId: project.userId,
    title: project.resumeText?.slice(0, 80) || "My Video Resume",
    status: mapStudioStatus(project.status),
    youtubeVideoId: linkedVideo?.youtubeVideoId ?? null,
    videoUrl: linkedVideo?.youtubeUrl ?? (linkedVideo?.r2Key ? `https://cdn.myvideoresu.me/${linkedVideo.r2Key}` : null),
    thumbnailUrl: linkedVideo?.thumbnailUrl ?? null,
    storyboard,
    creationDateTime: asIso(project.createdAt),
    updateDateTime: asIso(project.updatedAt),
  };
}

studioRoutes.post("/storyboard", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateStoryboardSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const storyboard = buildMockStoryboard(parsed.data.resumeText, parsed.data.targetDuration);

  const db = getDb();
  await db.insert(studioProjects).values({
    userId: user.sub,
    resumeText: parsed.data.resumeText,
    storyboard,
    status: "storyboard_ready",
  } as any);

  return c.json(ok(storyboard), 201);
});

studioRoutes.post("/upload", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);

  const file = form?.get("video") as File | null;
  const title = String(form?.get("title") ?? "My Video Resume");
  const maybeProjectId = String(form?.get("projectId") ?? "").trim();

  if (!file || typeof file.arrayBuffer !== "function") {
    return c.json(fail("VALIDATION_ERROR", "Missing video file"), 400);
  }

  const db = getDb();

  let project: typeof studioProjects.$inferSelect | undefined;
  if (maybeProjectId) {
    const [existing] = await db
      .select()
      .from(studioProjects)
      .where(and(eq(studioProjects.id, maybeProjectId), eq(studioProjects.userId, user.sub)))
      .limit(1);
    project = existing;
  }

  if (!project) {
    const [created] = await db
      .insert(studioProjects)
      .values({
        userId: user.sub,
        resumeText: title,
        storyboard: null,
        status: "pending",
      } as any)
      .returning();
    project = created;
  }

  let r2Key = `studio/${user.sub}/${project.id}/${Date.now()}-${file.name || "video.webm"}`;

  if (canUseObjectStorage()) {
    const bytes = await file.arrayBuffer();
    const s3 = getS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: r2Key,
        Body: Buffer.from(bytes),
        ContentType: file.type || "video/webm",
        Metadata: { userId: user.sub, projectId: project.id },
      }),
    );
  }

  const [video] = await db
    .insert(videos)
    .values({
      userId: user.sub,
      status: "Queued",
      r2Key,
      title,
    } as any)
    .returning();

  const [updatedProject] = await db
    .update(studioProjects)
    .set({ status: "video_uploaded", videoId: video.id, updatedAt: new Date() } as any)
    .where(eq(studioProjects.id, project.id))
    .returning();

  return c.json(ok(toProjectDto(updatedProject, video)), 201);
});

studioRoutes.post("/publish", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = PublishVideoSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(studioProjects)
    .where(and(eq(studioProjects.id, parsed.data.projectId), eq(studioProjects.userId, user.sub)))
    .limit(1);

  if (!project) {
    return c.json(fail("NOT_FOUND", "Studio project not found"), 404);
  }

  let linkedVideo: typeof videos.$inferSelect | null = null;
  if (project.videoId) {
    const [existingVideo] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, project.videoId), eq(videos.userId, user.sub)))
      .limit(1);
    linkedVideo = existingVideo ?? null;
  }

  if (!linkedVideo) {
    const [createdVideo] = await db
      .insert(videos)
      .values({
        userId: user.sub,
        status: "Completed",
        title: parsed.data.title,
        description: parsed.data.description,
        privacyStatus: parsed.data.privacyStatus,
      } as any)
      .returning();
    linkedVideo = createdVideo;
  }

  const youtubeVideoId = linkedVideo.youtubeVideoId ?? `yt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const youtubeUrl = linkedVideo.youtubeUrl ?? `https://www.youtube.com/watch?v=${youtubeVideoId}`;

  const [updatedVideo] = await db
    .update(videos)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      privacyStatus: parsed.data.privacyStatus,
      status: "Completed",
      youtubeVideoId,
      youtubeUrl,
      updatedAt: new Date(),
    } as any)
    .where(eq(videos.id, linkedVideo.id))
    .returning();

  const [updatedProject] = await db
    .update(studioProjects)
    .set({
      status: "published",
      videoId: linkedVideo.id,
      updatedAt: new Date(),
    } as any)
    .where(eq(studioProjects.id, project.id))
    .returning();

  return c.json(ok(toProjectDto(updatedProject, updatedVideo)));
});

studioRoutes.get("/status/:projectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const [project] = await db
    .select()
    .from(studioProjects)
    .where(and(eq(studioProjects.id, projectId), eq(studioProjects.userId, user.sub)))
    .limit(1);

  if (!project) {
    return c.json(fail("NOT_FOUND", "Studio project not found"), 404);
  }

  let linkedVideo: typeof videos.$inferSelect | null = null;
  if (project.videoId) {
    const [video] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, project.videoId), eq(videos.userId, user.sub)))
      .limit(1);
    linkedVideo = video ?? null;
  }

  const status = mapStudioStatus(project.status);
  const progressPercentage =
    status === "Draft" ? 10 :
    status === "Processing" ? 45 :
    status === "Publishing" ? 75 :
    status === "Completed" ? 100 : 0;

  return c.json(ok({
    id: project.id,
    status,
    progressPercentage,
    youtubeVideoId: linkedVideo?.youtubeVideoId ?? null,
    videoUrl: linkedVideo?.youtubeUrl ?? (linkedVideo?.r2Key ? `https://cdn.myvideoresu.me/${linkedVideo.r2Key}` : null),
    errorMessage: status === "Failed" ? linkedVideo?.errorMessage ?? "Publishing failed" : null,
  }));
});

studioRoutes.get("/projects", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const projects = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.userId, user.sub))
    .orderBy(studioProjects.updatedAt);

  const videoIds = projects.map((p) => p.videoId).filter((id): id is string => Boolean(id));
  const linkedVideos = videoIds.length
    ? await db.select().from(videos).where(and(eq(videos.userId, user.sub), inArray(videos.id, videoIds)))
    : [];
  const videoById = new Map(linkedVideos.map((v) => [v.id, v]));

  return c.json(ok(projects.map((p) => toProjectDto(p, p.videoId ? videoById.get(p.videoId) ?? null : null))));
});
