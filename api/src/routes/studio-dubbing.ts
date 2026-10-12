/**
 * Studio dubbing — multi-language caption translation (#1558).
 *
 * The client pipeline is:
 *   1. Take the project's caption cues (or transcribe a voiceover with
 *      the existing OpenAI Whisper adapter).
 *   2. POST those cues here. The route calls the platform LLM to
 *      translate each cue to the target language, preserving timing.
 *   3. The client runs the user's cloned voice through one of the
 *      WebGPU TTS engines (Kokoro / Piper / VibeVoice) on the translated
 *      strings to produce a parallel audio track.
 *   4. The dubbed audio appends as a new VoiceoverClip in CanvasState.
 *
 * The translation step is server-side because it's a cheap LLM call
 * that benefits from prompt caching + the platform's token-budget /
 * usage-tracking middleware. Voice cloning + audio synthesis stays
 * client-side per the existing WebGPU architecture so there's no
 * per-minute render bill.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  createLLMClient,
  hasAnyLLMProviderKey,
} from "../services/adapters/llm-client.js";
import { transcribeAudio } from "../services/adapters/transcription.js";

export const studioDubbingRoutes = new Hono<AppEnv>();

const TranslateCueSchema = z.object({
  text: z.string().min(1),
  start: z.number().nonnegative().optional(),
  end: z.number().nonnegative().optional(),
});

const TranslateRequestSchema = z.object({
  /** BCP-47 target language code (e.g. "es", "fr-CA", "ja", "pt-BR"). */
  targetLanguage: z.string().min(2).max(16),
  /** BCP-47 source language code. Optional — when absent the LLM
   *  auto-detects from the text. */
  sourceLanguage: z.string().min(2).max(16).optional(),
  /** Caption cues to translate, in order. */
  cues: z.array(TranslateCueSchema).min(1).max(500),
  /** Optional context — the project's title or description. Helps the
   *  LLM disambiguate (e.g. "Customer interview" vs "Job interview"). */
  context: z.string().max(500).optional(),
});

// Supported targets — surfaced to the UI so the language picker stays
// in sync with what the platform actually translates well. Mirrors the
// 20+ languages the dubbing marketing claim cites.
export const SUPPORTED_DUBBING_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "fr-CA", label: "French (Canada)" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "nl", label: "Dutch" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "sv", label: "Swedish" },
];

studioDubbingRoutes.get("/dubbing/languages", (c) => {
  return c.json(success(SUPPORTED_DUBBING_LANGUAGES), 200);
});

// #1561 — Transcribe a voiceover audio track into caption cues, then
// translate. Closes the dub-from-voiceover-only flow that the FAQ
// advertised but didn't implement.
//
//   POST /dubbing/transcribe { audioUrl, sourceLanguage?, targetLanguage,
//                              chunkLengthSec? }
//     → fetches the audio, calls Whisper, groups words into ~chunkLengthSec
//       cues with start/end times, then calls the existing translate flow
//       so the caller gets dub-ready cues in a single round-trip.
const TranscribeRequestSchema = z.object({
  audioUrl: z.string().url(),
  targetLanguage: z.string().min(2).max(16),
  sourceLanguage: z.string().min(2).max(16).optional(),
  chunkLengthSec: z.number().min(1).max(20).default(6),
  context: z.string().max(500).optional(),
});

studioDubbingRoutes.post("/dubbing/transcribe", async (c) => {
  if (!c.var.user) return c.json(error("AUTH_REQUIRED", "Auth required"), 401);
  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.json(error("PROVIDER_UNAVAILABLE", "Whisper transcription not configured (OPENAI_API_KEY)"), 503);
  }
  const parsed = TranscribeRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("INVALID_REQUEST", "Invalid request", parsed.error.issues), 400);
  }
  const { audioUrl, targetLanguage, sourceLanguage, chunkLengthSec, context } = parsed.data;

  let transcription;
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return c.json(error("FETCH_FAILED", `Could not fetch audioUrl (${audioRes.status})`), 502);
    }
    const buf = await audioRes.arrayBuffer();
    const filename = new URL(audioUrl).pathname.split("/").pop() || "audio.wav";
    transcription = await transcribeAudio(apiKey, buf, filename, { language: sourceLanguage });
  } catch (err) {
    return c.json(
      error("TRANSCRIPTION_FAILED", err instanceof Error ? err.message : "Whisper call failed"),
      502,
    );
  }

  // Group words into cues of ~chunkLengthSec each. Closes a cue when
  // the running duration crosses the threshold OR when a sentence
  // terminator lands on a word boundary.
  interface Cue { text: string; start: number; end: number }
  const cues: Cue[] = [];
  let current: { words: string[]; start: number; end: number } | null = null;
  for (const w of transcription.words) {
    if (!current) {
      current = { words: [w.word], start: w.start, end: w.end };
      continue;
    }
    current.words.push(w.word);
    current.end = w.end;
    const duration = current.end - current.start;
    const endsSentence = /[.!?]$/.test(w.word);
    if (duration >= chunkLengthSec || endsSentence) {
      cues.push({ text: current.words.join(" "), start: current.start, end: current.end });
      current = null;
    }
  }
  if (current) cues.push({ text: current.words.join(" "), start: current.start, end: current.end });

  if (cues.length === 0) {
    return c.json(error("TRANSCRIPTION_EMPTY", "Whisper returned no usable words"), 502);
  }

  // Hand off to the existing translator. We round-trip through the
  // same code path the in-memory caption flow uses, so a future
  // translator improvement automatically lifts both surfaces.
  const translatePayload = {
    targetLanguage,
    sourceLanguage: sourceLanguage ?? transcription.language,
    cues,
    context,
  };
  const translateReq = new Request(
    new URL("./dubbing/translate", c.req.url).toString(),
    {
      method: "POST",
      headers: { "content-type": "application/json", ...Object.fromEntries(c.req.raw.headers.entries()) },
      body: JSON.stringify(translatePayload),
    },
  );
  const translateRes = await studioDubbingRoutes.fetch(translateReq, c.env as any);
  return new Response(await translateRes.text(), {
    status: translateRes.status,
    headers: translateRes.headers,
  });
});

