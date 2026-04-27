/**
 * Studio Features Routes — gap-closing endpoints for the AI video studio.
 *
 * Mounts at /api/studio and extends the existing studioRoutes with:
 *   - Auto-captions (from in-browser TTS timestamps or Whisper)
 *   - LinkedIn publishing
 *   - Webcam recording upload + transcription
 *   - AI delivery coaching
 *   - ATS-compatible output package
 *   - Interview question library + practice sessions
 *   - Skills demonstration videos
 *   - Async employer video interviews
 *   - Advanced per-second analytics (heatmap)
 *
 * Voiceover and voice cloning are now 100% client-side via WebGPU
 * (Kokoro / Piper / VibeVoice) and live in the frontend — see
 * frontend/lib/services/tts-engines.ts.
 */

import { Hono } from "hono";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLM, callLLMJson, callLLMJsonWithUsage, getApiKey } from "../services/adapters/ai.js";
import { aiCall } from "../services/adapters/ai-call.js";
import { requirePro, requireVideoAnalytics } from "../middleware/tierEnforcement.js";
import { transcribeAudio, analyzeDelivery, generateSuggestions } from "../services/adapters/transcription.js";
import {
  searchStockMedia,
  fetchAssetForHashing,
  mediaTypeFromMime,
  type StockMediaType,
} from "../services/media/stockmedia.js";
import { cdnUrl } from "../utils/cdn.js";

const {
  studioVoiceClones, studioVoiceCloneLicenses, studioCaptions,
  linkedinAccounts, youtubeAccounts, studioRecordings, studioDeliveryCoaching,
  studioAtsPackages, studioInterviewQuestions, studioInterviewSessions,
  studioSkillsDemos, studioAsyncInterviews, studioAsyncResponses,
  studioVideoHeatmap, stockMediaAssets, userStockMediaUsage,
  studioProjectVersions, studioChapters,
  studioVideoForms, studioVideoFormSubmissions,
  studioReviewComments, studioReviewLinks,
  studioThumbnails, marketingLeads,
} = schema;

export const studioFeaturesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

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

function getR2Bucket(): R2Bucket | undefined {
  return (globalThis as any).__ENV?.VIDEO_BUCKET;
}

/** SRT timestamp formatting (HH:MM:SS,ms). */
export function fmtSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** WebVTT timestamp formatting (HH:MM:SS.ms). */
export function fmtVttTime(seconds: number): string {
  return fmtSrtTime(seconds).replace(",", ".");
}

/** Render an array of caption cues as SRT. */
export function buildSrt(cues: Array<{ start: number; end: number; text: string }>): string {
  return cues
    .map((cue, idx) => `${idx + 1}\n${fmtSrtTime(cue.start)} --> ${fmtSrtTime(cue.end)}\n${cue.text}\n`)
    .join("\n");
}

/** Render an array of caption cues as WebVTT. */
export function buildVtt(cues: Array<{ start: number; end: number; text: string }>): string {
  const lines = ["WEBVTT", ""];
  for (const cue of cues) {
    lines.push(`${fmtVttTime(cue.start)} --> ${fmtVttTime(cue.end)}`);
    lines.push(cue.text);
    lines.push("");
  }
  return lines.join("\n");
}

async function uploadToStorage(key: string, body: ArrayBuffer, contentType: string, metadata?: Record<string, string>): Promise<boolean> {
  const r2 = getR2Bucket();
  if (r2) {
    await r2.put(key, body, { httpMetadata: { contentType }, customMetadata: metadata });
    return true;
  }
  if (canUseObjectStorage()) {
    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: Buffer.from(body), ContentType: contentType, Metadata: metadata }));
    return true;
  }
  console.warn("[studio-features] No storage available for key:", key);
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  1. AUTO-CAPTIONS
// ═══════════════════════════════════════════════════════════════════════════════
//
// (Voiceover used to live here as section 1 — it now runs entirely client-side
// via WebGPU TTS engines. See frontend/lib/services/tts-engines.ts.)
//
// ═══════════════════════════════════════════════════════════════════════════════
// ██  2. AUTO-CAPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/captions/generate — generate captions from TTS timestamps or Whisper
studioFeaturesRoutes.post("/captions/generate", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    projectId: z.string().uuid(),
    wordTimestamps: z.array(z.object({
      word: z.string(),
      start: z.number(),
      end: z.number(),
    })).optional(),
    style: z.enum(["standard", "bold-pop", "word-by-word", "lower-thirds"]).default("standard"),
    language: z.string().default("en"),
    wordsPerCue: z.number().min(3).max(15).default(8),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body"), 400);

  const timestamps = parsed.data.wordTimestamps ?? [];
  if (timestamps.length === 0) {
    return c.json(fail("NO_TIMESTAMPS", "No word timestamps provided. Generate TTS first or upload a recording."), 400);
  }

  // Build caption cues
  const wordsPerCue = parsed.data.wordsPerCue;
  const cues: Array<{ start: number; end: number; text: string; words: Array<{ word: string; start: number; end: number }> }> = [];
  for (let i = 0; i < timestamps.length; i += wordsPerCue) {
    const chunk = timestamps.slice(i, i + wordsPerCue);
    cues.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((w) => w.word).join(" "),
      words: chunk,
    });
  }

  const srtContent = buildSrt(cues);
  const vttContent = buildVtt(cues);

  const db = getDb();
  const [caption] = await db.insert(studioCaptions).values({
    userId: user.sub,
    projectId: parsed.data.projectId,
    language: parsed.data.language,
    style: parsed.data.style,
    cues,
    srtContent,
    vttContent,
  } as any).returning();

  return c.json(ok({
    id: caption.id,
    cues,
    srtContent,
    vttContent,
    style: parsed.data.style,
  }), 201);
});

// GET /api/studio/captions/:projectId — get captions for a project
studioFeaturesRoutes.get("/captions/:projectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const captions = await db.select().from(studioCaptions)
    .where(and(eq(studioCaptions.projectId, projectId), eq(studioCaptions.userId, user.sub)))
    .orderBy(desc(studioCaptions.createdAt))
    .limit(1);

  if (!captions.length) return c.json(ok(null));
  return c.json(ok(captions[0]));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  3. LINKEDIN PUBLISHING
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/linkedin/auth-url — get LinkedIn OAuth URL
studioFeaturesRoutes.get("/linkedin/auth-url", async (c) => {
  const clientId = c.env.LINKEDIN_CLIENT_ID;
  if (!clientId) return c.json(fail("LINKEDIN_UNAVAILABLE", "LinkedIn integration not configured"), 503);

  const redirectUri = `${c.env.FRONTEND_URL}/studio/linkedin/callback`;
  const state = crypto.randomUUID();
  const scopes = "openid profile email w_member_social";

  const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopes)}`;

  return c.json(ok({ url, state }));
});

// POST /api/studio/linkedin/callback — exchange OAuth code for tokens
studioFeaturesRoutes.post("/linkedin/callback", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ code: z.string(), redirectUri: z.string() }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const clientId = c.env.LINKEDIN_CLIENT_ID;
  const clientSecret = c.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) return c.json(fail("LINKEDIN_UNAVAILABLE", "LinkedIn not configured"), 503);

  // Exchange code for token
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: parsed.data.code,
      redirect_uri: parsed.data.redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return c.json(fail("LINKEDIN_TOKEN_ERROR", `Token exchange failed: ${err}`), 400);
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
  };

  // Get LinkedIn profile info
  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = profileRes.ok
    ? await profileRes.json() as { sub: string; name: string; email: string }
    : { sub: "unknown", name: "LinkedIn User", email: "" };

  const db = getDb();

  // Upsert LinkedIn account
  const existing = await db.select().from(linkedinAccounts)
    .where(and(eq(linkedinAccounts.userId, user.sub), eq(linkedinAccounts.linkedinId, profile.sub)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(linkedinAccounts).set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? existing[0].refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      scopes: tokenData.scope,
      displayName: profile.name,
      isActive: true,
      updatedAt: new Date(),
    } as any).where(eq(linkedinAccounts.id, existing[0].id));
  } else {
    await db.insert(linkedinAccounts).values({
      userId: user.sub,
      linkedinId: profile.sub,
      displayName: profile.name,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      scopes: tokenData.scope,
      isActive: true,
    } as any);
  }

  return c.json(ok({ linkedinId: profile.sub, displayName: profile.name }));
});

// GET /api/studio/linkedin/accounts — list connected LinkedIn accounts
studioFeaturesRoutes.get("/linkedin/accounts", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const accounts = await db.select({
    id: linkedinAccounts.id,
    linkedinId: linkedinAccounts.linkedinId,
    displayName: linkedinAccounts.displayName,
    profileUrl: linkedinAccounts.profileUrl,
    isActive: linkedinAccounts.isActive,
  }).from(linkedinAccounts)
    .where(eq(linkedinAccounts.userId, user.sub));

  return c.json(ok(accounts));
});

// POST /api/studio/linkedin/publish — publish a video to LinkedIn
studioFeaturesRoutes.post("/linkedin/publish", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    linkedinAccountId: z.string().uuid(),
    projectId: z.string().uuid(),
    text: z.string().min(1).max(3000),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [account] = await db.select().from(linkedinAccounts)
    .where(and(eq(linkedinAccounts.id, parsed.data.linkedinAccountId), eq(linkedinAccounts.userId, user.sub)))
    .limit(1);

  if (!account) return c.json(fail("NOT_FOUND", "LinkedIn account not found"), 404);

  // Register video upload with LinkedIn
  const registerRes = await fetch("https://api.linkedin.com/v2/videos?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:person:${account.linkedinId}`,
        fileSizeBytes: 50_000_000,  // estimate
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });

  if (!registerRes.ok) {
    const err = await registerRes.text();
    return c.json(fail("LINKEDIN_UPLOAD_ERROR", `Upload registration failed: ${err}`), 500);
  }

  const uploadData = await registerRes.json() as {
    value: {
      uploadInstructions: Array<{ uploadUrl: string }>;
      video: string;
    };
  };

  return c.json(ok({
    uploadUrl: uploadData.value.uploadInstructions[0]?.uploadUrl,
    videoUrn: uploadData.value.video,
    linkedinId: account.linkedinId,
    accessToken: account.accessToken,  // Frontend needs this to upload the binary
  }));
});

// POST /api/studio/linkedin/post — create the LinkedIn post after video upload
studioFeaturesRoutes.post("/linkedin/post", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    linkedinAccountId: z.string().uuid(),
    videoUrn: z.string(),
    text: z.string().min(1).max(3000),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [account] = await db.select().from(linkedinAccounts)
    .where(and(eq(linkedinAccounts.id, parsed.data.linkedinAccountId), eq(linkedinAccounts.userId, user.sub)))
    .limit(1);

  if (!account) return c.json(fail("NOT_FOUND", "LinkedIn account not found"), 404);

  const postRes = await fetch("https://api.linkedin.com/v2/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      author: `urn:li:person:${account.linkedinId}`,
      commentary: parsed.data.text,
      visibility: parsed.data.visibility,
      distribution: { feedDistribution: "MAIN_FEED" },
      content: {
        media: { id: parsed.data.videoUrn },
      },
      lifecycleState: "PUBLISHED",
    }),
  });

  if (!postRes.ok) {
    const err = await postRes.text();
    return c.json(fail("LINKEDIN_POST_ERROR", `Post creation failed: ${err}`), 500);
  }

  const postId = postRes.headers.get("x-restli-id") ?? "unknown";
  return c.json(ok({ postId, message: "Video published to LinkedIn" }));
});

// POST /api/studio/linkedin/generate-post — AI hook + caption + hashtags from
// the project's storyboard. Pro-gated; charges the user's token budget via
// aiCall. Returns a static heuristic if no LLM key is configured. Closes
// roadmap entry #203 ("AI LinkedIn post generation").
const LinkedInGenerateSchema = z.object({
  projectId: z.string().uuid(),
  tone: z.enum(["professional", "casual", "bold", "story"]).default("professional"),
});

const LinkedInPostSchema = z.object({
  hook: z.string().min(1).max(280),
  caption: z.string().min(1).max(2000),
  hashtags: z.array(z.string().regex(/^[A-Za-z0-9_]+$/)).min(3).max(10),
});

/**
 * Pure helpers for #203 (AI LinkedIn post generation), exported for tests.
 *
 * `flattenStoryboardTranscript` collapses the storyboard JSON blob into a
 * one-line-per-scene transcript so the LLM has narrative context without
 * the structural noise. `buildLinkedInHeuristicPost` is the no-LLM fallback
 * — runs when no API key is configured or the LLM call throws.
 */
