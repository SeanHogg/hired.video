/**
 * Frontend client for /api/video-pitch/* — the lightweight AI-script
 * helper backing the Video Pitch Lab tool.
 *
 * The pitch URL itself is uploaded via the existing `uploadRecording`
 * studio-features path (the tool just renders WebcamRecorderWithUpload),
 * so there's no pitch-specific persistence endpoint yet — only the script
 * generator lives here.
 */

import { apiClient } from "../api-client";

export interface GeneratePitchScriptRequest {
  resumeId?: string;
  length: 30 | 60 | 90;
  tone: "casual" | "professional" | "enthusiastic";
}

export interface GeneratePitchScriptResponse {
  script: string;
  /** Estimated word count target for the chosen length, exposed so the UI
   *  can show "you're 30 words over the 60-second budget" later if needed. */
  targetWordCount: number;
}

export async function generatePitchScript(
  req: GeneratePitchScriptRequest,
): Promise<GeneratePitchScriptResponse> {
  const res = await apiClient.post<GeneratePitchScriptResponse>(
    "/api/video-pitch/script",
    req,
  );
  return res.data;
}

// ─── Durable pitch URL (#1237) ─────────────────────────────────────────────

export interface PitchProfile {
  videoPitchUrl: string | null;
  videoPitchSetAt: string | null;
}

export async function getPitchProfile(): Promise<PitchProfile> {
  const res = await apiClient.get<PitchProfile>("/api/video-pitch/profile");
  return res.data;
}

export async function setPitchProfile(videoPitchUrl: string | null): Promise<PitchProfile> {
  const res = await apiClient.put<PitchProfile>("/api/video-pitch/profile", { videoPitchUrl });
  return res.data;
}
