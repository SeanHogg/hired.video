import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLMJson, getApiKey } from "../services/ai.js";

const { studioProjects, videos, users, userProfiles } = schema;

export const studioRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

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

function mapStudioStatus(raw: string): "Draft" | "Processing" | "Exported" | "Publishing" | "Completed" | "Published" | "Failed" {
  const v = raw.toLowerCase();
  if (v === "draft" || v === "pending") return "Draft";
  if (v === "exported") return "Exported";
  if (v === "publishing") return "Publishing";
  if (v === "published") return "Published";
  if (v === "completed") return "Completed";
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
  let name = "";
  let label = "";
  let summary = "";
  let achievements: string[] = [];
  let skills: string[] = [];
  let contact = "";
  try {
    const parsed = JSON.parse(resumeText);
    const basics = parsed?.Basics ?? parsed?.basics ?? {};
    name    = basics.Name    ?? basics.name    ?? "";
    label   = basics.Label   ?? basics.label   ?? "";
    summary = basics.Summary ?? basics.summary ?? "";
    contact = basics.Email   ?? basics.email   ?? basics.LinkedIn ?? basics.linkedin ?? "";
    // Extract achievements from work highlights
    const work: Array<{ Highlights?: string[]; highlights?: string[] }> = parsed?.Work ?? parsed?.work ?? [];
    for (const w of work.slice(0, 3)) {
      const hl = w.Highlights ?? w.highlights ?? [];
      achievements.push(...hl.slice(0, 2));
    }
    // Extract skills
    const skillsData: Array<{ Name?: string; name?: string }> = parsed?.Skills ?? parsed?.skills ?? [];
    skills = skillsData.map((s) => s.Name ?? s.name ?? "").filter(Boolean);
  } catch {
    name = resumeText.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  const introSubtitle = label || "Experienced Professional";
  const introText     = summary.slice(0, 200) || "Passionate professional ready to make an impact.";
  const resolvedItems = achievements.length >= 3 ? achievements.slice(0, 4) : ["Delivered measurable results with quantifiable impact", "Led initiatives that drove team efficiency and growth", "Consistently exceeded expectations across key projects"];
  const resolvedSkills = skills.length >= 3 ? skills.slice(0, 8) : ["Communication", "Problem Solving", "Leadership", "Execution", "Strategy"];
  const closingContact = contact || "Connect on LinkedIn";
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
      { id: "scene-0", start: 0,            duration: perScene, type: "intro",       title: name || "Professional Introduction", subtitle: introSubtitle, text: introText },
      { id: "scene-1", start: perScene,     duration: perScene, type: "achievement", title: "Key Achievements", items: resolvedItems },
      { id: "scene-2", start: perScene * 2, duration: perScene, type: "skills",      title: "Core Skills",     skills: resolvedSkills },
      { id: "scene-3", start: perScene * 3, duration: perScene, type: "closing",     title: "Let's Connect",   text: "Open to exciting new opportunities — let's talk.", subtitle: closingContact },
    ],
  };
}

function buildStudioSystemPrompt(targetDuration: number, motion: string, jobDescription?: string): string {
  const jobBlock = jobDescription
    ? `\n\nPersonalise the intro scene for this role. Filter achievements and skills to only those relevant.\nJob Description:\n${jobDescription.slice(0, 3000)}`
    : "";
  return `You are a professional video director and career storyteller. Produce a JSON VideoScript for a ${targetDuration}-second video resume that powerfully showcases this specific candidate.

RULES:
- Exactly 4 scenes in order: intro → achievement → skills → closing
- Scene durations must sum to exactly ${targetDuration}s. Divide sensibly (e.g. 7/7/7/7 for 28s)
- motion style: ${motion}
- Return ONLY valid JSON. No markdown fences, no explanation.

SCENE CONTENT — extract everything from the resume provided:
1. "intro" scene:
   - title: candidate's exact full name
   - subtitle: most recent job title and company (format "Role · Company")
   - text: a compelling 1–2 sentence elevator pitch derived from their summary and career arc. Make it specific to this person — never use generic phrases.

2. "achievement" scene:
   - title: "Key Achievements"
   - items: 3–4 real, measurable bullet points from their work history with specific numbers, outcomes, or business impact where available. NEVER use placeholder text like "Delivered impactful results".

3. "skills" scene:
   - title: "Core Skills"
   - skills: 5–8 specific skills taken directly from the resume (technologies, tools, domains). Use the exact names as listed.

4. "closing" scene:
   - title: a warm CTA reflecting the candidate's personality inferred from the resume (e.g. a maker → "Let's Build Something Great", a leader → "Ready to Drive Your Next Chapter")
   - text: a memorable 1-sentence personal brand statement capturing what makes this candidate unique
   - subtitle: their LinkedIn URL or email from the resume, or "Connect on LinkedIn" if not found

TypeScript interface:
interface VideoScript {
  video: { duration: number; fps: 30; resolution: "720p"; aspect: "16:9"; theme: { colorPalette: string[]; fontFamily: string; motion: string; transition: string; background: string } }
  scenes: Array<{ id: string; start: number; duration: number; type: "intro"|"achievement"|"skills"|"closing"; title?: string; subtitle?: string; text?: string; items?: string[]; skills?: string[] }>
}${jobBlock}`;
}