export function flattenStoryboardTranscript(
  storyboard: unknown,
): string {
  const scenes = Array.isArray((storyboard as any)?.scenes)
    ? (storyboard as any).scenes as Array<Record<string, unknown>>
    : [];
  return scenes
    .map((s) => [s.title, s.subtitle, s.text].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n");
}

export function buildLinkedInHeuristicPost(
  transcript: string,
  resumeText: string,
): { hook: string; caption: string; hashtags: string[] } {
  // Truthiness check — `?? resumeText` would not fire for an empty
  // first-line string, leaving us with an empty hook. Cascade to resume,
  // then to the generic fallback.
  const fromTranscript = transcript.split("\n")[0]?.trim() ?? "";
  const fromResume = resumeText.trim();
  const hook =
    (fromTranscript || fromResume).slice(0, 200) ||
    "Just published a new video resume on hired.video.";
  return {
    hook,
    caption: "Watch the full story below — feedback always welcome.",
    hashtags: ["hiring", "career", "videoresume", "linkedin", "openforwork"],
  };
}

studioFeaturesRoutes.post("/linkedin/generate-post", requirePro("LinkedIn AI Post"), async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = LinkedInGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(schema.studioProjects)
    .where(and(
      eq(schema.studioProjects.id, parsed.data.projectId),
      eq(schema.studioProjects.userId, user.sub),
    ))
    .limit(1);
  if (!project) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  const transcript = flattenStoryboardTranscript(project.storyboard);

  const apiKey = getApiKey(c.env);
  if (!apiKey) return c.json(ok(buildLinkedInHeuristicPost(transcript, project.resumeText)));

  const systemPrompt = `You write LinkedIn posts that promote a video. Output strictly the JSON shape requested. Keep the hook under 280 characters and front-load the most arresting line. The caption is 2-4 short paragraphs separated by blank lines. Hashtags are bare words (no # prefix) — pick 5-7 that match the topic and the requested tone. Never invent facts not present in the transcript.`;
  const userMessage = `Tone: ${parsed.data.tone}\n\nVideo transcript (one line per scene):\n${transcript || project.resumeText.slice(0, 2000)}\n\nReturn JSON: { "hook": string, "caption": string, "hashtags": string[] }`;

  try {
    const result = await aiCall(c, "linkedin_post_gen", () =>
      callLLMJsonWithUsage(apiKey, {
        systemPrompt,
        userMessage,
        temperature: 0.7,
      }, LinkedInPostSchema),
    );
    if (result instanceof Response) return result;
    return c.json(ok(result.data));
  } catch (err) {
    console.error("[linkedin/generate-post] LLM error, falling back:", err);
    return c.json(ok(buildLinkedInHeuristicPost(transcript, project.resumeText)));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  4. WEBCAM RECORDING + TRANSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/recording/upload — upload a webcam/screen recording
studioFeaturesRoutes.post("/recording/upload", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json(fail("VALIDATION_ERROR", "Invalid form data"), 400);

  const file = form.get("video") as File | null;
  const type = String(form.get("type") ?? "webcam");
  const projectId = String(form.get("projectId") ?? "").trim() || null;
  const durationMs = Number(form.get("durationMs") ?? 0);

  if (!file) return c.json(fail("VALIDATION_ERROR", "Missing video file"), 400);

  const db = getDb();
  let videoUrl: string | null = null;
  let videoKey: string | null = null;

  {
    const bytes = await file.arrayBuffer();
    videoKey = `studio/recordings/${user.sub}/${Date.now()}-${file.name || "recording.webm"}`;
    if (await uploadToStorage(videoKey, bytes, file.type || "video/webm")) {
      videoUrl = cdnUrl(videoKey);
    }
  }

  const [recording] = await db.insert(studioRecordings).values({
    userId: user.sub,
    projectId,
    type,
    videoUrl,
    videoKey,
    durationMs,
    metadata: { contentType: file.type, size: file.size },
  } as any).returning();

  return c.json(ok({
    id: recording.id,
    videoUrl,
    type,
    durationMs,
  }), 201);
});

// POST /api/studio/recording/:id/transcribe — transcribe a recording using Whisper
studioFeaturesRoutes.post("/recording/:id/transcribe", async (c) => {
  const user = c.var.user;
  const recordingId = c.req.param("id");
  const openaiKey = c.env.OPENAI_API_KEY;
  if (!openaiKey) return c.json(fail("TRANSCRIPTION_UNAVAILABLE", "OpenAI API key not configured"), 503);

  const db = getDb();
  const [recording] = await db.select().from(studioRecordings)
    .where(and(eq(studioRecordings.id, recordingId), eq(studioRecordings.userId, user.sub)))
    .limit(1);

  if (!recording) return c.json(fail("NOT_FOUND", "Recording not found"), 404);

  // For now, we expect the frontend to send the audio directly
  const form = await c.req.formData().catch(() => null);
  const audioFile = form?.get("audio") as File | null;
  if (!audioFile) return c.json(fail("VALIDATION_ERROR", "Missing audio file"), 400);

  try {
    const audioBuffer = await audioFile.arrayBuffer();
    const result = await transcribeAudio(openaiKey, audioBuffer, audioFile.name || "audio.webm");

    await db.update(studioRecordings).set({
      transcription: result.text,
      wordTimestamps: result.words,
    } as any).where(eq(studioRecordings.id, recordingId));

    return c.json(ok({
      text: result.text,
      language: result.language,
      durationSec: result.durationSec,
      words: result.words,
    }));
  } catch (err) {
    console.error("[recording/transcribe] error:", err);
    return c.json(fail("TRANSCRIPTION_FAILED", `Transcription failed: ${err}`), 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  5. AI DELIVERY COACHING
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/coaching/analyze — analyze a recording for delivery quality
studioFeaturesRoutes.post("/coaching/analyze", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    recordingId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
    words: z.array(z.object({
      word: z.string(),
      start: z.number(),
      end: z.number(),
    })),
    totalDurationSec: z.number(),
    // Optional: AI analysis of message clarity
    scriptText: z.string().optional(),
    transcribedText: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const metrics = analyzeDelivery(parsed.data.words, parsed.data.totalDurationSec);
  const suggestions = generateSuggestions(metrics);

  // AI clarity analysis if both script and transcription are provided
  let clarityScore = 70; // default
  const apiKey = getApiKey(c.env);
  if (apiKey && parsed.data.scriptText && parsed.data.transcribedText) {
    try {
      const clarityPrompt = `Compare the intended script with the actual transcription. Score how well the speaker communicated the intended message on a scale of 0-100.

Intended script:
${parsed.data.scriptText.slice(0, 2000)}

Actual transcription:
${parsed.data.transcribedText.slice(0, 2000)}

Return ONLY a JSON object: {"score": <number>, "feedback": "<one sentence>"}`;

      const raw = await callLLM(apiKey, {
        systemPrompt: "You are a speech coach. Evaluate message clarity. Return JSON only.",
        userMessage: clarityPrompt,
      });
      const clarityResult = JSON.parse(raw.replace(/```json?\s*/g, "").replace(/```/g, ""));
      clarityScore = Math.min(100, Math.max(0, clarityResult.score ?? 70));
      if (clarityResult.feedback) {
        suggestions.push({ type: "clarity", message: clarityResult.feedback });
      }
    } catch {
      // Fall back to default
    }
  }

  // Overall score: weighted average
  const overallScore = Math.round(
    metrics.pacingScore * 0.25 +
    metrics.fillerScore * 0.25 +
    metrics.energyScore * 0.25 +
    clarityScore * 0.25,
  );

  const db = getDb();
  const [coaching] = await db.insert(studioDeliveryCoaching).values({
    userId: user.sub,
    recordingId: parsed.data.recordingId,
    projectId: parsed.data.projectId ?? null,
    overallScore,
    pacingWpm: metrics.wpm,
    pacingScore: metrics.pacingScore,
    fillerWords: metrics.fillerWords,
    fillerScore: metrics.fillerScore,
    eyeContactPct: null,         // requires face-tracking (frontend-side)
    eyeContactScore: null,
    energyScore: metrics.energyScore,
    clarityScore,
    suggestions,
  } as any).returning();

  return c.json(ok({
    id: coaching.id,
    overallScore,
    pacingWpm: metrics.wpm,
    pacingScore: metrics.pacingScore,
    fillerWords: metrics.fillerWords,
    fillerScore: metrics.fillerScore,
    energyScore: metrics.energyScore,
    clarityScore,
    suggestions,
  }), 201);
});

// GET /api/studio/coaching/:recordingId — get coaching results for a recording
studioFeaturesRoutes.get("/coaching/:recordingId", async (c) => {
  const user = c.var.user;
  const recordingId = c.req.param("recordingId");
  const db = getDb();

  const results = await db.select().from(studioDeliveryCoaching)
    .where(and(eq(studioDeliveryCoaching.recordingId, recordingId), eq(studioDeliveryCoaching.userId, user.sub)))
    .orderBy(desc(studioDeliveryCoaching.createdAt))
    .limit(1);

  if (!results.length) return c.json(ok(null));
  return c.json(ok(results[0]));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  6. ATS-COMPATIBLE OUTPUT PACKAGE
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/ats/generate — generate an ATS-compatible package
studioFeaturesRoutes.post("/ats/generate", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    projectId: z.string().uuid(),
    candidateName: z.string().min(1).max(200),
    headline: z.string().max(200).optional(),
    linkedinUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    scriptText: z.string().min(10),  // full script text to generate summary
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  // Generate ATS-parseable text summary using AI
  let textSummary = parsed.data.scriptText.slice(0, 1000);
  let emailTemplate = "";
  const apiKey = getApiKey(c.env);

  if (apiKey) {
    try {
      const raw = await callLLM(apiKey, {
        systemPrompt: `You are a career advisor. Generate two things as a JSON object:
1. "summary" — a 2-3 paragraph professional text summary (suitable for ATS parsing) based on the video script
2. "email" — a brief professional email template a candidate can use to send this video resume to a recruiter

Return ONLY valid JSON: {"summary": "...", "email": "..."}`,
        userMessage: `Candidate name: ${parsed.data.candidateName}
Headline: ${parsed.data.headline ?? "Professional"}
Video script:
${parsed.data.scriptText.slice(0, 3000)}`,
      });
      const result = JSON.parse(raw.replace(/```json?\s*/g, "").replace(/```/g, ""));
      textSummary = result.summary ?? textSummary;
      emailTemplate = result.email ?? "";
    } catch {
      // Use raw script as fallback
    }
  }

  // Generate unique slug
  const slug = `${parsed.data.candidateName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;

  const db = getDb();
  const [atsPackage] = await db.insert(studioAtsPackages).values({
    userId: user.sub,
    projectId: parsed.data.projectId,
    slug,
    videoUrl: parsed.data.videoUrl ?? null,
    thumbnailUrl: parsed.data.thumbnailUrl ?? null,
    candidateName: parsed.data.candidateName,
    headline: parsed.data.headline ?? null,
    textSummary,
    emailTemplate,
    linkedinUrl: parsed.data.linkedinUrl ?? null,
  } as any).returning();

  const pageUrl = `https://hired.video/v/${slug}`;

  return c.json(ok({
    id: atsPackage.id,
    slug,
    pageUrl,
    textSummary,
    emailTemplate,
  }), 201);
});

// GET /api/studio/ats/:slug — public landing page data (no auth)
studioFeaturesRoutes.get("/ats/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const [pkg] = await db.select().from(studioAtsPackages)
    .where(and(eq(studioAtsPackages.slug, slug), eq(studioAtsPackages.isActive, true)))
    .limit(1);

  if (!pkg) return c.json(fail("NOT_FOUND", "Package not found"), 404);

  // Increment view count
  await db.update(studioAtsPackages)
    .set({ viewCount: sql`${studioAtsPackages.viewCount} + 1` } as any)
    .where(eq(studioAtsPackages.id, pkg.id));

  return c.json(ok({
    candidateName: pkg.candidateName,
    headline: pkg.headline,
    videoUrl: pkg.videoUrl,
    thumbnailUrl: pkg.thumbnailUrl,
    textSummary: pkg.textSummary,
    linkedinUrl: pkg.linkedinUrl,
    viewCount: (pkg.viewCount ?? 0) + 1,
  }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  7. INTERVIEW QUESTION LIBRARY + PRACTICE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/interview/questions — browse question library
studioFeaturesRoutes.get("/interview/questions", async (c) => {
  const category = c.req.query("category");
  const difficulty = c.req.query("difficulty");
  const industry = c.req.query("industry");

  const db = getDb();
  let query = db.select().from(studioInterviewQuestions).$dynamic();

  const conditions = [];
  if (category) conditions.push(eq(studioInterviewQuestions.category, category));
  if (difficulty) conditions.push(eq(studioInterviewQuestions.difficulty, difficulty));
  if (industry) conditions.push(eq(studioInterviewQuestions.industry, industry));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const questions = await query.limit(50);
  return c.json(ok(questions));
});

// POST /api/studio/interview/questions/seed — seed default questions
studioFeaturesRoutes.post("/interview/questions/seed", async (c) => {
  const db = getDb();

  const defaultQuestions = [
    // Behavioral
    { category: "behavioral", difficulty: "medium", question: "Tell me about a time you had to deal with a difficult team member.", framework: "STAR", tips: ["Be specific about the situation", "Focus on your actions, not blame", "Show resolution and learning"], industry: "general" },
    { category: "behavioral", difficulty: "medium", question: "Describe a situation where you had to meet a tight deadline.", framework: "STAR", tips: ["Quantify the deadline pressure", "Show prioritization skills", "Highlight the outcome"], industry: "general" },
    { category: "behavioral", difficulty: "hard", question: "Tell me about your biggest professional failure and what you learned.", framework: "STAR", tips: ["Choose a genuine failure, not a humble-brag", "Focus 70% on the learning", "Show how you've applied the lesson since"], industry: "general" },
    { category: "behavioral", difficulty: "easy", question: "Why are you interested in this role?", framework: null, tips: ["Research the company thoroughly", "Connect your skills to their needs", "Show genuine enthusiasm"], industry: "general" },
    { category: "behavioral", difficulty: "medium", question: "Describe a time you went above and beyond for a project.", framework: "STAR", tips: ["Be specific about what 'above and beyond' meant", "Show the impact of your extra effort", "Connect it to your work ethic"], industry: "general" },
    { category: "behavioral", difficulty: "medium", question: "Tell me about a time you had to persuade someone to see things your way.", framework: "STAR", tips: ["Show empathy for the other perspective", "Describe your communication approach", "Focus on the collaborative outcome"], industry: "general" },
    { category: "behavioral", difficulty: "hard", question: "Describe a situation where you had to make a decision with incomplete information.", framework: "STAR", tips: ["Show your analytical framework", "Explain how you mitigated risk", "Share the outcome and what you'd do differently"], industry: "general" },
    // Technical
    { category: "technical", difficulty: "medium", question: "Walk me through a recent project you're proud of. What was the architecture?", framework: null, tips: ["Start with the problem being solved", "Explain your technical choices", "Discuss trade-offs you considered"], industry: "tech" },
    { category: "technical", difficulty: "hard", question: "How would you design a system to handle 10x your current traffic?", framework: null, tips: ["Think about horizontal scaling", "Discuss caching, CDNs, and database optimization", "Mention monitoring and fallback strategies"], industry: "tech" },
    { category: "technical", difficulty: "easy", question: "What programming languages and frameworks are you most comfortable with?", framework: null, tips: ["Rank by proficiency", "Give examples of what you've built with each", "Be honest about learning curves"], industry: "tech" },
    // Situational
    { category: "situational", difficulty: "medium", question: "Your manager assigns a project you disagree with. How do you handle it?", framework: null, tips: ["Show respect for authority while expressing your perspective", "Propose alternatives constructively", "Demonstrate adaptability"], industry: "general" },
    { category: "situational", difficulty: "hard", question: "You discover a colleague is taking credit for your work. What do you do?", framework: null, tips: ["Stay professional and calm", "Address it directly but diplomatically", "Document your contributions"], industry: "general" },
    { category: "situational", difficulty: "medium", question: "How would you onboard yourself into a new team within the first 90 days?", framework: null, tips: ["Show a structured approach", "Mention relationship building", "Balance learning with early contributions"], industry: "general" },
    // Company-specific
    { category: "company-specific", difficulty: "medium", question: "What do you know about our company's mission and how does it align with your values?", framework: null, tips: ["Do deep research beyond the About page", "Connect personally to their mission", "Be authentic"], industry: "general" },
    { category: "company-specific", difficulty: "medium", question: "Where do you see yourself contributing most in the first year?", framework: null, tips: ["Tie to the job description", "Show ambition tempered with realism", "Demonstrate understanding of their challenges"], industry: "general" },
  ];

  for (const q of defaultQuestions) {
    await db.insert(studioInterviewQuestions).values({
      ...q,
      isDefault: true,
    } as any).onConflictDoNothing();
  }

  return c.json(ok({ seeded: defaultQuestions.length }));
});

// POST /api/studio/interview/session — start a practice session
studioFeaturesRoutes.post("/interview/session", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    questionId: z.string().uuid(),
    resumeText: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  // Generate AI talking points from resume
  let talkingPoints: string[] = [];
  const apiKey = getApiKey(c.env);

  if (apiKey && parsed.data.resumeText) {
    const db = getDb();
    const [question] = await db.select().from(studioInterviewQuestions)
      .where(eq(studioInterviewQuestions.id, parsed.data.questionId)).limit(1);

    if (question) {
      try {
        const raw = await callLLM(apiKey, {
          systemPrompt: `You are an interview coach. Generate 3-5 bullet-point talking points that the candidate should mention when answering this question, based on their resume. Return JSON: {"points": ["...", "..."]}`,
          userMessage: `Question: ${question.question}\n\nResume:\n${parsed.data.resumeText.slice(0, 3000)}`,
        });
        const result = JSON.parse(raw.replace(/```json?\s*/g, "").replace(/```/g, ""));
        talkingPoints = result.points ?? [];
      } catch { /* fallback to empty */ }
    }
  }

  const db = getDb();
  const [session] = await db.insert(studioInterviewSessions).values({
    userId: user.sub,
    questionId: parsed.data.questionId,
    talkingPoints,
  } as any).returning();

  return c.json(ok({
    id: session.id,
    questionId: parsed.data.questionId,
    talkingPoints,
  }), 201);
});

// PATCH /api/studio/interview/session/:id — update session with recording + score
studioFeaturesRoutes.patch("/interview/session/:id", async (c) => {
  const user = c.var.user;
  const sessionId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    recordingId: z.string().uuid().optional(),
    coachingId: z.string().uuid().optional(),
    answer: z.string().optional(),
    isPublic: z.boolean().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [updated] = await db.update(studioInterviewSessions).set({
    ...parsed.data,
  } as any)
    .where(and(eq(studioInterviewSessions.id, sessionId), eq(studioInterviewSessions.userId, user.sub)))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Session not found"), 404);

  // If answer is provided, generate AI feedback
  if (parsed.data.answer && updated.questionId) {
    const apiKey = getApiKey(c.env);
    if (apiKey) {
      const [question] = await db.select().from(studioInterviewQuestions)
        .where(eq(studioInterviewQuestions.id, updated.questionId)).limit(1);

      if (question) {
        try {
          const raw = await callLLM(apiKey, {
            systemPrompt: `You are an interview coach. Score the candidate's answer to this interview question.
Return JSON: {"score": 0-100, "feedback": {"content": "...", "delivery": "...", "structure": "..."}}
Score 80+ is excellent, 60-79 is good, 40-59 needs work, below 40 is poor.`,
            userMessage: `Question: ${question.question}\n\nCandidate's answer:\n${parsed.data.answer.slice(0, 3000)}`,
          });
          const result = JSON.parse(raw.replace(/```json?\s*/g, "").replace(/```/g, ""));
          await db.update(studioInterviewSessions).set({
            aiScore: result.score,
            aiFeedback: result.feedback,
          } as any).where(eq(studioInterviewSessions.id, sessionId));
        } catch { /* ignore */ }
      }
    }
  }

  return c.json(ok(updated));
});

// GET /api/studio/interview/sessions — list user's practice sessions
studioFeaturesRoutes.get("/interview/sessions", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const sessions = await db.select().from(studioInterviewSessions)
    .where(eq(studioInterviewSessions.userId, user.sub))
    .orderBy(desc(studioInterviewSessions.createdAt))
    .limit(50);

  return c.json(ok(sessions));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  8. SKILLS DEMONSTRATION VIDEOS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/skills-demo — create a skills demo
studioFeaturesRoutes.post("/skills-demo", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    skillName: z.string().min(1).max(100),
    template: z.enum(["general", "code-walkthrough", "design-portfolio", "data-analysis"]).default("general"),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    projectUrl: z.string().optional(),
    recordingId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [demo] = await db.insert(studioSkillsDemos).values({
    userId: user.sub,
    skillName: parsed.data.skillName,
    template: parsed.data.template,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    projectUrl: parsed.data.projectUrl ?? null,
    recordingId: parsed.data.recordingId ?? null,
    projectId: parsed.data.projectId ?? null,
  } as any).returning();

  return c.json(ok(demo), 201);
});

// PATCH /api/studio/skills-demo/:id — update with video URL, thumbnail, publish
studioFeaturesRoutes.patch("/skills-demo/:id", async (c) => {
  const user = c.var.user;
  const demoId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    durationMs: z.number().optional(),
    isPublic: z.boolean().optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [updated] = await db.update(studioSkillsDemos).set({
    ...parsed.data,
    updatedAt: new Date(),
  } as any)
    .where(and(eq(studioSkillsDemos.id, demoId), eq(studioSkillsDemos.userId, user.sub)))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Demo not found"), 404);
  return c.json(ok(updated));
});

// GET /api/studio/skills-demos — list user's skills demos
studioFeaturesRoutes.get("/skills-demos", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const demos = await db.select().from(studioSkillsDemos)
    .where(eq(studioSkillsDemos.userId, user.sub))
    .orderBy(desc(studioSkillsDemos.updatedAt))
    .limit(50);

  return c.json(ok(demos));
});

// GET /api/studio/skills-demos/user/:userId — public skills demos for a user profile
studioFeaturesRoutes.get("/skills-demos/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const db = getDb();
  const demos = await db.select().from(studioSkillsDemos)
    .where(and(eq(studioSkillsDemos.userId, userId), eq(studioSkillsDemos.isPublic, true)))
    .orderBy(desc(studioSkillsDemos.updatedAt))
    .limit(20);

  return c.json(ok(demos));
});

// POST /api/studio/skills-demo/generate-script — AI-generate a walkthrough script
studioFeaturesRoutes.post("/skills-demo/generate-script", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    skillName: z.string(),
    template: z.enum(["general", "code-walkthrough", "design-portfolio", "data-analysis"]),
    projectUrl: z.string().optional(),
    projectDescription: z.string().optional(),
    resumeText: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const apiKey = getApiKey(c.env);
  if (!apiKey) return c.json(fail("AI_UNAVAILABLE", "AI not configured"), 503);

  const templatePrompts: Record<string, string> = {
    general: "a professional skills demonstration",
    "code-walkthrough": "a code walkthrough showing the architecture, key decisions, and technical highlights",
    "design-portfolio": "a design portfolio walkthrough covering the design process, decisions, and final outcomes",
    "data-analysis": "a data analysis presentation covering methodology, key findings, and business impact",
  };

  try {
    const raw = await callLLM(apiKey, {
      systemPrompt: `You are a professional video script writer for ${templatePrompts[parsed.data.template] ?? "a skills demo"}.
Generate a structured script the person can read while recording their screen + webcam.
Return JSON: {
  "title": "...",
  "sections": [
    {"heading": "...", "duration_sec": 15, "teleprompter_text": "What to say word-for-word", "screen_instruction": "What to show on screen"}
  ],
  "total_duration_sec": 60
}
Aim for 60-90 seconds total. 3-5 sections.`,
      userMessage: `Skill: ${parsed.data.skillName}
Project URL: ${parsed.data.projectUrl ?? "N/A"}
Project description: ${parsed.data.projectDescription ?? "N/A"}
Resume context: ${(parsed.data.resumeText ?? "").slice(0, 2000)}`,
    });
    const script = JSON.parse(raw.replace(/```json?\s*/g, "").replace(/```/g, ""));
    return c.json(ok(script));
  } catch (err) {
    return c.json(fail("SCRIPT_GENERATION_FAILED", `Failed: ${err}`), 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  9. VOICE CLONE MARKETPLACE
// ═══════════════════════════════════════════════════════════════════════════════
//
// Voice cloning is now a creator-owned, optionally-monetised asset. The
// backend stores reference audio + listing metadata + a license ledger;
// synthesis itself runs entirely client-side via WebGPU TTS engines
// (Kokoro, Piper, VibeVoice). No model is invoked server-side.
//
// Endpoints:
//   GET    /voice-clones                    — list caller's own clones
//   GET    /voice-clones/library            — every clone the caller can use (owned + licensed)
//   GET    /voice-clones/marketplace        — public catalog (no auth)
//   GET    /voice-clones/:id                — single clone (must be owner OR public OR licensee)
//   POST   /voice-clones                    — upload sample, create private clone
//   PATCH  /voice-clones/:id                — edit metadata, publish/unpublish, set price
//   DELETE /voice-clones/:id                — delete (owner only)
//   POST   /voice-clones/:id/claim          — claim a free public listing
//   POST   /voice-clones/:id/checkout       — start a paid checkout (returns provider session info)
//   POST   /voice-clones/:id/play           — increment play_count (analytics)

// Platform fee for creator sales, in basis points. 500 = 5%. The CC
// processing fee is additionally passed to the buyer at checkout. This is the
// PROSPECTIVE default applied to new opt-ins; each listing snapshots its own
// `platformFeeBps` at publish time so historical sales remain auditable when
// the default changes. Per-user overrides may be set by superadmin on the
// users table and are applied at opt-in time.
export const PLATFORM_FEE_BPS_DEFAULT = 500; // 5%
export const MAX_PRICE_CENTS = 1_000_00;       // $1,000 hard cap, sanity guard

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "voice";
}

/** Returns true iff `userId` may synthesize speech with `cloneId`. */
async function userHasVoiceLicense(db: ReturnType<typeof getDb>, userId: string, cloneId: string): Promise<boolean> {
  const rows = await db
    .select({ id: studioVoiceCloneLicenses.id })
    .from(studioVoiceCloneLicenses)
    .where(and(eq(studioVoiceCloneLicenses.userId, userId), eq(studioVoiceCloneLicenses.voiceCloneId, cloneId)))
    .limit(1);
  return rows.length > 0;
}

// ── GET /voice-clones — caller's own clones (owner view) ─────────────────────
studioFeaturesRoutes.get("/voice-clones", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const clones = await db.select().from(studioVoiceClones)
    .where(eq(studioVoiceClones.userId, user.sub))
    .orderBy(desc(studioVoiceClones.createdAt));
  return c.json(ok(clones));
});

// ── GET /voice-clones/library — every clone the caller can use ──────────────
// Used by VoiceoverPanel to populate the VibeVoice voice picker.
studioFeaturesRoutes.get("/voice-clones/library", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db
    .select({ clone: studioVoiceClones, license: studioVoiceCloneLicenses })
    .from(studioVoiceCloneLicenses)
    .innerJoin(studioVoiceClones, eq(studioVoiceClones.id, studioVoiceCloneLicenses.voiceCloneId))
    .where(eq(studioVoiceCloneLicenses.userId, user.sub))
    .orderBy(desc(studioVoiceCloneLicenses.grantedAt));

  // Return only the synthesis-relevant fields. Sample URL is the load-bearing
  // bit — the client fetches it as the VibeVoice reference.
  const items = rows.map((r) => ({
    id: r.clone.id,
    name: r.clone.name,
    description: r.clone.description,
    sampleAudioUrl: r.clone.sampleAudioUrl,
    previewAudioUrl: r.clone.previewAudioUrl,
    language: r.clone.language,
    gender: r.clone.gender,
    accent: r.clone.accent,
    licenseSource: r.license.source,
    isOwner: r.clone.userId === user.sub,
  }));
  return c.json(ok(items));
});

// ── GET /voice-clones/marketplace — public catalog (no auth) ────────────────
studioFeaturesRoutes.get("/voice-clones/marketplace", async (c) => {
  const db = getDb();
  const search = String(c.req.query("search") ?? "").trim();
  const language = c.req.query("language") || undefined;
  const gender = c.req.query("gender") || undefined;
  const sort = c.req.query("sort") ?? "popular"; // popular | newest | price_asc | price_desc
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 24)));

  const conds: any[] = [eq(studioVoiceClones.visibility, "public")];
  if (search) {
    conds.push(sql`(${studioVoiceClones.name} ILIKE ${"%" + search + "%"} OR ${studioVoiceClones.description} ILIKE ${"%" + search + "%"})`);
  }
  if (language) conds.push(eq(studioVoiceClones.language, language));
  if (gender) conds.push(eq(studioVoiceClones.gender, gender));

  const order =
    sort === "newest"      ? desc(studioVoiceClones.createdAt)
    : sort === "price_asc" ? sql`${studioVoiceClones.priceCents} ASC`
    : sort === "price_desc"? sql`${studioVoiceClones.priceCents} DESC`
                            : desc(studioVoiceClones.purchaseCount);

  const where = and(...conds);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studioVoiceClones)
    .where(where);
  const total = countRow?.n ?? 0;

  const rows = await db
    .select({
      id: studioVoiceClones.id,
      name: studioVoiceClones.name,
      description: studioVoiceClones.description,
      previewAudioUrl: studioVoiceClones.previewAudioUrl,
      priceCents: studioVoiceClones.priceCents,
      currency: studioVoiceClones.currency,
      language: studioVoiceClones.language,
      gender: studioVoiceClones.gender,
      accent: studioVoiceClones.accent,
      listingSlug: studioVoiceClones.listingSlug,
      playCount: studioVoiceClones.playCount,
      purchaseCount: studioVoiceClones.purchaseCount,
      createdAt: studioVoiceClones.createdAt,
      creatorId: studioVoiceClones.userId,
    })
    .from(studioVoiceClones)
    .where(where)
    .orderBy(order)
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(ok({
    items: rows,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  }));
});

// ── GET /voice-clones/:id — single clone (owner / public / licensee) ────────
studioFeaturesRoutes.get("/voice-clones/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.var.user?.sub;
  const db = getDb();

  const [clone] = await db.select().from(studioVoiceClones)
    .where(eq(studioVoiceClones.id, id))
    .limit(1);
  if (!clone) return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);

  const isOwner = userId && clone.userId === userId;
  const isPublic = clone.visibility === "public";
  const isLicensee = userId ? await userHasVoiceLicense(db, userId, id) : false;

  if (!isOwner && !isPublic && !isLicensee) {
    return c.json(fail("FORBIDDEN", "You do not have access to this voice"), 403);
  }

  // Hide the raw sample URL from non-licensees so they can't bypass purchase.
  const safe = isOwner || isLicensee
    ? clone
    : { ...clone, sampleAudioUrl: null, sampleAudioKey: null };
  return c.json(ok(safe));
});

