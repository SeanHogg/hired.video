/**
 * Studio Features Routes — gap-closing endpoints for the AI video studio.
 *
 * Mounts at /api/studio and extends the existing studioRoutes with:
 *   - Auto-captions (from in-browser TTS timestamps or Whisper)
 *   - LinkedIn caption AI ("Write it for me")
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

// The routes live in one module per section under routes/studio-features/;
// this barrel composes them, IN THE ORIGINAL REGISTRATION ORDER, into the
// single router app.ts and hot-routes.ts import. Order matters where a static
// path and a `:param` path share a prefix (e.g. /voice-clones/library before
// /voice-clones/:id), so append new sections, don't reorder.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { captionsRoutes } from "./studio-features/captions.js";
import { socialCaptionRoutes } from "./studio-features/social-caption.js";
import { recordingRoutes } from "./studio-features/recording.js";
import { coachingRoutes } from "./studio-features/coaching.js";
import { atsRoutes } from "./studio-features/ats.js";
import { interviewRoutes } from "./studio-features/interview.js";
import { skillsDemoRoutes } from "./studio-features/skills-demos.js";
import { voiceCloneReadRoutes } from "./studio-features/voice-clones-read.js";
import { voiceCloneWriteRoutes } from "./studio-features/voice-clones-write.js";
import { asyncInterviewRoutes } from "./studio-features/async-interviews.js";
import { analyticsRoutes } from "./studio-features/analytics.js";
import { stockMediaRoutes } from "./studio-features/stock-media.js";
import { versionRoutes } from "./studio-features/versions.js";
import { chapterRoutes } from "./studio-features/chapters.js";
import { scriptRewriterRoutes } from "./studio-features/script-rewriter.js";
import { formRoutes } from "./studio-features/forms.js";
import { reviewRoutes } from "./studio-features/review.js";
import { thumbnailRoutes } from "./studio-features/thumbnails.js";
import { hookOptimizerRoutes } from "./studio-features/hook-optimizer.js";

export const studioFeaturesRoutes = new Hono<AppEnv>();

for (const section of [
  captionsRoutes,
  socialCaptionRoutes,
  recordingRoutes,
  coachingRoutes,
  atsRoutes,
  interviewRoutes,
  skillsDemoRoutes,
  voiceCloneReadRoutes,
  voiceCloneWriteRoutes,
  asyncInterviewRoutes,
  analyticsRoutes,
  stockMediaRoutes,
  versionRoutes,
  chapterRoutes,
  scriptRewriterRoutes,
  formRoutes,
  reviewRoutes,
  thumbnailRoutes,
  hookOptimizerRoutes,
]) {
  studioFeaturesRoutes.route("/", section);
}
