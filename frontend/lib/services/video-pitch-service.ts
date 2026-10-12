/**
 * Frontend client for /api/video-pitch/* — the AI-script helper and the
 * "current pitch" pointer backing the Video Pitch Lab tool.
 *
 * The pitch itself is an ordinary studio project (`purpose: "pitch"`); its
 * takes are uploaded via the existing `uploadRecording` studio-features
 * path (the tool renders WebcamRecorderWithUpload with the project id).
 */

import type { PitchSummary } from "@shared/pitch";
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

// ─── Current pitch (#1237) ─────────────────────────────────────────────────
//
// The pitch is a studio project with `purpose: "pitch"` (created via
// studioService.saveDraft, takes via uploadRecording with its projectId).
// These calls only read / move the per-user "current pitch" pointer.

export async function getCurrentPitch(): Promise<PitchSummary | null> {
  const res = await apiClient.get<{ pitch: PitchSummary | null }>("/api/video-pitch/current");
  return res.data.pitch;
}

/** "Set as my pitch" — or pass `null` to remove the pitch from the profile. */
export async function setCurrentPitch(projectId: string | null): Promise<PitchSummary | null> {
  const res = await apiClient.put<{ pitch: PitchSummary | null }>("/api/video-pitch/current", { projectId });
  return res.data.pitch;
}