// ── POST /voice-clones — upload reference sample, create private clone ──────
// Pro-gated: voice cloning is part of the $9.95/mo Pro tier (and the Creator
// Program voice sub-program required to publish to the marketplace also
// requires Pro). Free users hit the 402 PRO_REQUIRED upgrade prompt.
studioFeaturesRoutes.post("/voice-clones", requirePro("Voice Cloning"), async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json(fail("VALIDATION_ERROR", "Invalid form data"), 400);

  const name = String(form.get("name") ?? "My Voice").slice(0, 120);
  const description = String(form.get("description") ?? "").slice(0, 2000) || null;
  const language = (form.get("language") as string | null) || null;
  const gender = (form.get("gender") as string | null) || null;
  const accent = (form.get("accent") as string | null) || null;
  const audioFile = form.get("audio") as File | null;
  if (!audioFile) return c.json(fail("VALIDATION_ERROR", "Missing audio sample"), 400);
  if (audioFile.size > 25 * 1024 * 1024) {
    return c.json(fail("VALIDATION_ERROR", "Audio sample too large (max 25MB)"), 400);
  }

  const db = getDb();
  const id = crypto.randomUUID();

  // Upload reference sample to object storage
  const ext = (audioFile.type.split("/")[1] || "webm").replace(/[^a-z0-9]/gi, "");
  const sampleKey = `studio/voice-clones/${user.sub}/${id}.${ext}`;
  const bytes = await audioFile.arrayBuffer();
  const uploaded = await uploadToStorage(sampleKey, bytes, audioFile.type || "audio/webm", { userId: user.sub, cloneId: id });
  if (!uploaded) return c.json(fail("STORAGE_UNAVAILABLE", "Failed to store voice sample"), 503);
  const sampleUrl = cdnUrl(sampleKey);

  const [clone] = await db.insert(studioVoiceClones).values({
    id,
    userId: user.sub,
    name,
    description,
    sampleAudioUrl: sampleUrl,
    sampleAudioKey: sampleKey,
    language,
    gender,
    accent,
    visibility: "private",
    status: "ready",
  } as any).returning();

  // Auto-grant the owner a usage license so they can use their own voice.
  await db.insert(studioVoiceCloneLicenses).values({
    userId: user.sub,
    voiceCloneId: clone.id,
    source: "owner",
  } as any).onConflictDoNothing();

  return c.json(ok(clone), 201);
});

