/**
 * Transcription Service — OpenAI Whisper for speech-to-text with word timestamps.
 * Used for:
 *   - Auto-captioning recorded webcam/screen videos
 *   - Delivery coaching (filler word detection, pacing analysis)
 */
import type { JwtPayload } from "../../types/index.js";
import { chargeLedger, type LLMUsage } from "./llm-client.js";

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  durationSec: number;
  words: TranscriptionWord[];
}

export const WHISPER_MODEL = "whisper-1";
/** Whisper bills per audio minute, the ledger in tokens: one minute of audio
 *  is charged as 200 token-equivalents (≈ the transcript of a minute of normal
 *  speech; priced by the `openai-whisper` row in shared/ai-model-rates.ts). */
export const WHISPER_TOKENS_PER_MINUTE = 200;

/** Ledger usage for one Whisper call of `durationSec` seconds of audio. */
export function whisperUsage(durationSec: number): LLMUsage {
  const tokens = Math.max(1, Math.round((Math.max(0, durationSec) / 60) * WHISPER_TOKENS_PER_MINUTE));
  return { promptTokens: 0, completionTokens: tokens, totalTokens: tokens, model: WHISPER_MODEL, requestedModel: WHISPER_MODEL };
}

/**
 * Transcribe audio/video using OpenAI Whisper API with word-level timestamps.
 * The gateway has no audio endpoint, so this is a direct provider call; with
 * `meter`, it is charged to the billed user through the same `chargeLedger`
 * choke point as every gateway call.
 */
export async function transcribeAudio(
  apiKey: string,
  audioBuffer: ArrayBuffer,
  filename: string,
  options?: {
    language?: string;
    prompt?: string;
    meter?: { user: JwtPayload | null | undefined; featureKey: string };
  },
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), filename);
  formData.append("model", WHISPER_MODEL);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  if (options?.language) formData.append("language", options.language);
  if (options?.prompt) formData.append("prompt", options.prompt);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper API ${res.status}: ${errText}`);
  }

  const json = await res.json() as {
    text: string;
    language: string;
    duration: number;
    words?: Array<{ word: string; start: number; end: number }>;
  };

  if (options?.meter) {
    await chargeLedger(options.meter.user, options.meter.featureKey, whisperUsage(json.duration ?? 0), {});
  }

  return {
    text: json.text,
    language: json.language,
    durationSec: json.duration,
    words: (json.words ?? []).map((w) => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    })),
  };
}

/**
 * Analyze delivery metrics from transcription words.
 */
export function analyzeDelivery(
  words: TranscriptionWord[],
  totalDurationSec: number,
): DeliveryMetrics {
  const FILLER_WORDS = new Set(["um", "uh", "like", "you know", "basically", "actually", "literally", "so", "right", "okay"]);

  const fillerHits: Array<{ word: string; timestamp: number }> = [];
  let wordCount = 0;

  for (const w of words) {
    wordCount++;
    const lower = w.word.toLowerCase().replace(/[.,!?]/g, "");
    if (FILLER_WORDS.has(lower)) {
      fillerHits.push({ word: lower, timestamp: w.start });
    }
  }

  const wpm = totalDurationSec > 0 ? Math.round((wordCount / totalDurationSec) * 60) : 0;

  // Pacing score: ideal is 130-170 WPM
  let pacingScore = 100;
  if (wpm < 100) pacingScore = Math.max(20, 100 - (100 - wpm) * 2);
  else if (wpm > 180) pacingScore = Math.max(20, 100 - (wpm - 180) * 2);
  else if (wpm < 130) pacingScore = 70 + ((wpm - 100) / 30) * 30;
  else if (wpm > 170) pacingScore = 70 + ((180 - wpm) / 10) * 30;

  // Filler score: penalise per filler word
  const fillerRatio = wordCount > 0 ? fillerHits.length / wordCount : 0;
  const fillerScore = Math.max(0, Math.round(100 - fillerRatio * 500));

  // Aggregate filler counts
  const fillerCounts: Record<string, number> = {};
  for (const f of fillerHits) {
    fillerCounts[f.word] = (fillerCounts[f.word] ?? 0) + 1;
  }
  const fillerWords = Object.entries(fillerCounts).map(([word, count]) => ({
    word,
    count,
    timestamps: fillerHits.filter((f) => f.word === word).map((f) => f.timestamp),
  }));

  // Vocal variety: measure variance in word durations
  const durations = words.map((w) => w.end - w.start).filter((d) => d > 0);
  const mean = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
  const variance = durations.reduce((a, d) => a + (d - mean) ** 2, 0) / (durations.length || 1);
  const stdDev = Math.sqrt(variance);
  // Higher std dev = more variety = better energy
  const energyScore = Math.min(100, Math.round(stdDev * 300 + 40));

  return {
    wpm,
    pacingScore,
    fillerWords,
    fillerScore,
    totalFillerCount: fillerHits.length,
    energyScore,
    wordCount,
    totalDurationSec,
  };
}

export interface DeliveryMetrics {
  wpm: number;
  pacingScore: number;
  fillerWords: Array<{ word: string; count: number; timestamps: number[] }>;
  fillerScore: number;
  totalFillerCount: number;
  energyScore: number;
  wordCount: number;
  totalDurationSec: number;
}

/**
 * Generate suggestions based on delivery metrics.
 */
export function generateSuggestions(metrics: DeliveryMetrics): Array<{ type: string; message: string }> {
  const suggestions: Array<{ type: string; message: string }> = [];

  if (metrics.wpm < 110) {
    suggestions.push({ type: "pacing", message: `Your pace is ${metrics.wpm} WPM, which is quite slow. Try to speak a bit faster — aim for 130-170 WPM to keep viewers engaged.` });
  } else if (metrics.wpm > 180) {
    suggestions.push({ type: "pacing", message: `Your pace is ${metrics.wpm} WPM, which may feel rushed. Slow down slightly — aim for 130-170 WPM so viewers can follow easily.` });
  }

  if (metrics.totalFillerCount > 3) {
    const topFillers = metrics.fillerWords.sort((a, b) => b.count - a.count).slice(0, 3);
    const fillerList = topFillers.map((f) => `"${f.word}" (${f.count}x)`).join(", ");
    suggestions.push({ type: "filler", message: `You used ${metrics.totalFillerCount} filler words: ${fillerList}. Try pausing silently instead — it sounds more confident.` });
  }

  if (metrics.energyScore < 40) {
    suggestions.push({ type: "energy", message: "Your delivery sounds a bit monotone. Try varying your pitch and speed to emphasize key points and keep it engaging." });
  }

  if (suggestions.length === 0) {
    suggestions.push({ type: "overall", message: "Great delivery! Your pacing, energy, and clarity all look solid." });
  }

  return suggestions;
}
