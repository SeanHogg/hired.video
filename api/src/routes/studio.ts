import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { studioProjects, videos, users, userProfiles } = schema;

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
  targetDuration: z.number().min(10).max(120).default(28),
  resumeId: z.string().uuid().optional(),
  prompt: z.string().max(500).optional(),
  jobDescription: z.string().max(4000).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  resolution: z.enum(["720p", "1080p"]).optional(),
  motion: z.enum(["minimal", "moderate", "cinematic"]).optional(),
});

const PublishVideoSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(""),
  privacyStatus: z.enum(["public", "private", "unlisted"]).default("unlisted"),
  resumeId: z.string().uuid().optional(),
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

// ─── VideoScript schema (mirrors frontend/types/video-script.ts) ─────────────

const VideoScriptSchema = z.object({
  video: z.object({
    duration: z.number(),
    fps: z.number().default(30),
    resolution: z.enum(["720p", "1080p"]).default("720p"),
    aspect: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
    theme: z.object({
      colorPalette: z.array(z.string()),
      fontFamily: z.string(),
      motion: z.enum(["minimal", "moderate", "cinematic"]).default("moderate"),
      transition: z.enum(["cut", "fade", "slide", "cinematic-fade"]).default("fade"),
      background: z.enum(["gradient", "dark-tech-grid", "particles", "solid"]).default("gradient"),
    }),
  }),
  scenes: z.array(z.object({
    id: z.string(),
    start: z.number(),
    duration: z.number(),
    type: z.enum(["intro", "achievement", "skills", "closing"]),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    text: z.union([z.string(), z.array(z.string())]).optional(),
    items: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    highlight: z.boolean().optional(),
  })),
});

type VideoScript = z.infer<typeof VideoScriptSchema>;

/**
 * Convert a legacy Storyboard (old DB rows) into a VideoScript so both formats
 * go through the same compiler pipeline.
 */
function storyboardToVideoScript(sb: z.infer<typeof StoryboardSchema>, targetDuration: number): VideoScript {
  const perScene = Math.max(5, Math.round(targetDuration / sb.scenes.length));
  let cursor = 0;
  const scenes = sb.scenes.map((s, i) => {
    const start = cursor;
    cursor += perScene;
    return {
      id: `scene-${i}`,
      start,
      duration: perScene,
      type: s.type,
      title: s.title,
      subtitle: s.subtitle,
      text: s.text,
      skills: s.skills,
    };
  });
  return {
    video: {
      duration: cursor,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      theme: {
        colorPalette: sb.style.color_palette,
        fontFamily: sb.style.font_style,
        motion: "moderate",
        transition: "fade",
        background: "gradient",
      },
    },
    scenes,
  };
}

function buildMockVideoScript(resumeText: string, targetDuration: number, motion: "minimal" | "moderate" | "cinematic" = "moderate"): VideoScript {
  const cleaned = resumeText.replace(/\s+/g, " ").trim();
  const intro = cleaned.slice(0, 120) || "Experienced professional";
  const perScene = Math.max(5, Math.round(targetDuration / 4));
  return {
    video: {
      duration: perScene * 4,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      theme: {
        colorPalette: ["#0f172a", "#2563eb", "#14b8a6", "#f8fafc"],
        fontFamily: "Inter",
        motion,
        transition: "fade",
        background: "gradient",
      },
    },
    scenes: [
      { id: "scene-0", start: 0, duration: perScene, type: "intro", title: "Professional Introduction", subtitle: intro },
      { id: "scene-1", start: perScene, duration: perScene, type: "achievement", title: "Key Achievements", items: ["Delivered impactful results", "Led cross-functional teams", "Drove measurable outcomes"] },
      { id: "scene-2", start: perScene * 2, duration: perScene, type: "skills", title: "Core Skills", skills: ["Communication", "Problem Solving", "Leadership", "Execution", "Strategy"] },
      { id: "scene-3", start: perScene * 3, duration: perScene, type: "closing", title: "Let's Connect", text: "Open to new opportunities — reach out!" },
    ],
  };
}

