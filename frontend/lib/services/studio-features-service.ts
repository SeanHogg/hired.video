/**
 * Studio Features Service — frontend API client for all new studio capabilities.
 *
 * Covers: TTS, captions, LinkedIn, webcam recording, delivery coaching,
 * ATS packages, interview practice, skills demos, voice cloning,
 * async interviews, and advanced analytics.
 *
 * Facade: the implementation lives in per-area modules under `./studio/`;
 * this file keeps the original import path and export names so every call
 * site and `vi.mock("@/lib/services/studio-features-service")` keeps working.
 */

export * from "./studio/features-types";
export * from "./studio/engagement-types";
export * from "./studio/media-coaching-api";
export * from "./studio/interviews-api";
export * from "./studio/voice-clones-api";
export * from "./studio/analytics-api";
export * from "./studio/stock-media-api";
export * from "./studio/versions-chapters-api";
export * from "./studio/video-forms-api";
export * from "./studio/review-api";
export * from "./studio/thumbnails-hook-api";
