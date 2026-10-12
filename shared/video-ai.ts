/**
 * Video-AI wire contracts (WP-F): request / response schemas shared by the
 * `/api/video-ai/*` routes and the frontend clients, so the two sides
 * cannot drift. Each schema describes the payload inside `data:`.
 */
import { z } from "zod";

// ─── #289 Sizzle highlight scoring ─────────────────────────────────────────

/** One timed transcript segment from the browser's Whisper pass. */
export const HighlightSegmentSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  text: z.string().max(600),
});
export type HighlightSegment = z.infer<typeof HighlightSegmentSchema>;

/** Bounded so one call stays small (a ~10 min source at Whisper's chunking). */
export const MAX_HIGHLIGHT_SEGMENTS = 120;

export const HighlightScoreRequestSchema = z.object({
  segments: z.array(HighlightSegmentSchema).min(1).max(MAX_HIGHLIGHT_SEGMENTS),
  /** Optional framing ("job-seeker sizzle reel for a product designer"). */
  context: z.string().max(300).optional(),
});
export type HighlightScoreRequest = z.infer<typeof HighlightScoreRequestSchema>;

export const HighlightScoreSchema = z.object({
  index: z.number().int().min(0),
  score: z.number().min(0).max(1),
  reason: z.string().max(160),
});
export const HighlightScoreResponseSchema = z.object({
  scores: z.array(HighlightScoreSchema),
});
export type HighlightScoreResponse = z.infer<typeof HighlightScoreResponseSchema>;

// ─── #1997 Voice-clone calibration script ──────────────────────────────────

export const CalibrationScriptRequestSchema = z.object({
  /** Profile facts the script can mention — headline, role, skills. */
  profileSummary: z.string().max(1500).optional(),
  language: z.string().min(2).max(12).default("en-US"),
});
export type CalibrationScriptRequest = z.infer<typeof CalibrationScriptRequestSchema>;

export const CalibrationScriptResponseSchema = z.object({
  /** ~45 s of read-aloud text covering varied phonemes + intonation. */
  script: z.string().min(80).max(2000),
  suggestedName: z.string().min(1).max(60),
  suggestedDescription: z.string().max(200),
});
export type CalibrationScriptResponse = z.infer<typeof CalibrationScriptResponseSchema>;