async function callOpenRouter(
  body: z.infer<typeof GenerateStoryboardSchema>,
  apiKey: string,
): Promise<VideoScript> {
  const { resumeText, prompt, jobDescription, model, temperature, targetDuration = 28, motion = "moderate" } = body;

  const jobBlock = jobDescription
    ? `\n\nPersonalise the intro scene for this role. Filter achievements and skills to only those relevant.\nJob Description:\n${jobDescription.slice(0, 3000)}`
    : "";

  const systemPrompt = `You are a professional video director specialising in career content. Produce a JSON VideoScript for a ${targetDuration}-second video resume. Rules:
- Exactly 4 scenes: intro → achievement → skills → closing
- Scene start times are sequential; sum of durations equals video.duration (${targetDuration}s)
- Extract the candidate's real name, role, and measurable achievements from the resume
- Include 4–6 real skills from the resume
- motion style: ${motion}
- Return ONLY valid JSON matching this TypeScript interface:

interface VideoScript {
  video: { duration: number; fps: 30; resolution: "720p"; aspect: "16:9"; theme: { colorPalette: string[]; fontFamily: string; motion: string; transition: string; background: string } }
  scenes: Array<{ id: string; start: number; duration: number; type: "intro"|"achievement"|"skills"|"closing"; title?: string; subtitle?: string; text?: string|string[]; items?: string[]; skills?: string[] }>
}${jobBlock}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hired.video",
      "X-Title": "hired.video Studio",
    },
    body: JSON.stringify({
      model: model ?? "google/gemini-flash-1.5",
      temperature: temperature ?? 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${prompt || "Create a professional video resume"}\n\nResume:\n${resumeText.slice(0, 6000)}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  // Strip markdown code fences if present
  const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const parsed = VideoScriptSchema.safeParse(JSON.parse(stripped));
  if (!parsed.success) throw new Error("LLM returned invalid VideoScript schema");
  return parsed.data;
}

studioRoutes.post("/storyboard", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateStoryboardSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  let script: VideoScript;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      script = await callOpenRouter(parsed.data, apiKey);
    } catch (err) {
      console.error("[studio/storyboard] LLM call failed, using mock:", err);
      script = buildMockVideoScript(parsed.data.resumeText, parsed.data.targetDuration, parsed.data.motion);
    }
  } else {
    script = buildMockVideoScript(parsed.data.resumeText, parsed.data.targetDuration, parsed.data.motion);
  }

  const db = getDb();
  await db.insert(studioProjects).values({
    userId: user.sub,
    resumeText: parsed.data.resumeText,
    resumeId: parsed.data.resumeId ?? null,
    storyboard: script as any,
    status: "storyboard_ready",
  } as any);

  return c.json(ok(script), 201);
});

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
  return process.env.STORAGE_BUCKET ?? "hired.video";
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
    videoUrl: linkedVideo?.youtubeUrl ?? (linkedVideo?.r2Key ? `https://cdn.hired.video/${linkedVideo.r2Key}` : null),
    thumbnailUrl: linkedVideo?.thumbnailUrl ?? null,
    storyboard,
    creationDateTime: asIso(project.createdAt),
    updateDateTime: asIso(project.updatedAt),
  };
}