studioRoutes.post("/storyboard", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateStoryboardSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  let script: VideoScript;
  const apiKey = getApiKey(c.env);
  if (apiKey) {
    try {
      const { resumeText, prompt, jobDescription, model, temperature, targetDuration = 28, motion = "moderate" } = parsed.data;
      script = await callLLMJson(apiKey, {
        model: model ?? "google/gemini-flash-1.5",
        temperature: temperature ?? 0.7,
        systemPrompt: buildStudioSystemPrompt(targetDuration, motion, jobDescription),
        userMessage: `${prompt || "Create a professional video resume"}\n\nResume:\n${resumeText.slice(0, 6000)}`,
      }, VideoScriptSchema);
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
  // Use the _name stored inside the storyboard JSONB (set by save-draft) as the
  // display title so users see their chosen project name, not raw resume text.
  const meta = project.storyboard as Record<string, unknown> | null;
  const savedName = meta?._name as string | undefined;
  const savedPrompt = meta?._prompt as string | undefined;
  const savedJobDescription = meta?._jobDescription as string | undefined;
  // If the storyboard is a VideoScript (saved by save-draft), expose it as `script`
  const maybeScript = VideoScriptSchema.safeParse(project.storyboard);
  const script = maybeScript.success ? maybeScript.data : null;
  return {
    id: project.id,
    userId: project.userId,
    title: savedName || project.resumeText?.slice(0, 80) || "My Video Resume",
    status: mapStudioStatus(project.status),
    youtubeVideoId: linkedVideo?.youtubeVideoId ?? null,
    videoUrl: linkedVideo?.youtubeUrl ?? (linkedVideo?.r2Key ? `https://cdn.hired.video/${linkedVideo.r2Key}` : null),
    thumbnailUrl: linkedVideo?.thumbnailUrl ?? null,
    storyboard,
    script,
    prompt: savedPrompt ?? null,
    jobDescription: savedJobDescription ?? null,
    resumeText: project.resumeText ?? null,
    creationDateTime: asIso(project.createdAt),
    updateDateTime: asIso(project.updatedAt),
  };
}

// POST /api/studio/save-draft
// Save or update a project's name + script without requiring a video export.
studioRoutes.post("/save-draft", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    name:           z.string().min(1).max(200).default("My Video Resume"),
    resumeText:     z.string().default(""),
    script:         z.any().optional(),
    projectId:      z.string().uuid().optional(),
    prompt:         z.string().max(2000).optional(),
    jobDescription: z.string().max(4000).optional(),
  }).safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const { name, resumeText, script, projectId, prompt, jobDescription } = parsed.data;
  // Embed metadata inside the storyboard JSONB so toProjectDto can surface it
  const storyboardValue = script
    ? { ...script, _name: name, _prompt: prompt, _jobDescription: jobDescription }
    : { _name: name, _prompt: prompt, _jobDescription: jobDescription };
  const db = getDb();

  if (projectId) {
    const [updated] = await db
      .update(studioProjects)
      .set({ storyboard: storyboardValue as any, resumeText: resumeText || name } as any)
      .where(and(eq(studioProjects.id, projectId), eq(studioProjects.userId, user.sub)))
      .returning();
    if (!updated) return c.json(fail("NOT_FOUND", "Project not found"), 404);
    return c.json(ok(toProjectDto(updated)));
  }

  const [created] = await db
    .insert(studioProjects)
    .values({ userId: user.sub, resumeText: resumeText || name, storyboard: storyboardValue as any, status: "draft" } as any)
    .returning();

  return c.json(ok(toProjectDto(created)), 201);
});

// POST /api/studio/generate-image — generate AI image for a scene background
studioRoutes.post("/generate-image", async (c) => {
  const body = await c.req.json().catch(() => null);
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return c.json(fail("VALIDATION_ERROR", "prompt is required"), 400);
  }

  const ai = (c.env as any).AI;
  if (!ai) {
    return c.json(fail("AI_UNAVAILABLE", "AI image generation is not configured"), 503);
  }

  try {
    const response = await ai.run("@cf/bytedance/stable-diffusion-xl-lightning", {
      prompt: prompt.trim().slice(0, 500),
      num_steps: 4,
    });

    // Response is a ReadableStream of PNG bytes
    const buffer = await new Response(response as ReadableStream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const imageUrl = `data:image/png;base64,${base64}`;

    return c.json(ok({ imageUrl }));
  } catch (err) {
    console.error("[studio/generate-image] AI error:", err);
    return c.json(fail("GENERATION_FAILED", "Image generation failed"), 500);
  }
});

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

// ─── DELETE /projects/:projectId ──────────────────────────────────────────────
studioRoutes.delete("/projects/:projectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const [deleted] = await db
    .delete(studioProjects)
    .where(and(eq(studioProjects.id, projectId), eq(studioProjects.userId, user.sub)))
    .returning();

  if (!deleted) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  return c.json(ok({ id: projectId }));
});

// ─── PATCH /projects/:projectId/status ────────────────────────────────────────
studioRoutes.patch("/projects/:projectId/status", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    status: z.enum(["draft", "exported", "published", "processing", "failed"]),
  }).safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid status", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [updated] = await db
    .update(studioProjects)
    .set({ status: parsed.data.status } as any)
    .where(and(eq(studioProjects.id, projectId), eq(studioProjects.userId, user.sub)))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  return c.json(ok(toProjectDto(updated)));
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
