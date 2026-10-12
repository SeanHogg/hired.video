/**
 * Studio features — auto-captions (SRT / WebVTT). Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { ok, fail, studioCaptions } from "./shared.js";

export const captionsRoutes = new Hono<AppEnv>();

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
captionsRoutes.post("/captions/generate", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    projectId: UuidLikeSchema,
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
captionsRoutes.get("/captions/:projectId", async (c) => {
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