// ── PATCH /voice-clones/:id — edit metadata + publish/unpublish + set price ─
const VoiceCloneUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  language: z.string().max(20).nullable().optional(),
  gender: z.enum(["male", "female", "nonbinary"]).nullable().optional(),
  accent: z.string().max(60).nullable().optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).optional(),
  currency: z.enum(["USD"]).optional(),
  /** Required when transitioning to `public` for the first time. */
  consentAccepted: z.boolean().optional(),
  previewAudioBase64: z.string().optional(), // optional pre-rendered preview
  previewAudioMime:   z.string().optional(),
});

// PATCH is gated alongside POST: editing metadata, transitioning to
// `public`, and setting a marketplace price are all Pro-tier actions.
// Pure unpublish (public → private) by a downgraded user is rare enough
// that we don't carve out a special case — they can still DELETE.
studioFeaturesRoutes.patch("/voice-clones/:id", requirePro("Voice Cloning"), async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = VoiceCloneUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const db = getDb();
  const [existing] = await db.select().from(studioVoiceClones)
    .where(and(eq(studioVoiceClones.id, id), eq(studioVoiceClones.userId, user.sub)))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);

  const patch: Record<string, any> = { updatedAt: new Date() };
  for (const k of ["name", "description", "language", "gender", "accent", "priceCents", "currency"] as const) {
    if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
  }

  // Visibility transition: enforce consent on first publish.
  if (parsed.data.visibility !== undefined && parsed.data.visibility !== existing.visibility) {
    if (parsed.data.visibility === "public") {
      if (!parsed.data.consentAccepted && !existing.consentAgreedAt) {
        return c.json(fail("CONSENT_REQUIRED", "You must accept the voice marketplace creator terms before publishing."), 400);
      }
      if (parsed.data.consentAccepted && !existing.consentAgreedAt) {
        patch.consentAgreedAt = new Date();
        patch.consentIp = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
        patch.consentUa = c.req.header("user-agent") ?? null;
      }
      // Generate slug on first publish.
      if (!existing.listingSlug) {
        patch.listingSlug = `${slugify(parsed.data.name ?? existing.name)}-${id.slice(0, 6)}`;
      }
      patch.platformFeeBps = existing.platformFeeBps ?? PLATFORM_FEE_BPS_DEFAULT;
    }
    patch.visibility = parsed.data.visibility;
  }

  // Optional preview audio upload (client renders a short sample with Kokoro/
  // VibeVoice and uploads it base64 so the marketplace catalog has audio).
  if (parsed.data.previewAudioBase64) {
    const mime = parsed.data.previewAudioMime || "audio/wav";
    const ext = mime.split("/")[1] || "wav";
    const previewKey = `studio/voice-clones/${user.sub}/${id}-preview.${ext}`;
    const buf = Uint8Array.from(atob(parsed.data.previewAudioBase64), (ch) => ch.charCodeAt(0)).buffer;
    if (await uploadToStorage(previewKey, buf, mime)) {
      patch.previewAudioUrl = cdnUrl(previewKey);
      patch.previewAudioKey = previewKey;
    }
  }

  // Defense-in-depth: include userId in the UPDATE WHERE clause so that a
  // future refactor that drops the existence check above can't silently
  // become an authorization bypass.
  const [updated] = await db.update(studioVoiceClones)
    .set(patch as any)
    .where(and(eq(studioVoiceClones.id, id), eq(studioVoiceClones.userId, user.sub)))
    .returning();
  return c.json(ok(updated));
});

// ── POST /voice-clones/:id/claim — free listings ────────────────────────────
studioFeaturesRoutes.post("/voice-clones/:id/claim", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [clone] = await db.select().from(studioVoiceClones).where(eq(studioVoiceClones.id, id)).limit(1);
  if (!clone) return c.json(fail("NOT_FOUND", "Voice not found"), 404);
  if (clone.visibility !== "public") return c.json(fail("FORBIDDEN", "Voice is not publicly listed"), 403);
  if (clone.priceCents > 0) return c.json(fail("PAYMENT_REQUIRED", "This voice requires purchase"), 402);

  await db.insert(studioVoiceCloneLicenses).values({
    userId: user.sub,
    voiceCloneId: id,
    source: "free",
  } as any).onConflictDoNothing();

  return c.json(ok({ licensed: true }));
});

// ── POST /voice-clones/:id/checkout — paid listings ─────────────────────────
// Returns the cart line item shape; the actual Stripe session is created by
// the existing /api/payment/init-collection flow when the cart is checked out.
// We pre-flight by validating the listing here and recording an intent row.
studioFeaturesRoutes.post("/voice-clones/:id/checkout", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [clone] = await db.select().from(studioVoiceClones).where(eq(studioVoiceClones.id, id)).limit(1);
  if (!clone) return c.json(fail("NOT_FOUND", "Voice not found"), 404);
  if (clone.visibility !== "public") return c.json(fail("FORBIDDEN", "Voice is not publicly listed"), 403);
  if (clone.userId === user.sub) return c.json(fail("ALREADY_OWNED", "You already own this voice"), 409);
  if (await userHasVoiceLicense(db, user.sub, id)) {
    return c.json(fail("ALREADY_LICENSED", "You already have a license for this voice"), 409);
  }

  return c.json(ok({
    cartLine: {
      type: "voice_clone",
      voiceCloneId: clone.id,
      name: clone.name,
      priceCents: clone.priceCents,
      currency: clone.currency,
      creatorId: clone.userId,
      platformFeeBps: clone.platformFeeBps,
    },
  }));
});

// ── POST /voice-clones/:id/play — analytics counter ─────────────────────────
studioFeaturesRoutes.post("/voice-clones/:id/play", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  await db.update(studioVoiceClones)
    .set({ playCount: sql`${studioVoiceClones.playCount} + 1` } as any)
    .where(eq(studioVoiceClones.id, id));
  return c.json(ok({ ok: true }));
});

// ── DELETE /voice-clones/:id — owner only ───────────────────────────────────
studioFeaturesRoutes.delete("/voice-clones/:id", async (c) => {
  const user = c.var.user;
  const cloneId = c.req.param("id");
  const db = getDb();

  const [deleted] = await db.delete(studioVoiceClones)
    .where(and(eq(studioVoiceClones.id, cloneId), eq(studioVoiceClones.userId, user.sub)))
    .returning();

  if (!deleted) return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);
  // Cascade-delete licenses for this clone.
  await db.delete(studioVoiceCloneLicenses).where(eq(studioVoiceCloneLicenses.voiceCloneId, cloneId));
  return c.json(ok({ id: cloneId }));
});

// ── POST /voice-clones/cart-checkout — finalize a cart of voice clone purchases
//
// Called by frontend Checkout after the user submits their cart. Validates
// every line item against the live listing (price + visibility), then either:
//   • Free items (priceCents == 0) → grant 'free' license immediately
//   • Paid items (priceCents  > 0) → require `paymentRef` proving the cart
//     was charged via the existing payment provider. The webhook in
//     routes/payment.ts is the canonical grant path once Stripe one-off
//     charges (Stripe Elements) are wired in; this endpoint exists so the
//     frontend can drive the flow without a webhook round-trip in development.
const VoiceCloneCartCheckoutSchema = z.object({
  items: z.array(z.object({
    voiceCloneId: z.string().uuid(),
    expectedPriceCents: z.number().int().min(0),
  })).min(1).max(50),
  /** Provider charge reference (Stripe payment_intent ID, etc.).
   *  Required if any item has price > 0. */
  paymentRef: z.string().min(1).optional(),
});

studioFeaturesRoutes.post("/voice-clones/cart-checkout", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = VoiceCloneCartCheckoutSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const db = getDb();
  const ids = parsed.data.items.map((i) => i.voiceCloneId);
  const listings = await db.select().from(studioVoiceClones)
    .where(inArray(studioVoiceClones.id, ids));
  const byId = new Map(listings.map((l) => [l.id, l]));

  // Validate every line item
  let paidTotal = 0;
  for (const item of parsed.data.items) {
    const clone = byId.get(item.voiceCloneId);
    if (!clone) return c.json(fail("NOT_FOUND", `Voice ${item.voiceCloneId} not found`), 404);
    if (clone.visibility !== "public") return c.json(fail("FORBIDDEN", `Voice ${clone.name} is no longer listed`), 403);
    if (clone.userId === user.sub) return c.json(fail("ALREADY_OWNED", `You own ${clone.name}`), 409);
    if (clone.priceCents !== item.expectedPriceCents) {
      return c.json(fail("PRICE_CHANGED", `Price changed for ${clone.name}`, { current: clone.priceCents }), 409);
    }
    if (await userHasVoiceLicense(db, user.sub, clone.id)) {
      return c.json(fail("ALREADY_LICENSED", `You already own ${clone.name}`), 409);
    }
    paidTotal += clone.priceCents;
  }

  // Paid carts must come with a provider charge reference. Free carts can
  // proceed immediately. The frontend's Stripe Elements / Helcim widget is
  // responsible for collecting paymentRef before calling this endpoint.
  if (paidTotal > 0 && !parsed.data.paymentRef) {
    return c.json(fail("PAYMENT_REQUIRED", "paymentRef required for paid items"), 402);
  }

  const granted: Array<{ voiceCloneId: string; source: string }> = [];
  for (const item of parsed.data.items) {
    const clone = byId.get(item.voiceCloneId)!;
    if (clone.priceCents === 0) {
      await db.insert(studioVoiceCloneLicenses).values({
        userId: user.sub,
        voiceCloneId: clone.id,
        source: "free",
      } as any).onConflictDoNothing();
      granted.push({ voiceCloneId: clone.id, source: "free" });
    } else {
      await grantVoiceClonePurchaseLicense(clone.id, user.sub, clone.priceCents, parsed.data.paymentRef!);
      granted.push({ voiceCloneId: clone.id, source: "purchase" });
    }
  }

  return c.json(ok({ granted }), 201);
});