studioDubbingRoutes.post("/dubbing/translate", async (c) => {
  if (!c.var.user) return c.json(error("AUTH_REQUIRED", "Auth required"), 401);
  if (!hasAnyLLMProviderKey(c.env as any)) {
    return c.json(error("PROVIDER_UNAVAILABLE", "Translation provider not configured"), 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = TranslateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("INVALID_REQUEST", "Invalid request", parsed.error.issues), 400);
  }
  const { targetLanguage, sourceLanguage, cues, context } = parsed.data;

  const targetLabel =
    SUPPORTED_DUBBING_LANGUAGES.find((l) => l.code === targetLanguage)?.label ??
    targetLanguage;

  // One LLM round-trip translates the whole batch — preserves timing
  // metadata + cue indexes so the client can pair the result back with
  // the original cue boundaries. JSON in / JSON out so vendor-side
  // schema retry catches malformed responses.
  const llm = createLLMClient(c.env as any, c.var.user);

  const userMessage = JSON.stringify({
    targetLanguage,
    targetLabel,
    sourceLanguage: sourceLanguage ?? "auto-detect",
    context: context ?? "",
    cues: cues.map((cue, idx) => ({ idx, text: cue.text })),
  });

  const systemPrompt = `You are a professional video-dubbing translator. Translate every caption cue from the source language to ${targetLabel} (${targetLanguage}).

RULES:
- Preserve the cue array order and the original idx.
- Keep each translation roughly the same speaking length as the original (so the dub fits the original timing). Use natural ${targetLabel} idiom; avoid word-for-word literalism that doubles the duration.
- Preserve proper nouns, brand names, product names, and code identifiers verbatim.
- Preserve emphasis (caps, !) where idiomatic in ${targetLabel}.
- Return STRICT JSON only, matching this schema:
  { "translations": [ { "idx": number, "text": string } ] }
- DO NOT include the source text, explanations, or alternative renderings.`;

  let translations: Array<{ idx: number; text: string }> = [];
  try {
    const { content } = await llm.callText(
      "studio_dubbing_translate",
      {
        // Reuses the existing studio_misc profile — translation is a
        // simple text-in/text-out call that doesn't warrant a dedicated
        // model + budget profile. If the volume justifies one later,
        // add a `studio_dubbing` entry to USE_CASE_PROFILES.
        useCase: "studio_misc",
        systemPrompt,
        userMessage,
        responseFormat: "json_object",
      },
    );
    const match = content.match(/\{[\s\S]*\}/);
    const json = match ? JSON.parse(match[0]) : null;
    if (!Array.isArray(json?.translations)) {
      return c.json(error("TRANSLATOR_EMPTY", "Translator returned no usable cues"), 502);
    }
    translations = json.translations.filter(
      (t: unknown): t is { idx: number; text: string } =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as { idx: unknown }).idx === "number" &&
        typeof (t as { text: unknown }).text === "string",
    );
  } catch (err) {
    return c.json(
      error(
        "TRANSLATION_FAILED",
        `Translation failed: ${err instanceof Error ? err.message : "unknown"}`,
      ),
      502,
    );
  }

  // Pair translated text back with the original cue boundaries so the
  // caller doesn't have to keep its own index. Missing translations
  // fall back to the original text so a partial result is still
  // playable.
  const byIdx = new Map(translations.map((t) => [t.idx, t.text]));
  const dubbed = cues.map((cue, idx) => ({
    text: byIdx.get(idx) ?? cue.text,
    start: cue.start,
    end: cue.end,
    /** Source text — surfaced so the UI can show a side-by-side review
     *  before the user commits the dubbed track. */
    sourceText: cue.text,
  }));

  return c.json(
    success({
      targetLanguage,
      targetLabel,
      sourceLanguage: sourceLanguage ?? "auto",
      cues: dubbed,
    }),
    200,
  );
});
