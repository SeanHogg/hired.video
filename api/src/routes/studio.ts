import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../types";
import { success, error } from "../types";
import { getDb, schema } from "../db";

const { studioProjects, videos } = schema;

// ============================================================================
// TYPES
// ============================================================================

interface StoryboardScene {
  id: number;
  title: string;
  narration: string;
  visuals: string;
  duration: number; // seconds
}

interface Storyboard {
  title: string;
  totalDuration: number;
  scenes: StoryboardScene[];
}

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const GenerateStoryboardSchema = z.object({
  resumeText: z.string().min(50, "Resume text must be at least 50 characters"),
  targetDuration: z.number().min(30).max(600).default(120),
});

const UploadVideoSchema = z.object({
  projectId: z.string().uuid(),
  filename: z.string().min(1),
  contentType: z.string().regex(/^video\//),
});

const PublishVideoSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(""),
  privacyStatus: z.enum(["public", "private", "unlisted"]).default("unlisted"),
});

// ============================================================================
// HELPERS
// ============================================================================

async function generateStoryboardFromOpenRouter(
  resumeText: string,
  targetDuration: number,
  apiKey: string,
): Promise<Storyboard> {
  const systemPrompt = `You are a professional video resume producer. Given a resume, you create engaging video storyboards. 
Return ONLY valid JSON with this structure:
{
  "title": "string",
  "totalDuration": number,
  "scenes": [
    {
      "id": number,
      "title": "string",
      "narration": "string",
      "visuals": "string",
      "duration": number
    }
  ]
}`;

  const userPrompt = `Create a ${targetDuration}-second video resume storyboard for the following resume. 
Make it compelling, professional, and highlight key achievements.

RESUME:
${resumeText}`;

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://myvideoresu.me",
      "X-Title": "MyVideoResume",
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned an empty response");
  }

  return JSON.parse(content) as Storyboard;
}

/**
 * Exchange a YouTube OAuth2 refresh token for a fresh access token.
 */
async function getYouTubeAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to refresh YouTube token: ${body}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Upload a video file from R2 to YouTube using the resumable upload API.
 */