studioRoutes.post("/upload", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);

  const file = form?.get("video") as File | null;
  const title = String(form?.get("title") ?? "My Video Resume");
  const maybeProjectId = String(form?.get("projectId") ?? "").trim();
  const maybeResumeId = String(form?.get("resumeId") ?? "").trim() || null;

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

  const projectResumeId = maybeResumeId ?? project.resumeId ?? null;

  const [video] = await db
    .insert(videos)
    .values({
      userId: user.sub,
      status: "Queued",
      r2Key,
      title,
      resumeId: projectResumeId,
    } as any)
    .returning();

  const [updatedProject] = await db
    .update(studioProjects)
    .set({ status: "video_uploaded", videoId: video.id, resumeId: projectResumeId, updatedAt: new Date() } as any)
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

  const publishResumeId = parsed.data.resumeId ?? project.resumeId ?? null;

  if (!linkedVideo) {
    const [createdVideo] = await db
      .insert(videos)
      .values({
        userId: user.sub,
        status: "Completed",
        title: parsed.data.title,
        description: parsed.data.description,
        privacyStatus: parsed.data.privacyStatus,
        resumeId: publishResumeId,
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
      resumeId: publishResumeId,
      updatedAt: new Date(),
    } as any)
    .where(eq(videos.id, linkedVideo.id))
    .returning();

  const [updatedProject] = await db
    .update(studioProjects)
    .set({
      status: "published",
      videoId: linkedVideo.id,
      resumeId: publishResumeId,
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
    videoUrl: linkedVideo?.youtubeUrl ?? (linkedVideo?.r2Key ? `https://cdn.hired.video/${linkedVideo.r2Key}` : null),
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

// ─── GET /videos/resume/:resumeId ─────────────────────────────────────────────
// Returns videos associated with a specific resume.
// Public videos: no auth required. Private/unlisted: only visible to owner.
studioRoutes.get("/videos/resume/:resumeId", async (c) => {
  const resumeId = c.req.param("resumeId");
  const user = c.var.user as { sub: string } | undefined;
  const db = getDb();

  const rows = await db
    .select()
    .from(videos)
    .where(eq(videos.resumeId, resumeId))
    .orderBy(desc(videos.createdAt));

  // Filter based on visibility
  const visible = rows.filter((v) => {
    if (v.privacyStatus === "public") return true;
    return user && v.userId === user.sub;
  });

  return c.json(ok(visible.map((v) => ({
    id: v.id,
    title: v.title,
    videoUrl: v.youtubeUrl ?? (v.r2Key ? `https://cdn.hired.video/${v.r2Key}` : null),
    youtubeUrl: v.youtubeUrl,
    youtubeVideoId: v.youtubeVideoId,
    thumbnailUrl: v.thumbnailUrl,
    privacyStatus: v.privacyStatus,
    status: v.status,
    createdAt: asIso(v.createdAt),
  }))));
});

// ─── GET /videos/public ───────────────────────────────────────────────────────
// Returns the 20 most-recent public videos for the homepage feed.
// No auth required.
studioRoutes.get("/videos/public", async (c) => {
  const db = getDb();

  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      r2Key: videos.r2Key,
      thumbnailUrl: videos.thumbnailUrl,
      description: videos.description,
      createdAt: videos.createdAt,
      ownerName: users.name,
      resumeId: videos.resumeId,
    })
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    .where(eq(videos.privacyStatus, "public"))
    .orderBy(desc(videos.createdAt))
    .limit(20);

  return c.json(ok(rows.map((v) => ({
    id: v.id,
    title: v.title || `${v.ownerName}'s Video Resume`,
    videoUrl: v.youtubeUrl ?? (v.r2Key ? `https://cdn.hired.video/${v.r2Key}` : null),
    youtubeUrl: v.youtubeUrl,
    youtubeVideoId: v.youtubeVideoId,
    thumbnailUrl: v.thumbnailUrl,
    description: v.description,
    ownerName: v.ownerName,
    resumeId: v.resumeId,
    createdAt: asIso(v.createdAt),
  }))));
});

// ─── GET /public/:videoId ──────────────────────────────────────────────────────
// Returns public metadata for a single video. No auth required.
studioRoutes.get("/public/:videoId", async (c) => {
  const { videoId } = c.req.param();
  const db = getDb();

  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      description: videos.description,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      r2Key: videos.r2Key,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
      createdAt: videos.createdAt,
      ownerName: users.name,
      ownerAvatar: userProfiles.avatarUrl,
      resumeId: videos.resumeId,
    })
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!rows.length) return c.json(fail("NOT_FOUND", "Video not found"), 404);
  const v = rows[0];

  // Only serve videos that are explicitly marked public
  if (v.privacyStatus !== "public") return c.json(fail("NOT_FOUND", "Video not found"), 404);

  return c.json(ok({
    id: v.id,
    title: v.title || `${v.ownerName}'s Video Resume`,
    description: v.description,
    videoUrl: v.youtubeUrl ?? (v.r2Key ? `https://cdn.hired.video/${v.r2Key}` : null),
    youtubeUrl: v.youtubeUrl,
    youtubeVideoId: v.youtubeVideoId,
    thumbnailUrl: v.thumbnailUrl,
    ownerName: v.ownerName,
    ownerAvatar: v.ownerAvatar,
    resumeId: v.resumeId,
    createdAt: asIso(v.createdAt),
  }));
});

// ─── POST /edit-script ────────────────────────────────────────────────────────
// AI surgical editing: takes an existing VideoScript + plain-English instruction
// and returns an updated VideoScript with minimal changes.

const EditScriptSchema = z.object({
  script:      VideoScriptSchema,
  instruction: z.string().min(2).max(500),
  model:       z.string().optional(),
});

studioRoutes.post("/edit-script", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = EditScriptSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("INVALID_REQUEST", "Invalid request", parsed.error.flatten()), 400);

  const { script, instruction, model } = parsed.data;
  const env = c.env as { OPENROUTER_API_KEY?: string };

  // Try LLM; fall back to returning unchanged script
  if (env.OPENROUTER_API_KEY) {
    try {
      const systemPrompt = `You are a video script editor. The user has provided a VideoScript JSON and an editing instruction.
Make ONLY the minimal changes needed to fulfil the instruction. Do NOT regenerate the whole script.
Return ONLY valid JSON matching the original VideoScript schema.`;

      const editRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://hired.video",
        },
        body: JSON.stringify({
          model: model ?? "google/gemini-flash-1.5",
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: `Instruction: ${instruction}\n\nCurrent script:\n${JSON.stringify(script)}` },
          ],
        }),
      });

      if (editRes.ok) {
        const json = await editRes.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw = json.choices?.[0]?.message?.content;
        if (raw) {
          const updated = VideoScriptSchema.safeParse(JSON.parse(raw));
          if (updated.success) return c.json(ok(updated.data));
        }
      }
    } catch {
      // fall through
    }
  }

  // Return unchanged script as fallback
  return c.json(ok(script));
});
