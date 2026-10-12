/**
 * Sizzle-reel highlight scoring (#289) — the LLM half of the `whisper-llm`
 * engine. The browser transcribes the source with Whisper (WebGPU/WASM,
 * $0) and sends timed segments; this asks the model which moments carry
 * the most narrative value for a reel. Pure over an injected LLM client.
 */
import type { LLMClient, LLMCallOpts } from "../adapters/llm-client.js";
import {
  HighlightScoreResponseSchema,
  type HighlightScoreRequest,
  type HighlightScoreResponse,
} from "../../../../shared/video-ai.js";

export const HIGHLIGHT_SYSTEM_PROMPT = `You pick highlight moments for a short career "sizzle reel" video.
You receive numbered transcript segments with timestamps. Score EVERY segment 0..1 for how strong it is as a highlight:
- high (0.7-1): a concrete achievement, a number/outcome, a vivid story beat, a confident one-line claim, humour that lands
- middle (0.3-0.7): relevant but generic context
- low (0-0.3): filler, false starts, "um", greetings, logistics, trailing off
Judge only what is said. Do not invent content.
Return ONLY JSON: {"scores":[{"index":<segment number>,"score":<0..1>,"reason":"<= 12 words why"}]}`;

export function buildHighlightUserMessage(input: HighlightScoreRequest): string {
  const lines = input.segments.map(
    (s, i) => `#${i} [${s.startSec.toFixed(1)}-${s.endSec.toFixed(1)}s] ${s.text.replace(/\s+/g, " ").trim()}`,
  );
  const context = input.context ? `Reel context: ${input.context}\n\n` : "";
  return `${context}Segments:\n${lines.join("\n")}\n\nScore every segment.`;
}

/** Keep only scores that point at a real segment, one per index (last
 *  wins), sorted by index — the model's array is advisory. */
export function normalizeHighlightScores(
  raw: HighlightScoreResponse,
  segmentCount: number,
): HighlightScoreResponse {
  const byIndex = new Map<number, HighlightScoreResponse["scores"][number]>();
  for (const s of raw.scores) {
    if (s.index >= 0 && s.index < segmentCount) byIndex.set(s.index, s);
  }
  return { scores: Array.from(byIndex.values()).sort((a, b) => a.index - b.index) };
}

export async function scoreTranscriptHighlights(
  llm: LLMClient,
  input: HighlightScoreRequest,
  opts?: LLMCallOpts,
): Promise<HighlightScoreResponse> {
  const { data } = await llm.callJson(
    "sizzle_highlight_score",
    {
      useCase: "sizzle_highlights",
      systemPrompt: HIGHLIGHT_SYSTEM_PROMPT,
      userMessage: buildHighlightUserMessage(input),
    },
    HighlightScoreResponseSchema,
    opts,
  );
  return normalizeHighlightScores(data, input.segments.length);
}