async function uploadVideoToYouTube(
  r2Object: R2ObjectBody,
  metadata: { title: string; description: string; privacyStatus: string },
  accessToken: string,
): Promise<{ videoId: string; youtubeUrl: string }> {
  // Step 1: Initiate the resumable upload session
  const initResponse = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: metadata.title,
          description: metadata.description,
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: metadata.privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );

  if (!initResponse.ok) {
    const body = await initResponse.text();
    throw new Error(`Failed to initiate YouTube upload: ${body}`);
  }

  const uploadUrl = initResponse.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("YouTube did not return an upload URL");
  }

  // Step 2: Stream the video body from R2 to YouTube
  const videoBody = await r2Object.arrayBuffer();

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoBody.byteLength),
    },
    body: videoBody,
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    throw new Error(`YouTube upload failed: ${body}`);
  }

  const result = (await uploadResponse.json()) as { id: string };
  const videoId = result.id;

  return {
    videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

// ============================================================================
// ROUTES
// ============================================================================

export const studioRoutes = new Hono<AppEnv>();

/** POST /api/studio/storyboard — generate AI storyboard from resume text */
studioRoutes.post("/storyboard", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateStoryboardSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  if (!c.env.OPENROUTER_API_KEY) {
    return c.json(error("CONFIGURATION_ERROR", "OpenRouter API key not configured"), 500);
  }

  const db = getDb(c.env.DATABASE_URL);

  try {
    const storyboard = await generateStoryboardFromOpenRouter(
      parsed.data.resumeText,
      parsed.data.targetDuration,
      c.env.OPENROUTER_API_KEY,
    );

    const [project] = await db
      .insert(studioProjects)
      .values({
        userId: user.sub,
        resumeText: parsed.data.resumeText,
        storyboard,
        status: "storyboard_ready",
      })
      .returning();

    return c.json(success({ project, storyboard }), 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate storyboard";
    console.error("[studio/storyboard]", err);
    return c.json(error("AI_ERROR", message), 502);
  }
});

/** POST /api/studio/upload — upload a recorded video blob to R2 */
studioRoutes.post("/upload", async (c) => {
  const user = c.var.user;

  const contentType = c.req.header("Content-Type") ?? "";
  const projectId = c.req.header("X-Project-Id");
  const filename = c.req.header("X-Filename") ?? `video-${Date.now()}.webm`;

  const parsed = UploadVideoSchema.safeParse({
    projectId,
    filename,
    contentType: contentType.split(";")[0]?.trim(),
  });

  if (!parsed.success) {
    return c.json(
      error("VALIDATION_ERROR", "Missing or invalid headers: X-Project-Id, X-Filename, Content-Type (video/*)", {
        issues: parsed.error.flatten(),
      }),
      400,
    );
  }

  const db = getDb(c.env.DATABASE_URL);
  const [project] = await db
    .select({ id: studioProjects.id, userId: studioProjects.userId })
    .from(studioProjects)
    .where(eq(studioProjects.id, parsed.data.projectId))
    .limit(1);

  if (!project || project.userId !== user.sub) {
    return c.json(error("NOT_FOUND", "Studio project not found"), 404);
  }

  const r2Key = `studio/${user.sub}/${parsed.data.projectId}/${parsed.data.filename}`;
  const body = await c.req.arrayBuffer();

  await c.env.VIDEO_BUCKET.put(r2Key, body, {
    httpMetadata: { contentType: parsed.data.contentType },
    customMetadata: { userId: user.sub, projectId: parsed.data.projectId },
  });

  await db
    .update(studioProjects)
    .set({ status: "video_uploaded", updatedAt: new Date() })
    .where(eq(studioProjects.id, parsed.data.projectId));

  return c.json(success({ r2Key }, "Video uploaded to temporary storage"), 201);
});

/** POST /api/studio/publish — upload from R2 to YouTube */
studioRoutes.post("/publish", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = PublishVideoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb(c.env.DATABASE_URL);

  const [project] = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, parsed.data.projectId))
    .limit(1);

  if (!project || project.userId !== user.sub) {
    return c.json(error("NOT_FOUND", "Studio project not found"), 404);
  }

  if (project.status !== "video_uploaded") {
    return c.json(
      error("CONFLICT", `Project must be in 'video_uploaded' state to publish (current: ${project.status})`),
      409,
    );
  }

  // Locate the R2 key for this project
  const listed = await c.env.VIDEO_BUCKET.list({ prefix: `studio/${user.sub}/${parsed.data.projectId}/` });
  const r2Object = listed.objects[0];

  if (!r2Object) {
    return c.json(error("NOT_FOUND", "No uploaded video found for this project"), 404);
  }

  const r2File = await c.env.VIDEO_BUCKET.get(r2Object.key);
  if (!r2File) {
    return c.json(error("NOT_FOUND", "R2 object could not be retrieved"), 404);
  }

  // Mark as publishing
  await db
    .update(studioProjects)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(eq(studioProjects.id, parsed.data.projectId));

  try {
    const accessToken = await getYouTubeAccessToken(
      c.env.YOUTUBE_CLIENT_ID,
      c.env.YOUTUBE_CLIENT_SECRET,
      c.env.YOUTUBE_REFRESH_TOKEN,
    );

    const { videoId, youtubeUrl } = await uploadVideoToYouTube(
      r2File,
      {
        title: parsed.data.title,
        description: parsed.data.description,
        privacyStatus: parsed.data.privacyStatus,
      },
      accessToken,
    );

    // Create video record and link to project
    const [video] = await db
      .insert(videos)
      .values({
        userId: user.sub,
        status: "Completed",
        r2Key: r2Object.key,
        youtubeVideoId: videoId,
        youtubeUrl,
        storyboard: project.storyboard,
      })
      .returning();

    if (!video) {
      throw new Error("Failed to create video record");
    }

    await db
      .update(studioProjects)
      .set({ status: "published", videoId: video.id, updatedAt: new Date() })
      .where(eq(studioProjects.id, parsed.data.projectId));

    // Clean up the R2 object after successful upload
    await c.env.VIDEO_BUCKET.delete(r2Object.key).catch((err) => {
      console.warn("[studio/publish] failed to delete R2 object after upload", err);
    });

    return c.json(success({ videoId, youtubeUrl, video }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube upload failed";
    console.error("[studio/publish]", err);

    await db
      .update(studioProjects)
      .set({
        status: "publish_failed",
        retryCount: (project.retryCount ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(studioProjects.id, parsed.data.projectId));

    return c.json(error("YOUTUBE_UPLOAD_ERROR", message), 502);
  }
});

/** GET /api/studio/status/:projectId — check a project's publish status */
studioRoutes.get("/status/:projectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb(c.env.DATABASE_URL);

  const [project] = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);

  if (!project || project.userId !== user.sub) {
    return c.json(error("NOT_FOUND", "Studio project not found"), 404);
  }

  return c.json(success(project));
});

/** GET /api/studio/projects — list all studio projects for the current user */
studioRoutes.get("/projects", async (c) => {
  const user = c.var.user;
  const db = getDb(c.env.DATABASE_URL);

  const projects = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.userId, user.sub))
    .orderBy(studioProjects.createdAt);

  return c.json(success(projects));
});
