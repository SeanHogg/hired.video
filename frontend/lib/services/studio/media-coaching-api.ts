// Captions, social caption AI, recording, delivery coaching and ATS package
// endpoints — re-exported by studio-features-service.ts.
import { apiClient } from "../../api-client";
import type { VideoPublishPlatform } from "@shared/social-platforms";
import type {
  ATSPackage,
  CaptionResult,
  DeliveryCoachingResult,
  WordTimestamp,
} from "./features-types";

// ─── TTS ────────────────────────────────────────────────────────────────────
//
// All speech synthesis runs entirely client-side via WebGPU TTS engines
// (Web Speech / Kokoro / Piper / VibeVoice). See lib/services/tts-engines.ts
// for the engine facade — there is no server-side TTS API anymore.

// ─── Captions ───────────────────────────────────────────────────────────────

export async function generateCaptions(params: {
  projectId: string;
  wordTimestamps: WordTimestamp[];
  style?: "standard" | "bold-pop" | "word-by-word" | "lower-thirds";
  language?: string;
  wordsPerCue?: number;
}): Promise<CaptionResult> {
  const res = await apiClient.post<CaptionResult>("/api/studio/captions/generate", params);
  return res.data;
}

export async function getCaptions(projectId: string): Promise<CaptionResult | null> {
  const res = await apiClient.get<CaptionResult | null>(`/api/studio/captions/${projectId}`);
  return res.data;
}

// ─── Social caption ─────────────────────────────────────────────────────────

// Posting runs through studioService.publishToSocial(…, platform, …) and the
// connection through socialService (social_connections); only the caption AI
// ("Write it for me") lives here.

export async function generateSocialCaption(params: {
  projectId: string;
  tone?: "professional" | "casual" | "bold" | "story";
  /** The networks the post goes to — the caption fits the tightest limit. */
  platforms?: VideoPublishPlatform[];
}): Promise<{ hook: string; caption: string; hashtags: string[] }> {
  const res = await apiClient.post<{ hook: string; caption: string; hashtags: string[] }>(
    "/api/studio/social/generate-caption",
    params,
  );
  return res.data;
}

// ─── Recording ──────────────────────────────────────────────────────────────

export async function uploadRecording(
  file: File,
  type: "webcam" | "screen" | "screen+webcam",
  projectId?: string,
  durationMs?: number,
): Promise<{ id: string; videoUrl: string | null }> {
  const formData = new FormData();
  formData.append("video", file);
  formData.append("type", type);
  if (projectId) formData.append("projectId", projectId);
  if (durationMs) formData.append("durationMs", String(durationMs));

  const res = await apiClient.post<{ id: string; videoUrl: string | null }>("/api/studio/recording/upload", formData);
  return res.data;
}

export async function transcribeRecording(
  recordingId: string,
  audioFile: File,
): Promise<{ text: string; language: string; durationSec: number; words: WordTimestamp[] }> {
  const formData = new FormData();
  formData.append("audio", audioFile);
  const res = await apiClient.post<{ text: string; language: string; durationSec: number; words: WordTimestamp[] }>(
    `/api/studio/recording/${recordingId}/transcribe`,
    formData,
  );
  return res.data;
}

// ─── Delivery Coaching ──────────────────────────────────────────────────────

export async function analyzeDelivery(params: {
  recordingId: string;
  projectId?: string;
  words: WordTimestamp[];
  totalDurationSec: number;
  scriptText?: string;
  transcribedText?: string;
}): Promise<DeliveryCoachingResult> {
  const res = await apiClient.post<DeliveryCoachingResult>("/api/studio/coaching/analyze", params);
  return res.data;
}

export async function getCoachingResults(recordingId: string): Promise<DeliveryCoachingResult | null> {
  const res = await apiClient.get<DeliveryCoachingResult | null>(`/api/studio/coaching/${recordingId}`);
  return res.data;
}

// ─── ATS Package ────────────────────────────────────────────────────────────

export async function generateATSPackage(params: {
  projectId: string;
  candidateName: string;
  headline?: string;
  linkedinUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  scriptText: string;
}): Promise<ATSPackage> {
  const res = await apiClient.post<ATSPackage>("/api/studio/ats/generate", params);
  return res.data;
}
