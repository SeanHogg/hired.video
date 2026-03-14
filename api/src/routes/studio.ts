import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { studioProjects, videos } = schema;

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

interface StoryboardScene {
  id: number;
  title: string;
  narration: string;
  visuals: string;
  duration: number;
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
  choices: Array<{ message: { content: string } }>;
}

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
    { "id": number, "title": "string", "narration": "string", "visuals": "string", "duration": number }
  ]
}`;

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Create a ${targetDuration}-second video resume storyboard for:\n\n${resumeText}`,
    },
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
    throw new Error(`OpenRouter API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned an empty response");
  return JSON.parse(content) as Storyboard;
}

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
  if (!response.ok) throw new Error(`Failed to refresh YouTube token: ${await response.text()}`);
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function uploadVideoToYouTube(
  videoBuffer: Buffer,
  metadata: { title: string; description: string; privacyStatus: string },
  accessToken: string,
): Promise<{ videoId: string; youtubeUrl: string }> {
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
        snippet: { title: metadata.title, description: metadata.description, categoryId: "22" },
        status: { privacyStatus: metadata.privacyStatus, selfDeclaredMadeForKids: false },
      }),
    },
  );

  if (!initResponse.ok) throw new Error(`Failed to initiate YouTube upload: ${await initResponse.text()}`);
  const uploadUrl = initResponse.headers.get("Location");
  if (!uploadUrl) throw new Error("YouTube did not return an upload URL");

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBuffer.byteLength) },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) throw new Error(`YouTube upload failed: ${await uploadResponse.text()}`);
  const result = (await uploadResponse.json()) as { id: string };
  return { videoId: result.id, youtubeUrl: `https://www.youtube.com/watch?v=${result.id}` };
}

export const studioRoutes = new Hono<{ Variables: Variables }>();

studioRoutes.post("/storyboard", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateStoryboardSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten() } }, 400);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return c.json({ error: { code: "CONFIGURATION_ERROR", message: "OpenRouter API key not configured" } }, 500);
  }

  const db = getDb();
  try {
    const storyboard = await generateStoryboardFromOpenRouter(
      parsed.data.resumeText,
      parsed.data.targetDuration,
      apiKey,
    );

    const [project] = await db
      .insert(studioProjects)
      .values({ userId: user.sub, resumeText: parsed.data.resumeText, storyboard, status: "storyboard_ready" })
      .returning();

    return c.json({ data: { project, storyboard } }, 201);
  } catch (err) {
    console.error("[studio/storyboard]", err);
    return c.json({ error: { code: "AI_ERROR", message: err instanceof Error ? err.message : "Failed to generate storyboard" } }, 502);
  }
});

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
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Missing or invalid headers", details: parsed.error.flatten() } }, 400);
  }

  const db = getDb();
  const [project] = await db
    .select({ id: studioProjects.id, userId: studioProjects.userId })
    .from(studioProjects)
    .where(eq(studioProjects.id, parsed.data.projectId))
    .limit(1);

  if (!project || project.userId !== user.sub) {
    return c.json({ error: { code: "NOT_FOUND", message: "Studio project not found" } }, 404);
  }

  const r2Key = `studio/${user.sub}/${parsed.data.projectId}/${parsed.data.filename}`;
  const body = await c.req.arrayBuffer();

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: r2Key,
      Body: Buffer.from(body),
      ContentType: parsed.data.contentType,
      Metadata: { userId: user.sub, projectId: parsed.data.projectId },
    }),
  );

  await db
    .update(studioProjects)
    .set({ status: "video_uploaded", updatedAt: new Date() })
    .where(eq(studioProjects.id, parsed.data.projectId));

  return c.json({ data: { r2Key } }, 201);
});

studioRoutes.post("/publish", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = PublishVideoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten() } }, 400);
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, parsed.data.projectId))
    .limit(1);

  if (!project || project.userId !== user.sub) {
    return c.json({ error: { code: "NOT_FOUND", message: "Studio project not found" } }, 404);
  }

  if (project.status !== "video_uploaded") {
    return c.json({ error: { code: "CONFLICT", message: `Project must be in 'video_uploaded' state (current: ${project.status})` } }, 409);
  }

  const s3 = getS3Client();
  const bucket = getBucket();
  const prefix = `studio/${user.sub}/${parsed.data.projectId}/`;

  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const firstObject = listed.Contents?.[0];
  if (!firstObject?.Key) {
    return c.json({ error: { code: "NOT_FOUND", message: "No uploaded video found for this project" } }, 404);
  }

  const s3Object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: firstObject.Key }));
  if (!s3Object.Body) {
    return c.json({ error: { code: "NOT_FOUND", message: "S3 object could not be retrieved" } }, 404);
  }

  await db
    .update(studioProjects)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(eq(studioProjects.id, parsed.data.projectId));

  try {
    const chunks: Uint8Array[] = [];
    for await (const chunk of s3Object.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const videoBuffer = Buffer.concat(chunks);

    const accessToken = await getYouTubeAccessToken(
      process.env.YOUTUBE_CLIENT_ID ?? "",
      process.env.YOUTUBE_CLIENT_SECRET ?? "",
      process.env.YOUTUBE_REFRESH_TOKEN ?? "",
    );

    const { videoId, youtubeUrl } = await uploadVideoToYouTube(
      videoBuffer,
      { title: parsed.data.title, description: parsed.data.description, privacyStatus: parsed.data.privacyStatus },
      accessToken,
    );

    const [video] = await db
      .insert(videos)
      .values({ userId: user.sub, status: "Completed", r2Key: firstObject.Key, youtubeVideoId: videoId, youtubeUrl, storyboard: project.storyboard })
      .returning();

    if (!video) throw new Error("Failed to create video record");

    await db
      .update(studioProjects)
      .set({ status: "published", videoId: video.id, updatedAt: new Date() })
      .where(eq(studioProjects.id, parsed.data.projectId));

    await s3
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: firstObject.Key }))
      .catch((err) => console.warn("[studio/publish] failed to delete S3 object", err));

    return c.json({ data: { videoId, youtubeUrl, video } });
  } catch (err) {
    console.error("[studio/publish]", err);
    await db
      .update(studioProjects)
      .set({ status: "publish_failed", retryCount: (project.retryCount ?? 0) + 1, updatedAt: new Date() })
      .where(eq(studioProjects.id, parsed.data.projectId));
    return c.json({ error: { code: "YOUTUBE_UPLOAD_ERROR", message: err instanceof Error ? err.message : "YouTube upload failed" } }, 502);
  }
});

studioRoutes.get("/status/:projectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();
  const [project] = await db.select().from(studioProjects).where(eq(studioProjects.id, projectId)).limit(1);
  if (!project || project.userId !== user.sub) {
    return c.json({ error: { code: "NOT_FOUND", message: "Studio project not found" } }, 404);
  }
  return c.json({ data: project });
});

studioRoutes.get("/projects", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const projects = await db.select().from(studioProjects).where(eq(studioProjects.userId, user.sub)).orderBy(studioProjects.createdAt);
  return c.json({ data: projects });
});
