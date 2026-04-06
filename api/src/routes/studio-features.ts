/**
 * Studio Features Routes — gap-closing endpoints for the AI video studio.
 *
 * Mounts at /api/studio and extends the existing studioRoutes with:
 *   - TTS voiceover generation (ElevenLabs)
 *   - Auto-captions (from TTS timestamps or Whisper)
 *   - LinkedIn publishing
 *   - Webcam recording upload + transcription
 *   - AI delivery coaching
 *   - ATS-compatible output package
 *   - Interview question library + practice sessions
 *   - Skills demonstration videos
 *   - Voice cloning
 *   - Async employer video interviews
 *   - Advanced per-second analytics (heatmap)
 */

import { Hono } from "hono";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLM, getApiKey } from "../services/ai.js";
import { generateSpeech, getVoices, cloneVoice, wordTimestampsToSrt, wordTimestampsToVtt } from "../services/tts.js";
import { transcribeAudio, analyzeDelivery, generateSuggestions } from "../services/transcription.js";
import { cdnUrl } from "../utils/cdn.js";

const {
  studioVoiceovers, studioVoiceClones, studioCaptions,
  linkedinAccounts, studioRecordings, studioDeliveryCoaching,
  studioAtsPackages, studioInterviewQuestions, studioInterviewSessions,
  studioSkillsDemos, studioAsyncInterviews, studioAsyncResponses,
  studioVideoHeatmap,
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

// ═══════════════════════════════════════════════════════════════════════════════
// ██  1. TTS VOICEOVER (ElevenLabs)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/tts/voices — list available voices
studioFeaturesRoutes.get("/tts/voices", async (c) => {
  const apiKey = c.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    // Return a curated default list when API key not configured
    return c.json(ok({
      voices: [
        { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", category: "premade", labels: { accent: "american", gender: "female" } },
        { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", category: "premade", labels: { accent: "american", gender: "female" } },
        { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", category: "premade", labels: { accent: "american", gender: "female" } },
        { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni", category: "premade", labels: { accent: "american", gender: "male" } },
        { voice_id: "VR6AewLTigWG4xSOukaG", name: "Arnold", category: "premade", labels: { accent: "american", gender: "male" } },
        { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", category: "premade", labels: { accent: "american", gender: "male" } },
        { voice_id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", category: "premade", labels: { accent: "american", gender: "male" } },
        { voice_id: "jBpfuIE2acCO8z3wKNLl", name: "Gigi", category: "premade", labels: { accent: "american", gender: "female" } },
      ],
    }));
  }

  try {
    const voices = await getVoices(apiKey);
    return c.json(ok({ voices }));
  } catch (err) {
    console.error("[tts/voices] error:", err);
    return c.json(fail("TTS_ERROR", "Failed to fetch voices"), 500);
  }
});

// POST /api/studio/tts/generate — generate voiceover for text
studioFeaturesRoutes.post("/tts/generate", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    text: z.string().min(1).max(5000),
    voiceId: z.string().default("21m00Tcm4TlvDq8ikWAM"),
    voiceName: z.string().optional(),
    projectId: z.string().uuid().optional(),
    sceneId: z.string().optional(),
    speed: z.number().min(0.5).max(2.0).optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const apiKey = c.env.ELEVENLABS_API_KEY;
  if (!apiKey) return c.json(fail("TTS_UNAVAILABLE", "ElevenLabs API key not configured"), 503);

  const db = getDb();

  // Create pending record
  const [voiceover] = await db.insert(studioVoiceovers).values({
    userId: user.sub,
    projectId: parsed.data.projectId ?? null,
    sceneId: parsed.data.sceneId ?? null,
    voiceId: parsed.data.voiceId,
    voiceName: parsed.data.voiceName ?? null,
    text: parsed.data.text,
    status: "generating",
  } as any).returning();

  try {
    const result = await generateSpeech(apiKey, parsed.data.text, parsed.data.voiceId, {
      speed: parsed.data.speed,
    });

    // Upload audio to R2/S3
    let audioUrl: string | null = null;
    let audioKey: string | null = null;
    if (canUseObjectStorage()) {
      audioKey = `studio/tts/${user.sub}/${voiceover.id}.mp3`;
      const s3 = getS3Client();
      await s3.send(new PutObjectCommand({
        Bucket: getBucket(),
        Key: audioKey,
        Body: Buffer.from(result.audioBuffer),
        ContentType: result.contentType,
        Metadata: { userId: user.sub, voiceoverId: voiceover.id },
      }));
      audioUrl = cdnUrl(audioKey);
    }

    // Update record with results
    const [updated] = await db.update(studioVoiceovers).set({
      audioUrl,
      audioKey,
      durationMs: result.durationMs,
      wordTimestamps: result.wordTimestamps,
      status: "ready",
    } as any).where(eq(studioVoiceovers.id, voiceover.id)).returning();

    return c.json(ok({
      id: updated.id,
      audioUrl,
      durationMs: result.durationMs,
      wordTimestamps: result.wordTimestamps,
      status: "ready",
    }), 201);
  } catch (err) {
    console.error("[tts/generate] error:", err);
    await db.update(studioVoiceovers).set({ status: "failed" } as any).where(eq(studioVoiceovers.id, voiceover.id));
    return c.json(fail("TTS_GENERATION_FAILED", `TTS generation failed: ${err}`), 500);
  }
});

// POST /api/studio/tts/generate-all — generate voiceover for all scenes in a project
studioFeaturesRoutes.post("/tts/generate-all", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    scenes: z.array(z.object({
      sceneId: z.string(),
      text: z.string().min(1),
    })),
    voiceId: z.string().default("21m00Tcm4TlvDq8ikWAM"),
    voiceName: z.string().optional(),
    projectId: z.string().uuid().optional(),
    speed: z.number().min(0.5).max(2.0).optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body"), 400);

  const apiKey = c.env.ELEVENLABS_API_KEY;
  if (!apiKey) return c.json(fail("TTS_UNAVAILABLE", "ElevenLabs API key not configured"), 503);

  const results: Array<{
    sceneId: string;
    audioUrl: string | null;
    durationMs: number;
    wordTimestamps: Array<{ word: string; start: number; end: number }>;
  }> = [];

  for (const scene of parsed.data.scenes) {
    try {
      const result = await generateSpeech(apiKey, scene.text, parsed.data.voiceId, {
        speed: parsed.data.speed,
      });

      let audioUrl: string | null = null;
      if (canUseObjectStorage()) {
        const audioKey = `studio/tts/${user.sub}/${parsed.data.projectId ?? "adhoc"}/${scene.sceneId}.mp3`;
        const s3 = getS3Client();
        await s3.send(new PutObjectCommand({
          Bucket: getBucket(),
          Key: audioKey,
          Body: Buffer.from(result.audioBuffer),
          ContentType: result.contentType,
        }));
        audioUrl = cdnUrl(audioKey);
      }

      const db = getDb();
      await db.insert(studioVoiceovers).values({
        userId: user.sub,
        projectId: parsed.data.projectId ?? null,
        sceneId: scene.sceneId,
        voiceId: parsed.data.voiceId,
        voiceName: parsed.data.voiceName ?? null,
        text: scene.text,
        audioUrl,
        durationMs: result.durationMs,
        wordTimestamps: result.wordTimestamps,
        status: "ready",
      } as any);

      results.push({
        sceneId: scene.sceneId,
        audioUrl,
        durationMs: result.durationMs,
        wordTimestamps: result.wordTimestamps,
      });
    } catch (err) {
      console.error(`[tts/generate-all] scene ${scene.sceneId} error:`, err);
      results.push({ sceneId: scene.sceneId, audioUrl: null, durationMs: 0, wordTimestamps: [] });
    }
  }

  return c.json(ok({ results }), 201);
});

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

  const srtContent = wordTimestampsToSrt(timestamps, wordsPerCue);
  const vttContent = wordTimestampsToVtt(timestamps, wordsPerCue);

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

  if (canUseObjectStorage()) {
    const bytes = await file.arrayBuffer();
    videoKey = `studio/recordings/${user.sub}/${Date.now()}-${file.name || "recording.webm"}`;
    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: getBucket(),
      Key: videoKey,
      Body: Buffer.from(bytes),
      ContentType: file.type || "video/webm",
    }));
    videoUrl = cdnUrl(videoKey);
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
// ██  9. VOICE CLONING
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/voice-clones — list user's cloned voices
studioFeaturesRoutes.get("/voice-clones", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const clones = await db.select().from(studioVoiceClones)
    .where(eq(studioVoiceClones.userId, user.sub))
    .orderBy(desc(studioVoiceClones.createdAt));

  return c.json(ok(clones));
});

// POST /api/studio/voice-clones — create a voice clone
studioFeaturesRoutes.post("/voice-clones", async (c) => {
  const user = c.var.user;
  const apiKey = c.env.ELEVENLABS_API_KEY;
  if (!apiKey) return c.json(fail("TTS_UNAVAILABLE", "ElevenLabs not configured"), 503);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json(fail("VALIDATION_ERROR", "Invalid form data"), 400);

  const name = String(form.get("name") ?? "My Voice");
  const description = String(form.get("description") ?? "");
  const audioFile = form.get("audio") as File | null;
  if (!audioFile) return c.json(fail("VALIDATION_ERROR", "Missing audio sample"), 400);

  const db = getDb();

  // Upload sample to R2
  let sampleUrl: string | null = null;
  let sampleKey: string | null = null;
  if (canUseObjectStorage()) {
    const bytes = await audioFile.arrayBuffer();
    sampleKey = `studio/voice-clones/${user.sub}/${Date.now()}-sample.mp3`;
    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: getBucket(),
      Key: sampleKey,
      Body: Buffer.from(bytes),
      ContentType: audioFile.type || "audio/mpeg",
    }));
    sampleUrl = cdnUrl(sampleKey);
  }

  const [clone] = await db.insert(studioVoiceClones).values({
    userId: user.sub,
    name,
    sampleAudioUrl: sampleUrl,
    sampleAudioKey: sampleKey,
    status: "processing",
  } as any).returning();

  try {
    const audioBuffer = await audioFile.arrayBuffer();
    const result = await cloneVoice(apiKey, name, [
      { buffer: audioBuffer, filename: audioFile.name || "sample.mp3", type: audioFile.type || "audio/mpeg" },
    ], description);

    await db.update(studioVoiceClones).set({
      externalVoiceId: result.voice_id,
      status: "ready",
      updatedAt: new Date(),
    } as any).where(eq(studioVoiceClones.id, clone.id));

    return c.json(ok({
      id: clone.id,
      name: result.name,
      externalVoiceId: result.voice_id,
      status: "ready",
    }), 201);
  } catch (err) {
    await db.update(studioVoiceClones).set({ status: "failed" } as any).where(eq(studioVoiceClones.id, clone.id));
    return c.json(fail("CLONE_FAILED", `Voice cloning failed: ${err}`), 500);
  }
});

// DELETE /api/studio/voice-clones/:id — delete a voice clone
studioFeaturesRoutes.delete("/voice-clones/:id", async (c) => {
  const user = c.var.user;
  const cloneId = c.req.param("id");
  const db = getDb();

  const [deleted] = await db.delete(studioVoiceClones)
    .where(and(eq(studioVoiceClones.id, cloneId), eq(studioVoiceClones.userId, user.sub)))
    .returning();

  if (!deleted) return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);
  return c.json(ok({ id: cloneId }));
});

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

// GET /api/studio/analytics/:videoId — aggregated analytics for a video
studioFeaturesRoutes.get("/analytics/:videoId", async (c) => {
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