/**
 * Internal helper exported for the payment webhook (see routes/payment.ts):
 * grants a license to `userId` on a successful purchase, splits the payment
 * into creator/platform cuts based on the listing's `platformFeeBps`, and
 * bumps `purchase_count`. Idempotent on (user_id, voice_clone_id).
 */
export async function grantVoiceClonePurchaseLicense(
  voiceCloneId: string,
  userId: string,
  pricePaidCents: number,
  paymentRef: string,
): Promise<void> {
  const db = getDb();
  const [clone] = await db.select().from(studioVoiceClones).where(eq(studioVoiceClones.id, voiceCloneId)).limit(1);
  if (!clone) return;
  const feeBps = clone.platformFeeBps ?? PLATFORM_FEE_BPS_DEFAULT;
  const platformCut = Math.round((pricePaidCents * feeBps) / 10_000);
  const creatorCut = pricePaidCents - platformCut;

  await db.insert(studioVoiceCloneLicenses).values({
    userId,
    voiceCloneId,
    source: "purchase",
    pricePaidCents,
    creatorCutCents: creatorCut,
    platformCutCents: platformCut,
    paymentRef,
  } as any).onConflictDoNothing();

  await db.update(studioVoiceClones)
    .set({ purchaseCount: sql`${studioVoiceClones.purchaseCount} + 1` } as any)
    .where(eq(studioVoiceClones.id, voiceCloneId));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  10. ASYNC EMPLOYER VIDEO INTERVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/async-interview — recruiter creates an async interview
studioFeaturesRoutes.post("/async-interview", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    title: z.string().min(1).max(200),
    instructions: z.string().max(2000).optional(),
    candidateEmail: z.string().email().optional(),
    candidateId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    questions: z.array(z.object({
      id: z.string(),
      text: z.string().min(1),
      maxDurationSec: z.number().min(30).max(300).default(120),
      required: z.boolean().default(true),
    })).min(1).max(10),
    deadline: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const inviteToken = crypto.randomUUID();
  const db = getDb();
  const [interview] = await db.insert(studioAsyncInterviews).values({
    recruiterId: user.sub,
    candidateId: parsed.data.candidateId ?? null,
    candidateEmail: parsed.data.candidateEmail ?? null,
    jobId: parsed.data.jobId ?? null,
    title: parsed.data.title,
    instructions: parsed.data.instructions ?? null,
    questions: parsed.data.questions,
    deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    inviteToken,
    status: "pending",
  } as any).returning();

  const inviteUrl = `https://hired.video/interview/${inviteToken}`;

  return c.json(ok({
    id: interview.id,
    inviteToken,
    inviteUrl,
    status: "pending",
  }), 201);
});

// GET /api/studio/async-interview/invite/:token — candidate views interview invite
studioFeaturesRoutes.get("/async-interview/invite/:token", async (c) => {
  const token = c.req.param("token");
  const db = getDb();

  const [interview] = await db.select().from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.inviteToken, token))
    .limit(1);

  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);
  if (interview.status === "expired") return c.json(fail("EXPIRED", "Interview has expired"), 410);

  return c.json(ok({
    id: interview.id,
    title: interview.title,
    instructions: interview.instructions,
    questions: interview.questions,
    deadline: interview.deadline,
    status: interview.status,
  }));
});

// POST /api/studio/async-interview/:id/respond — candidate submits a video response
studioFeaturesRoutes.post("/async-interview/:id/respond", async (c) => {
  const user = c.var.user;
  const interviewId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    questionId: z.string(),
    recordingId: z.string().uuid().optional(),
    videoUrl: z.string().optional(),
    transcription: z.string().optional(),
    durationMs: z.number().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [response] = await db.insert(studioAsyncResponses).values({
    interviewId,
    candidateId: user.sub,
    questionId: parsed.data.questionId,
    recordingId: parsed.data.recordingId ?? null,
    videoUrl: parsed.data.videoUrl ?? null,
    durationMs: parsed.data.durationMs ?? null,
    transcription: parsed.data.transcription ?? null,
    status: "recorded",
  } as any).returning();

  // Update interview status
  await db.update(studioAsyncInterviews).set({
    status: "in_progress",
    updatedAt: new Date(),
  } as any).where(eq(studioAsyncInterviews.id, interviewId));

  return c.json(ok(response), 201);
});

// POST /api/studio/async-interview/:id/submit — candidate marks interview as submitted
studioFeaturesRoutes.post("/async-interview/:id/submit", async (c) => {
  const user = c.var.user;
  const interviewId = c.req.param("id");
  const db = getDb();

  // Update all responses to submitted
  await db.update(studioAsyncResponses).set({ status: "submitted" } as any)
    .where(and(eq(studioAsyncResponses.interviewId, interviewId), eq(studioAsyncResponses.candidateId, user.sub)));

  await db.update(studioAsyncInterviews).set({
    status: "submitted",
    updatedAt: new Date(),
  } as any).where(eq(studioAsyncInterviews.id, interviewId));

  return c.json(ok({ status: "submitted" }));
});

// GET /api/studio/async-interviews — list interviews (for recruiter)
studioFeaturesRoutes.get("/async-interviews", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const interviews = await db.select().from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.recruiterId, user.sub))
    .orderBy(desc(studioAsyncInterviews.createdAt))
    .limit(50);

  return c.json(ok(interviews));
});

// GET /api/studio/async-interview/:id/responses — recruiter views candidate responses
studioFeaturesRoutes.get("/async-interview/:id/responses", async (c) => {
  const user = c.var.user;
  const interviewId = c.req.param("id");
  const db = getDb();

  // Verify recruiter owns this interview
  const [interview] = await db.select().from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.id, interviewId), eq(studioAsyncInterviews.recruiterId, user.sub)))
    .limit(1);

  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);

  const responses = await db.select().from(studioAsyncResponses)
    .where(eq(studioAsyncResponses.interviewId, interviewId))
    .orderBy(studioAsyncResponses.createdAt);

  return c.json(ok({ interview, responses }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  11. ADVANCED VIDEO ANALYTICS (Wistia-quality heatmap)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/analytics/track — track per-second viewing data
studioFeaturesRoutes.post("/analytics/track", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    videoId: z.string(),
    viewerId: z.string().optional(),
    viewerEmail: z.string().email().optional(),
    secondsWatched: z.array(z.number()),     // array of 0|1 per second
    totalWatchTimeSec: z.number(),
    percentWatched: z.number(),
    dropOffSecond: z.number().optional(),
    referrer: z.string().optional(),
    userAgent: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  // Reverse-lookup company from email domain
  let viewerCompany: string | null = null;
  if (parsed.data.viewerEmail) {
    const domain = parsed.data.viewerEmail.split("@")[1];
    if (domain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(domain)) {
      viewerCompany = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
    }
  }

  const db = getDb();
  const [heatmap] = await db.insert(studioVideoHeatmap).values({
    videoId: parsed.data.videoId,
    viewerId: parsed.data.viewerId ?? null,
    viewerEmail: parsed.data.viewerEmail ?? null,
    viewerCompany,
    secondsWatched: parsed.data.secondsWatched,
    totalWatchTimeSec: parsed.data.totalWatchTimeSec,
    percentWatched: parsed.data.percentWatched,
    dropOffSecond: parsed.data.dropOffSecond ?? null,
    referrer: parsed.data.referrer ?? null,
    userAgent: parsed.data.userAgent ?? null,
  } as any).returning();

  return c.json(ok({ id: heatmap.id }), 201);
});

// GET /api/studio/analytics/:videoId — heatmap + drop-off + viewer-company
// breakdown. Pro-gated via the shared `requireVideoAnalytics` middleware
// (paired with `studio.ts /videos/:id/analytics`). POST /analytics/track
// stays public so anonymous viewers can record events.
studioFeaturesRoutes.get("/analytics/:videoId", requireVideoAnalytics, async (c) => {
  const user = c.var.user;
  const videoId = c.req.param("videoId");
  const db = getDb();

  const views = await db.select().from(studioVideoHeatmap)
    .where(eq(studioVideoHeatmap.videoId, videoId))
    .orderBy(desc(studioVideoHeatmap.createdAt))
    .limit(500);

  if (views.length === 0) {
    return c.json(ok({
      totalViews: 0,
      avgWatchTimeSec: 0,
      avgPercentWatched: 0,
      heatmap: [],
      viewers: [],
      topDropOffSecond: null,
    }));
  }

  // Build aggregated heatmap (per-second view count)
  const maxDuration = Math.max(...views.map((v) => {
    const sw = v.secondsWatched as number[];
    return sw?.length ?? 0;
  }));
  const heatmap = new Array(maxDuration).fill(0);
  for (const view of views) {
    const sw = view.secondsWatched as number[];
    if (sw) {
      for (let i = 0; i < sw.length; i++) {
        if (sw[i]) heatmap[i] = (heatmap[i] ?? 0) + 1;
      }
    }
  }

  // Normalize heatmap to percentages
  const totalViews = views.length;
  const normalizedHeatmap = heatmap.map((count: number) =>
    Math.round((count / totalViews) * 100),
  );

  const avgWatchTimeSec = Math.round(views.reduce((a, v) => a + (v.totalWatchTimeSec ?? 0), 0) / totalViews);
  const avgPercentWatched = Math.round(views.reduce((a, v) => a + (v.percentWatched ?? 0), 0) / totalViews);

  // Find most common drop-off point
  const dropOffs: Record<number, number> = {};
  for (const view of views) {
    if (view.dropOffSecond != null) {
      dropOffs[view.dropOffSecond] = (dropOffs[view.dropOffSecond] ?? 0) + 1;
    }
  }
  const topDropOffSecond = Object.entries(dropOffs)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  // Viewer list (deduplicated, most recent first)
  const viewerMap = new Map<string, { email?: string; company?: string; lastViewed: string; views: number; avgPercent: number }>();
  for (const view of views) {
    const key = view.viewerEmail ?? view.viewerId ?? "anonymous";
    const existing = viewerMap.get(key);
    if (existing) {
      existing.views += 1;
      existing.avgPercent = Math.round((existing.avgPercent * (existing.views - 1) + (view.percentWatched ?? 0)) / existing.views);
    } else {
      viewerMap.set(key, {
        email: view.viewerEmail ?? undefined,
        company: view.viewerCompany ?? undefined,
        lastViewed: view.createdAt?.toISOString() ?? new Date().toISOString(),
        views: 1,
        avgPercent: Math.round(view.percentWatched ?? 0),
      });
    }
  }

  return c.json(ok({
    totalViews,
    avgWatchTimeSec,
    avgPercentWatched,
    heatmap: normalizedHeatmap,
    topDropOffSecond: topDropOffSecond ? Number(topDropOffSecond) : null,
    viewers: Array.from(viewerMap.entries())
      .map(([key, data]) => ({ id: key, ...data }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 50),
  }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  12. STOCK MEDIA LIBRARY (Unsplash + Pexels + Pixabay) — gap #128
// ██
// ██  Content-addressed dedup: search results stream live from provider APIs;
// ██  on pick we download once, hash the bytes (sha256), and only PUT to R2 if
// ██  no row already exists for that hash. Per-user picks recorded in
// ██  user_stock_media_usage so the same R2 object can back thousands of
// ██  projects without duplication.
// ═══════════════════════════════════════════════════════════════════════════════

function providerKeys(c: any) {
  return {
    unsplash: c.env.UNSPLASH_ACCESS_KEY as string | undefined,
    pexels:   c.env.PEXELS_API_KEY as string | undefined,
    pixabay:  c.env.PIXABAY_API_KEY as string | undefined,
  };
}

// GET /api/studio/stock/search?q=...&type=image|video&page=1&perPage=20
studioFeaturesRoutes.get("/stock/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json(fail("VALIDATION_ERROR", "q query param is required"), 400);
  const typeParam = c.req.query("type") as StockMediaType | undefined;
  const mediaType: StockMediaType = (typeParam === "video" || typeParam === "audio") ? typeParam : "image";
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const perPage = Math.min(40, Math.max(1, parseInt(c.req.query("perPage") ?? "20", 10) || 20));

  const keys = providerKeys(c);
  if (!keys.unsplash && !keys.pexels && !keys.pixabay) {
    return c.json(fail("STOCK_UNAVAILABLE", "No stock media providers configured. Set UNSPLASH_ACCESS_KEY, PEXELS_API_KEY, or PIXABAY_API_KEY."), 503);
  }

  try {
    const response = await searchStockMedia(keys, { query: q, mediaType, page, perPage });
    return c.json(ok(response));
  } catch (err) {
    console.error("[stock/search] error:", err);
    return c.json(fail("STOCK_SEARCH_FAILED", `Stock media search failed: ${err}`), 500);
  }
});

// POST /api/studio/stock/pick — user selects an asset from search results.
// Body: { provider, providerAssetId, downloadUrl, mediaType, title?, description?,
//         author?, authorUrl?, licence, width?, height?, durationMs?, tags?,
//         projectId?, sceneId? }
//
// Dedup flow:
//   1. Look up by (provider, providerAssetId) — if found, skip download entirely.
//   2. Otherwise fetch the bytes, compute sha256, and check for an existing
//      row by hash (handles cross-provider duplicates of the same image).
//   3. Only PUT to R2 if neither lookup found a row.
//   4. Always insert a per-user usage row referencing the asset hash.
studioFeaturesRoutes.post("/stock/pick", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    provider:        z.enum(["unsplash", "pexels", "pixabay"]),
    providerAssetId: z.string().min(1),
    downloadUrl:     z.string().url(),
    mediaType:       z.enum(["image", "video", "audio"]).default("image"),
    title:           z.string().optional(),
    description:     z.string().optional(),
    author:          z.string().optional(),
    authorUrl:       z.string().optional(),
    licence:         z.string().min(1),
    width:           z.number().int().positive().optional(),
    height:          z.number().int().positive().optional(),
    durationMs:      z.number().int().nonnegative().optional(),
    tags:            z.array(z.string()).optional(),
    projectId:       z.string().optional(),
    sceneId:         z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  const p = parsed.data;
  const db = getDb();

  // Step 1: existing row by (provider, providerAssetId)?
  let asset = (await db
    .select()
    .from(stockMediaAssets)
    .where(and(
      eq(stockMediaAssets.provider, p.provider),
      eq(stockMediaAssets.providerAssetId, p.providerAssetId),
    ))
    .limit(1))[0];

  let dedup: "provider-id" | "hash" | "fresh" = "provider-id";

  if (!asset) {
    // Step 2: fetch + hash bytes
    let fetched;
    try {
      fetched = await fetchAssetForHashing(p.downloadUrl);
    } catch (err) {
      console.error("[stock/pick] download error:", err);
      return c.json(fail("STOCK_DOWNLOAD_FAILED", `Failed to download asset: ${err}`), 502);
    }

    // Step 2b: existing row by hash (cross-provider duplicate)?
    asset = (await db
      .select()
      .from(stockMediaAssets)
      .where(eq(stockMediaAssets.hash, fetched.hash))
      .limit(1))[0];

    if (asset) {
      dedup = "hash";
    } else {
      // Step 3: PUT to R2 (only path that ever writes bytes)
      const uploaded = await uploadToStorage(
        fetched.storageKey,
        fetched.bytes,
        fetched.mimeType,
        { provider: p.provider, providerAssetId: p.providerAssetId, hash: fetched.hash },
      );
      if (!uploaded) {
        return c.json(fail("STORAGE_UNAVAILABLE", "Object storage not configured"), 503);
      }

      const inferredMediaType = mediaTypeFromMime(fetched.mimeType);
      const [inserted] = await db.insert(stockMediaAssets).values({
        hash:            fetched.hash,
        provider:        p.provider,
        providerAssetId: p.providerAssetId,
        mediaType:       inferredMediaType,
        mimeType:        fetched.mimeType,
        sizeBytes:       fetched.sizeBytes,
        width:           p.width ?? null,
        height:          p.height ?? null,
        durationMs:      p.durationMs ?? null,
        storageKey:      fetched.storageKey,
        cdnUrl:          cdnUrl(fetched.storageKey),
        sourceUrl:       p.downloadUrl,
        title:           p.title ?? null,
        description:     p.description ?? null,
        author:          p.author ?? null,
        authorUrl:       p.authorUrl ?? null,
        licence:         p.licence,
        attributionJson: {
          provider: p.provider,
          author:   p.author ?? null,
          authorUrl: p.authorUrl ?? null,
          licence:  p.licence,
          sourceUrl: p.downloadUrl,
        },
        tags:            p.tags ?? [],
        pickCount:       0,
      } as any).returning();
      asset = inserted;
      dedup = "fresh";
    }
  }

  // Step 4: bump pick counter + record per-user usage
  await db.update(stockMediaAssets)
    .set({
      pickCount: sql`${stockMediaAssets.pickCount} + 1`,
      lastPickedAt: new Date(),
    } as any)
    .where(eq(stockMediaAssets.hash, asset.hash));

  await db.insert(userStockMediaUsage).values({
    userId:    user.sub,
    assetHash: asset.hash,
    projectId: p.projectId ?? null,
    sceneId:   p.sceneId ?? null,
  } as any);

  return c.json(ok({
    hash:      asset.hash,
    cdnUrl:    asset.cdnUrl,
    storageKey: asset.storageKey,
    mediaType: asset.mediaType,
    mimeType:  asset.mimeType,
    width:     asset.width,
    height:    asset.height,
    durationMs: asset.durationMs,
    attribution: asset.attributionJson,
    dedup,                      // "provider-id" | "hash" | "fresh"
    storageBytesSaved: dedup === "fresh" ? 0 : asset.sizeBytes,
  }), 201);
});

// GET /api/studio/stock/recent — current user's recently used stock assets
studioFeaturesRoutes.get("/stock/recent", async (c) => {
  const user = c.var.user;
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10) || 20));
  const db = getDb();

  const rows = await db
    .select({
      hash:       stockMediaAssets.hash,
      cdnUrl:     stockMediaAssets.cdnUrl,
      mediaType:  stockMediaAssets.mediaType,
      mimeType:   stockMediaAssets.mimeType,
      width:      stockMediaAssets.width,
      height:     stockMediaAssets.height,
      durationMs: stockMediaAssets.durationMs,
      title:      stockMediaAssets.title,
      author:     stockMediaAssets.author,
      licence:    stockMediaAssets.licence,
      addedAt:    userStockMediaUsage.addedAt,
    })
    .from(userStockMediaUsage)
    .innerJoin(stockMediaAssets, eq(userStockMediaUsage.assetHash, stockMediaAssets.hash))
    .where(eq(userStockMediaUsage.userId, user.sub))
    .orderBy(desc(userStockMediaUsage.addedAt))
    .limit(limit);

  // Dedup by hash so the same asset appears once even if reused
  const seen = new Set<string>();
  const recent = rows.filter((r) => {
    if (seen.has(r.hash)) return false;
    seen.add(r.hash);
    return true;
  });

  return c.json(ok({ recent }));
});

// GET /api/studio/stock/stats — admin-ish dedup stats for the current user
studioFeaturesRoutes.get("/stock/stats", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const usageRows = await db
    .select({
      hash:      userStockMediaUsage.assetHash,
      sizeBytes: stockMediaAssets.sizeBytes,
    })
    .from(userStockMediaUsage)
    .innerJoin(stockMediaAssets, eq(userStockMediaUsage.assetHash, stockMediaAssets.hash))
    .where(eq(userStockMediaUsage.userId, user.sub));

  const totalPicks = usageRows.length;
  const uniqueHashes = new Set(usageRows.map((r) => r.hash));
  const uniqueAssetCount = uniqueHashes.size;

  // Bytes that would have been stored without dedup vs. what is actually stored.
  const byHash = new Map<string, number>();
  for (const r of usageRows) byHash.set(r.hash, r.sizeBytes);
  const actualBytes = Array.from(byHash.values()).reduce((a, b) => a + b, 0);
  const naiveBytes = usageRows.reduce((a, r) => a + r.sizeBytes, 0);

  return c.json(ok({
    totalPicks,
    uniqueAssetCount,
    actualBytes,
    naiveBytes,
    bytesSaved: naiveBytes - actualBytes,
  }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  13. PROJECT VERSION HISTORY + AUTOSAVE — gap #131
// ██
// ██  Debounced autosave creates a `studio_project_versions` snapshot row.
// ██  Caps: 50 versions per project, 30-day retention. Restoring writes a
// ██  new "restored from vN" row rather than mutating history.
// ═══════════════════════════════════════════════════════════════════════════════

const VERSIONS_PER_PROJECT_CAP = 50;
const VERSION_RETENTION_DAYS = 30;

// POST /api/studio/projects/:projectId/versions — create snapshot (autosave or manual)
studioFeaturesRoutes.post("/projects/:projectId/versions", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    storyboard: z.unknown(),
    label:      z.string().max(120).optional(),
    isAutosave: z.boolean().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  if (parsed.data.storyboard == null) return c.json(fail("VALIDATION_ERROR", "storyboard required"), 400);

  const db = getDb();

  // Compute next version number
  const [latest] = await db
    .select({ versionNumber: studioProjectVersions.versionNumber })
    .from(studioProjectVersions)
    .where(eq(studioProjectVersions.projectId, projectId))
    .orderBy(desc(studioProjectVersions.versionNumber))
    .limit(1);
  const nextNumber = (latest?.versionNumber ?? 0) + 1;

  const [version] = await db.insert(studioProjectVersions).values({
    projectId,
    userId: user.sub,
    versionNumber: nextNumber,
    label: parsed.data.label ?? (parsed.data.isAutosave === false ? "manual" : "autosave"),
    storyboard: parsed.data.storyboard,
    isAutosave: parsed.data.isAutosave !== false,
  } as any).returning();

  // Enforce 50-version cap and 30-day retention by deleting old AUTOSAVE rows.
  // Manual snapshots are preserved beyond the cap.
  const allAutosaves = await db
    .select({ id: studioProjectVersions.id, createdAt: studioProjectVersions.createdAt })
    .from(studioProjectVersions)
    .where(and(
      eq(studioProjectVersions.projectId, projectId),
      eq(studioProjectVersions.isAutosave, true),
    ))
    .orderBy(desc(studioProjectVersions.createdAt));

  const cutoff = Date.now() - VERSION_RETENTION_DAYS * 86400 * 1000;
  const toDelete = allAutosaves
    .filter((v, i) => i >= VERSIONS_PER_PROJECT_CAP || (v.createdAt && v.createdAt.getTime() < cutoff))
    .map((v) => v.id);

  if (toDelete.length > 0) {
    await db.delete(studioProjectVersions)
      .where(inArray(studioProjectVersions.id, toDelete));
  }

  return c.json(ok({
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    isAutosave: version.isAutosave,
    createdAt: version.createdAt,
    prunedCount: toDelete.length,
  }), 201);
});

// GET /api/studio/projects/:projectId/versions — list snapshots
studioFeaturesRoutes.get("/projects/:projectId/versions", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const versions = await db
    .select({
      id: studioProjectVersions.id,
      versionNumber: studioProjectVersions.versionNumber,
      label: studioProjectVersions.label,
      isAutosave: studioProjectVersions.isAutosave,
      createdAt: studioProjectVersions.createdAt,
    })
    .from(studioProjectVersions)
    .where(and(
      eq(studioProjectVersions.projectId, projectId),
      eq(studioProjectVersions.userId, user.sub),
    ))
    .orderBy(desc(studioProjectVersions.versionNumber))
    .limit(100);

  return c.json(ok({ versions }));
});

// GET /api/studio/projects/:projectId/versions/:versionId — fetch full snapshot
studioFeaturesRoutes.get("/projects/:projectId/versions/:versionId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");
  const db = getDb();

  const [version] = await db
    .select()
    .from(studioProjectVersions)
    .where(and(
      eq(studioProjectVersions.id, versionId),
      eq(studioProjectVersions.projectId, projectId),
      eq(studioProjectVersions.userId, user.sub),
    ))
    .limit(1);

  if (!version) return c.json(fail("NOT_FOUND", "Version not found"), 404);
  return c.json(ok(version));
});

// POST /api/studio/projects/:projectId/versions/:versionId/restore
// Returns the storyboard so the caller (StudioLayout) can re-hydrate state.
// A new "restored from vN" version row is created marking the restore point.
studioFeaturesRoutes.post("/projects/:projectId/versions/:versionId/restore", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");
  const db = getDb();

  const [source] = await db
    .select()
    .from(studioProjectVersions)
    .where(and(
      eq(studioProjectVersions.id, versionId),
      eq(studioProjectVersions.projectId, projectId),
      eq(studioProjectVersions.userId, user.sub),
    ))
    .limit(1);
  if (!source) return c.json(fail("NOT_FOUND", "Version not found"), 404);

  // Compute next version number
  const [latest] = await db
    .select({ versionNumber: studioProjectVersions.versionNumber })
    .from(studioProjectVersions)
    .where(eq(studioProjectVersions.projectId, projectId))
    .orderBy(desc(studioProjectVersions.versionNumber))
    .limit(1);
  const nextNumber = (latest?.versionNumber ?? 0) + 1;

  const [restored] = await db.insert(studioProjectVersions).values({
    projectId,
    userId: user.sub,
    versionNumber: nextNumber,
    label: `restored from v${source.versionNumber}`,
    storyboard: source.storyboard,
    isAutosave: false,
  } as any).returning();

  return c.json(ok({
    restoredVersion: {
      id: restored.id,
      versionNumber: restored.versionNumber,
      label: restored.label,
      createdAt: restored.createdAt,
    },
    storyboard: source.storyboard,
  }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  14. VIDEO CHAPTERS + TOC — gap #141
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/projects/:projectId/chapters
studioFeaturesRoutes.get("/projects/:projectId/chapters", async (c) => {
  const projectId = c.req.param("projectId");
  const db = getDb();

  const chapters = await db
    .select()
    .from(studioChapters)
    .where(eq(studioChapters.projectId, projectId))
    .orderBy(studioChapters.startSeconds);

  return c.json(ok({ chapters }));
});

// POST /api/studio/projects/:projectId/chapters — create or replace full chapter list
// Body: { chapters: Array<{ title, startSeconds, thumbnailUrl? }> }
studioFeaturesRoutes.post("/projects/:projectId/chapters", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    chapters: z.array(z.object({
      title:        z.string().min(1).max(120),
      startSeconds: z.number().min(0),
      thumbnailUrl: z.string().url().optional(),
    })),
    replace: z.boolean().default(true),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);

  const db = getDb();

  if (parsed.data.replace) {
    await db.delete(studioChapters).where(and(
      eq(studioChapters.projectId, projectId),
      eq(studioChapters.userId, user.sub),
    ));
  }

  // Sort by startSeconds, assign orderIndex
  const sorted = [...parsed.data.chapters].sort((a, b) => a.startSeconds - b.startSeconds);
  if (sorted.length === 0) return c.json(ok({ chapters: [] }));

  const inserted = await db.insert(studioChapters).values(
    sorted.map((ch, i) => ({
      projectId,
      userId: user.sub,
      title: ch.title,
      startSeconds: ch.startSeconds,
      thumbnailUrl: ch.thumbnailUrl ?? null,
      orderIndex: i,
    }) as any),
  ).returning();

  return c.json(ok({ chapters: inserted }), 201);
});

// PATCH /api/studio/chapters/:id — edit a single chapter
studioFeaturesRoutes.patch("/chapters/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    title:        z.string().min(1).max(120).optional(),
    startSeconds: z.number().min(0).optional(),
    thumbnailUrl: z.string().url().nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.startSeconds !== undefined) patch.startSeconds = parsed.data.startSeconds;
  if (parsed.data.thumbnailUrl !== undefined) patch.thumbnailUrl = parsed.data.thumbnailUrl;

  const [updated] = await db.update(studioChapters)
    .set(patch as any)
    .where(and(eq(studioChapters.id, id), eq(studioChapters.userId, user.sub)))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Chapter not found"), 404);
  return c.json(ok(updated));
});

// DELETE /api/studio/chapters/:id
studioFeaturesRoutes.delete("/chapters/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const deleted = await db.delete(studioChapters)
    .where(and(eq(studioChapters.id, id), eq(studioChapters.userId, user.sub)))
    .returning({ id: studioChapters.id });
  if (deleted.length === 0) return c.json(fail("NOT_FOUND", "Chapter not found"), 404);
  return c.json(ok({ deleted: deleted[0].id }));
});

// GET /api/studio/projects/:projectId/chapters/youtube — formatted text for YouTube/LinkedIn
studioFeaturesRoutes.get("/projects/:projectId/chapters/youtube", async (c) => {
  const projectId = c.req.param("projectId");
  const db = getDb();
  const chapters = await db
    .select()
    .from(studioChapters)
    .where(eq(studioChapters.projectId, projectId))
    .orderBy(studioChapters.startSeconds);

  const lines = chapters.map((ch) => {
    const total = Math.floor(ch.startSeconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ts = h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
    return `${ts} ${ch.title}`;
  });

  return c.json(ok({ text: lines.join("\n"), count: chapters.length }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  15. AI SCRIPT REWRITER — gap #144
// ██
// ██  LLM rewrite of an existing storyboard: shorten, change tone, swap persona.
// ██  Returns a new scene array preserving timing constraints.
// ═══════════════════════════════════════════════════════════════════════════════

studioFeaturesRoutes.post("/projects/:projectId/script/rewrite", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    storyboard: z.unknown(),
    mode: z.enum(["shorten", "lengthen", "tone", "persona"]),
    targetSeconds: z.number().min(5).max(300).optional(),
    tone: z.enum(["professional", "conversational", "enthusiastic", "executive"]).optional(),
    persona: z.enum(["job-seeker", "recruiter", "company-promo", "personal-brand"]).optional(),
    instructions: z.string().max(500).optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);

  const apiKey = getApiKey(c.env);
  if (!apiKey) return c.json(fail("AI_UNAVAILABLE", "LLM API key not configured"), 503);

  const { mode, targetSeconds, tone, persona, instructions } = parsed.data;

  const directive = (() => {
    switch (mode) {
      case "shorten":
        return `Shorten the script to approximately ${targetSeconds ?? 20} total seconds. Preserve the most impactful scenes and trim wordy narration.`;
      case "lengthen":
        return `Expand the script to approximately ${targetSeconds ?? 45} total seconds. Add concrete examples, transitions, and supporting detail without inventing facts.`;
      case "tone":
        return `Rewrite all narration in a ${tone ?? "professional"} tone. Keep every scene's structure and timing identical — change only the words spoken.`;
      case "persona":
        return `Re-frame the script for a ${persona ?? "job-seeker"} audience. Adjust messaging, calls-to-action, and emphasis while keeping the same scene count and total duration.`;
    }
  })();

  const systemPrompt = `You rewrite video storyboard scripts. You must return ONLY valid JSON matching the input shape. Never invent facts not present in the original. Preserve scene 'type', 'visual', and 'camera' fields exactly. You may rewrite 'title', 'subtitle', 'text', 'ctaText'. If shortening, you may remove scenes. If lengthening, you may insert new scenes that build on existing themes.`;
  const userMessage = `Original storyboard:\n${JSON.stringify(parsed.data.storyboard, null, 2)}\n\nRewrite directive: ${directive}${instructions ? `\n\nAdditional instructions: ${instructions}` : ""}\n\nReturn JSON: { "scenes": [...] }`;

  const RewriteSchema = z.object({
    scenes: z.array(z.record(z.string(), z.unknown())),
  });

  try {
    const rewritten = await callLLMJson(
      apiKey,
      { systemPrompt, userMessage, temperature: 0.6 },
      RewriteSchema,
    );

    return c.json(ok({
      mode,
      sceneCount: rewritten.scenes.length,
      storyboard: rewritten,
      projectId,
      userId: user.sub,
    }));
  } catch (err) {
    console.error("[script/rewrite] error:", err);
    return c.json(fail("AI_ERROR", `Script rewrite failed: ${err}`), 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  16. IN-VIDEO LEAD FORMS — gap #140
// ██
// ██  Wistia Turnstile equivalent. Forms are pinned to a playback timestamp
// ██  and surface as an overlay during the embedded player. Submissions
// ██  land in `studio_video_form_submissions` AND mirror into the global
// ██  `marketingLeads` table for the unified lead inbox.
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/projects/:projectId/forms — list forms for a project (owner)
studioFeaturesRoutes.get("/projects/:projectId/forms", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const forms = await db
    .select()
    .from(studioVideoForms)
    .where(and(
      eq(studioVideoForms.projectId, projectId),
      eq(studioVideoForms.userId, user.sub),
    ))
    .orderBy(studioVideoForms.positionSeconds);

  return c.json(ok({ forms }));
});

// GET /api/studio/videos/:videoId/forms — public — used by the embedded player
// to fetch the active forms attached to a video at view time. Only returns
// forms whose parent project owns the video AND `isActive = true`.
studioFeaturesRoutes.get("/videos/:videoId/forms/public", async (c) => {
  const videoId = c.req.param("videoId");
  const db = getDb();

  // Find the project owning this video
  const [project] = await db
    .select({ id: schema.studioProjects.id })
    .from(schema.studioProjects)
    .where(eq(schema.studioProjects.videoId, videoId))
    .limit(1);

  if (!project) return c.json(ok({ forms: [] }));

  const forms = await db
    .select({
      id: studioVideoForms.id,
      title: studioVideoForms.title,
      description: studioVideoForms.description,
      positionSeconds: studioVideoForms.positionSeconds,
      fields: studioVideoForms.fields,
      requireToContinue: studioVideoForms.requireToContinue,
      submitButtonText: studioVideoForms.submitButtonText,
      redirectUrl: studioVideoForms.redirectUrl,
    })
    .from(studioVideoForms)
    .where(and(
      eq(studioVideoForms.projectId, project.id),
      eq(studioVideoForms.isActive, true),
    ))
    .orderBy(studioVideoForms.positionSeconds);

  return c.json(ok({ forms }));
});

// POST /api/studio/projects/:projectId/forms — create
studioFeaturesRoutes.post("/projects/:projectId/forms", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    title: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    positionSeconds: z.number().min(0),
    fields: z.array(z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      type: z.enum(["email", "text", "tel", "select"]),
      required: z.boolean().default(true),
      options: z.array(z.string()).optional(), // for select
    })).min(1),
    requireToContinue: z.boolean().default(true),
    redirectUrl: z.string().url().nullable().optional(),
    submitButtonText: z.string().max(40).optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);

  const db = getDb();
  const [form] = await db.insert(studioVideoForms).values({
    userId: user.sub,
    projectId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    positionSeconds: parsed.data.positionSeconds,
    fields: parsed.data.fields,
    requireToContinue: parsed.data.requireToContinue,
    redirectUrl: parsed.data.redirectUrl ?? null,
    submitButtonText: parsed.data.submitButtonText ?? "Continue",
  } as any).returning();

  return c.json(ok(form), 201);
});

// PATCH /api/studio/forms/:id
studioFeaturesRoutes.patch("/forms/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    positionSeconds: z.number().min(0).optional(),
    requireToContinue: z.boolean().optional(),
    isActive: z.boolean().optional(),
    redirectUrl: z.string().url().nullable().optional(),
    submitButtonText: z.string().max(40).optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  const [updated] = await db.update(studioVideoForms)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(and(eq(studioVideoForms.id, id), eq(studioVideoForms.userId, user.sub)))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Form not found"), 404);
  return c.json(ok(updated));
});

// DELETE /api/studio/forms/:id
studioFeaturesRoutes.delete("/forms/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const deleted = await db.delete(studioVideoForms)
    .where(and(eq(studioVideoForms.id, id), eq(studioVideoForms.userId, user.sub)))
    .returning({ id: studioVideoForms.id });
  if (deleted.length === 0) return c.json(fail("NOT_FOUND", "Form not found"), 404);
  return c.json(ok({ deleted: deleted[0].id }));
});

// POST /api/studio/forms/:id/submit — public submission from the embedded player
studioFeaturesRoutes.post("/forms/:id/submit", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    answers: z.record(z.string(), z.string().max(2000)),
    timestampSec: z.number().min(0).optional(),
    videoId: z.string().optional(),
    referrer: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  const [form] = await db.select().from(studioVideoForms).where(eq(studioVideoForms.id, id)).limit(1);
  if (!form || !form.isActive) return c.json(fail("NOT_FOUND", "Form not found"), 404);

  // Validate required fields
  const fields = (form.fields as Array<{ key: string; required: boolean; type: string }>) || [];
  for (const f of fields) {
    if (f.required && !parsed.data.answers[f.key]) {
      return c.json(fail("VALIDATION_ERROR", `Required field missing: ${f.key}`), 400);
    }
  }

  const email = parsed.data.answers["email"] ?? null;
  const name = parsed.data.answers["name"] ?? null;
  const company = parsed.data.answers["company"] ?? null;

  const ipCountry = c.req.header("cf-ipcountry") ?? null;

  const [submission] = await db.insert(studioVideoFormSubmissions).values({
    formId: id,
    projectId: form.projectId,
    videoId: parsed.data.videoId ?? null,
    viewerEmail: email,
    viewerName: name,
    answers: parsed.data.answers,
    timestampSec: parsed.data.timestampSec ?? null,
    referrer: parsed.data.referrer ?? null,
    ipCountry,
  } as any).returning();

  // Mirror into global lead inbox (#54 / #38)
  if (email) {
    await db.insert(marketingLeads).values({
      email,
      name,
      company,
      source: "video-form",
      metadata: {
        formId: id,
        projectId: form.projectId,
        formTitle: form.title,
        timestampSec: parsed.data.timestampSec ?? null,
      },
    } as any).catch(() => { /* ignore duplicate-email FKs */ });
  }

  return c.json(ok({
    id: submission.id,
    redirectUrl: form.redirectUrl,
  }), 201);
});

// GET /api/studio/forms/:id/submissions — owner only
studioFeaturesRoutes.get("/forms/:id/submissions", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  // Confirm ownership
  const [form] = await db.select().from(studioVideoForms)
    .where(and(eq(studioVideoForms.id, id), eq(studioVideoForms.userId, user.sub)))
    .limit(1);
  if (!form) return c.json(fail("NOT_FOUND", "Form not found"), 404);

  const submissions = await db.select()
    .from(studioVideoFormSubmissions)
    .where(eq(studioVideoFormSubmissions.formId, id))
    .orderBy(desc(studioVideoFormSubmissions.createdAt))
    .limit(500);

  return c.json(ok({ submissions, total: submissions.length }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  17. REVIEW COMMENTS + SHARE LINKS — gap #145
// ═══════════════════════════════════════════════════════════════════════════════

function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// POST /api/studio/projects/:projectId/review-links — create a public review link
studioFeaturesRoutes.post("/projects/:projectId/review-links", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({
    name: z.string().max(80).optional(),
    expiresInDays: z.number().int().positive().max(365).optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86400_000)
    : null;

  const [link] = await db.insert(studioReviewLinks).values({
    projectId,
    userId: user.sub,
    shareToken: generateShareToken(),
    name: parsed.data.name ?? "Review link",
    expiresAt,
  } as any).returning();

  return c.json(ok(link), 201);
});

// GET /api/studio/projects/:projectId/review-links — owner only
studioFeaturesRoutes.get("/projects/:projectId/review-links", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();
  const links = await db.select().from(studioReviewLinks)
    .where(and(
      eq(studioReviewLinks.projectId, projectId),
      eq(studioReviewLinks.userId, user.sub),
    ))
    .orderBy(desc(studioReviewLinks.createdAt));
  return c.json(ok({ links }));
});

// DELETE /api/studio/review-links/:id
studioFeaturesRoutes.delete("/review-links/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const deleted = await db.delete(studioReviewLinks)
    .where(and(eq(studioReviewLinks.id, id), eq(studioReviewLinks.userId, user.sub)))
    .returning({ id: studioReviewLinks.id });
  if (deleted.length === 0) return c.json(fail("NOT_FOUND", "Link not found"), 404);
  return c.json(ok({ deleted: deleted[0].id }));
});

// GET /api/studio/review/:shareToken — public — resolves a review link to its
// project + comments. Used by anonymous reviewers.
studioFeaturesRoutes.get("/review/:shareToken", async (c) => {
  const token = c.req.param("shareToken");
  const db = getDb();

  const [link] = await db.select().from(studioReviewLinks)
    .where(and(eq(studioReviewLinks.shareToken, token), eq(studioReviewLinks.isActive, true)))
    .limit(1);
  if (!link) return c.json(fail("NOT_FOUND", "Review link not found or inactive"), 404);
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return c.json(fail("EXPIRED", "Review link has expired"), 410);
  }

  const [project] = await db.select().from(schema.studioProjects)
    .where(eq(schema.studioProjects.id, link.projectId))
    .limit(1);

  const comments = await db.select().from(studioReviewComments)
    .where(eq(studioReviewComments.projectId, link.projectId))
    .orderBy(studioReviewComments.createdAt);

  return c.json(ok({
    projectId: link.projectId,
    project: project ? { id: project.id, status: project.status, videoId: project.videoId } : null,
    comments,
    linkName: link.name,
  }));
});

// GET /api/studio/projects/:projectId/comments — owner authenticated read
studioFeaturesRoutes.get("/projects/:projectId/comments", async (c) => {
  const projectId = c.req.param("projectId");
  const db = getDb();
  const comments = await db.select().from(studioReviewComments)
    .where(eq(studioReviewComments.projectId, projectId))
    .orderBy(studioReviewComments.createdAt);
  return c.json(ok({ comments }));
});

// POST /api/studio/projects/:projectId/comments — authenticated post (owner / collaborator)
// Body: { body, timestampSec?, parentId? }
studioFeaturesRoutes.post("/projects/:projectId/comments", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    body: z.string().min(1).max(2000),
    timestampSec: z.number().min(0).nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  const [comment] = await db.insert(studioReviewComments).values({
    projectId,
    parentId: parsed.data.parentId ?? null,
    authorUserId: user.sub,
    authorName: user.email?.split("@")[0] ?? "Reviewer",
    authorEmail: user.email,
    body: parsed.data.body,
    timestampSec: parsed.data.timestampSec ?? null,
  } as any).returning();

  return c.json(ok(comment), 201);
});

// POST /api/studio/review/:shareToken/comments — public anonymous post
studioFeaturesRoutes.post("/review/:shareToken/comments", async (c) => {
  const token = c.req.param("shareToken");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    authorName: z.string().min(1).max(80),
    authorEmail: z.string().email().optional(),
    body: z.string().min(1).max(2000),
    timestampSec: z.number().min(0).nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  const [link] = await db.select().from(studioReviewLinks)
    .where(and(eq(studioReviewLinks.shareToken, token), eq(studioReviewLinks.isActive, true)))
    .limit(1);
  if (!link) return c.json(fail("NOT_FOUND", "Review link not found"), 404);
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return c.json(fail("EXPIRED", "Review link has expired"), 410);
  }

  const [comment] = await db.insert(studioReviewComments).values({
    projectId: link.projectId,
    parentId: parsed.data.parentId ?? null,
    authorUserId: null,
    authorName: parsed.data.authorName,
    authorEmail: parsed.data.authorEmail ?? null,
    body: parsed.data.body,
    timestampSec: parsed.data.timestampSec ?? null,
  } as any).returning();

  return c.json(ok(comment), 201);
});

// PATCH /api/studio/comments/:id — resolve / unresolve
studioFeaturesRoutes.patch("/comments/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ resolved: z.boolean() }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  // Caller must own the project that the comment belongs to.
  const [comment] = await db.select().from(studioReviewComments)
    .where(eq(studioReviewComments.id, id))
    .limit(1);
  if (!comment) return c.json(fail("NOT_FOUND", "Comment not found"), 404);

  const [project] = await db.select().from(schema.studioProjects)
    .where(and(eq(schema.studioProjects.id, comment.projectId), eq(schema.studioProjects.userId, user.sub)))
    .limit(1);
  if (!project) return c.json(fail("FORBIDDEN", "Not allowed"), 403);

  const [updated] = await db.update(studioReviewComments)
    .set({ resolved: parsed.data.resolved } as any)
    .where(eq(studioReviewComments.id, id))
    .returning();
  return c.json(ok(updated));
});

// DELETE /api/studio/comments/:id — owner only
studioFeaturesRoutes.delete("/comments/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [comment] = await db.select().from(studioReviewComments).where(eq(studioReviewComments.id, id)).limit(1);
  if (!comment) return c.json(fail("NOT_FOUND", "Comment not found"), 404);
  const [project] = await db.select().from(schema.studioProjects)
    .where(and(eq(schema.studioProjects.id, comment.projectId), eq(schema.studioProjects.userId, user.sub)))
    .limit(1);
  if (!project) return c.json(fail("FORBIDDEN", "Not allowed"), 403);

  await db.delete(studioReviewComments).where(eq(studioReviewComments.id, id));
  return c.json(ok({ deleted: id }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  18. AI THUMBNAIL GENERATOR — gap #142
// ██
// ██  Heuristic + LLM scoring of candidate frames extracted from a project's
// ██  video. The frames themselves are extracted client-side (browser
// ██  `<canvas>` from `<video>`) and uploaded as data URLs / R2 keys, since
// ██  the Worker runtime cannot decode video frames. The route receives
// ██  candidate frames + their source timestamps, asks an LLM to rank them,
// ██  and persists the ranked candidates so the user can pick one.
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/projects/:projectId/thumbnails/score
// Body: { candidates: Array<{ imageUrl, sourceTimeSec }>, headlineHint? }
studioFeaturesRoutes.post("/projects/:projectId/thumbnails/score", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    candidates: z.array(z.object({
      imageUrl: z.string().url(),
      storageKey: z.string().optional(),
      sourceTimeSec: z.number().min(0).optional(),
    })).min(1).max(12),
    headlineHint: z.string().max(80).optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);

  const db = getDb();

  // Heuristic score: prefer frames slightly past the start (skip the first
  // 1.5 s of typical fade-ins) and that are not in the final 10 % of the video.
  // The LLM step (when an API key is present) refines the ranking.
  const heuristic = parsed.data.candidates.map((cand, i) => {
    const t = cand.sourceTimeSec ?? i;
    let score = 0.5;
    if (t > 1.5) score += 0.15;
    if (t > 5) score += 0.1;
    score += Math.max(0, 0.25 - Math.abs(t - 8) / 100);
    return { ...cand, score: Math.min(1, score) };
  });

  let ranked = heuristic;
  const apiKey = getApiKey(c.env);
  if (apiKey) {
    try {
      const RankSchema = z.object({
        ranked: z.array(z.object({
          index: z.number().int().nonnegative(),
          score: z.number().min(0).max(1),
          reason: z.string().optional(),
        })),
      });
      const llmResult = await callLLMJson(
        apiKey,
        {
          systemPrompt: "You score video thumbnail candidates for click-through rate. Favour frames that show a clear face, strong eye contact, vivid colour contrast, and uncluttered backgrounds. Return JSON only.",
          userMessage: `Score the following ${parsed.data.candidates.length} candidate frames on a 0..1 scale (1 = best CTR). Frames are described only by their position in the video so use position as a tie-breaker.\n\nCandidates: ${parsed.data.candidates.map((c, i) => `[${i}] t=${c.sourceTimeSec ?? "?"}s`).join(", ")}\n\nReturn JSON: { "ranked": [{ "index": 0, "score": 0.8, "reason": "..." }, ...] }`,
          temperature: 0.4,
        },
        RankSchema,
      );
      // Merge LLM scores back onto heuristic order
      ranked = heuristic.map((cand, i) => {
        const llm = llmResult.ranked.find((r) => r.index === i);
        return llm ? { ...cand, score: llm.score } : cand;
      });
    } catch (err) {
      console.warn("[thumbnails/score] LLM scoring failed, falling back to heuristic:", err);
    }
  }

  // Persist all candidates as new rows; clear any prior un-selected candidates.
  await db.delete(studioThumbnails).where(and(
    eq(studioThumbnails.projectId, projectId),
    eq(studioThumbnails.isSelected, false),
  ));

  const inserted = await db.insert(studioThumbnails).values(
    ranked.map((r) => ({
      projectId,
      userId: user.sub,
      imageUrl: r.imageUrl,
      storageKey: r.storageKey ?? null,
      sourceTimeSec: r.sourceTimeSec ?? null,
      headlineText: parsed.data.headlineHint ?? null,
      score: r.score,
      isSelected: false,
    }) as any),
  ).returning();

  return c.json(ok({
    candidates: inserted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
  }), 201);
});

// GET /api/studio/projects/:projectId/thumbnails — list
studioFeaturesRoutes.get("/projects/:projectId/thumbnails", async (c) => {
  const projectId = c.req.param("projectId");
  const db = getDb();
  const rows = await db.select().from(studioThumbnails)
    .where(eq(studioThumbnails.projectId, projectId))
    .orderBy(desc(studioThumbnails.score));
  return c.json(ok({ thumbnails: rows }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  19. AI HOOK OPTIMIZER — gap #143
// ██
// ██  Analyses scene 0 of a storyboard for retention killers and returns 3
// ██  alternative scripted hook variants. Reuses delivery coach signals
// ██  (filler %, pacing) and drop-off data from `studio_video_heatmap` (#122)
// ██  if the project has been published. The model is instructed to keep
// ██  scene `type`, `visual`, and `camera` identical so the rewrite slots
// ██  back into the existing storyboard verbatim.
// ═══════════════════════════════════════════════════════════════════════════════

studioFeaturesRoutes.post("/projects/:projectId/hook/optimize", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    storyboard: z.unknown(),
    /** Optional: explicit videoId to pull retention data from */
    videoId: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);

  const apiKey = getApiKey(c.env);
  if (!apiKey) return c.json(fail("AI_UNAVAILABLE", "LLM API key not configured"), 503);

  const sb = parsed.data.storyboard as { scenes?: Array<Record<string, any>> } | null;
  const scene0 = sb?.scenes?.[0];
  if (!scene0) return c.json(fail("VALIDATION_ERROR", "storyboard has no scenes"), 400);

  const db = getDb();

  // Pull retention signals if a videoId was supplied. We compute the
  // average % of viewers who dropped within the first 3 seconds and the
  // most common drop-off second so the LLM can be told *why* the hook is
  // failing rather than just told to rewrite it.
  let retentionDiagnosis: {
    earlyDropPct: number | null;
    topDropOffSecond: number | null;
    sampleSize: number;
  } = { earlyDropPct: null, topDropOffSecond: null, sampleSize: 0 };

  if (parsed.data.videoId) {
    const views = await db.select().from(studioVideoHeatmap)
      .where(eq(studioVideoHeatmap.videoId, parsed.data.videoId))
      .limit(500);
    if (views.length > 0) {
      const earlyDrops = views.filter((v) => (v.dropOffSecond ?? 999) <= 3).length;
      const dropCounts: Record<number, number> = {};
      for (const v of views) {
        if (v.dropOffSecond != null) {
          dropCounts[v.dropOffSecond] = (dropCounts[v.dropOffSecond] ?? 0) + 1;
        }
      }
      const top = Object.entries(dropCounts).sort(([, a], [, b]) => b - a)[0];
      retentionDiagnosis = {
        earlyDropPct: Math.round((earlyDrops / views.length) * 100),
        topDropOffSecond: top ? Number(top[0]) : null,
        sampleSize: views.length,
      };
    }
  }

  const HookSchema = z.object({
    diagnosis: z.string(),
    variants: z.array(z.object({
      label: z.string(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      text: z.string().optional(),
      rationale: z.string(),
    })).min(1).max(5),
  });

  const retentionContext = retentionDiagnosis.sampleSize > 0
    ? `Retention data from ${retentionDiagnosis.sampleSize} views: ${retentionDiagnosis.earlyDropPct}% of viewers drop within the first 3 seconds. Top drop-off second: ${retentionDiagnosis.topDropOffSecond}s. The current hook is empirically losing viewers.`
    : "No retention data yet — score the current hook against general best-practice patterns for short-form video (face on screen by 1 s, conflict / curiosity gap by 2 s, payoff promised by 3 s).";

  try {
    const result = await callLLMJson(
      apiKey,
      {
        systemPrompt: "You are a short-form video retention expert. You analyse the first 3 seconds of a video script and propose stronger alternative hooks. Hooks must be scripted text — no production directions. Preserve the scene's structural fields (type/visual/camera).",
        userMessage: `Current scene 0:\n${JSON.stringify(scene0, null, 2)}\n\n${retentionContext}\n\nReturn JSON: {\n  "diagnosis": "what is wrong with the current hook in 1-2 sentences",\n  "variants": [\n    { "label": "Curiosity gap", "title": "...", "text": "...", "rationale": "..." },\n    { "label": "Pattern interrupt", ... },\n    { "label": "Bold claim", ... }\n  ]\n}\nGenerate exactly 3 variants.`,
        temperature: 0.7,
      },
      HookSchema,
    );

    return c.json(ok({
      projectId,
      diagnosis: result.diagnosis,
      variants: result.variants,
      retention: retentionDiagnosis,
    }));
  } catch (err) {
    console.error("[hook/optimize] error:", err);
    return c.json(fail("AI_ERROR", `Hook optimizer failed: ${err}`), 500);
  }
});

// PATCH /api/studio/projects/:projectId/thumbnail — select active thumbnail
studioFeaturesRoutes.patch("/projects/:projectId/thumbnail", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ thumbnailId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();

  // Clear existing selection
  await db.update(studioThumbnails)
    .set({ isSelected: false } as any)
    .where(and(
      eq(studioThumbnails.projectId, projectId),
      eq(studioThumbnails.userId, user.sub),
    ));

  const [selected] = await db.update(studioThumbnails)
    .set({ isSelected: true } as any)
    .where(and(
      eq(studioThumbnails.id, parsed.data.thumbnailId),
      eq(studioThumbnails.projectId, projectId),
      eq(studioThumbnails.userId, user.sub),
    ))
    .returning();

  if (!selected) return c.json(fail("NOT_FOUND", "Thumbnail not found"), 404);
  return c.json(ok(selected));
});
