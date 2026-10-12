/**
 * Studio dubbing client (#1558).
 *
 * Thin wrapper over POST /api/studio/dubbing/translate. Translation
 * runs server-side via the platform LLM; voice synthesis stays on the
 * client (WebGPU TTS engines) so the marketing claim "no per-render
 * fee" holds.
 */
import { apiClient } from "@/lib/api-client";

export interface DubbingCueInput {
  text: string;
  start?: number;
  end?: number;
}

export interface DubbingCueOutput {
  text: string;
  start?: number;
  end?: number;
  /** Echoed back so the UI can render side-by-side review. */
  sourceText: string;
}

export interface DubbingTranslateRequest {
  /** BCP-47 target language code. */
  targetLanguage: string;
  /** BCP-47 source language code. Optional — auto-detect when absent. */
  sourceLanguage?: string;
  cues: DubbingCueInput[];
  context?: string;
}

export interface DubbingTranslateResponse {
  targetLanguage: string;
  targetLabel: string;
  sourceLanguage: string;
  cues: DubbingCueOutput[];
}

export interface DubbingLanguage {
  code: string;
  label: string;
}

export const dubbingService = {
  async listLanguages(): Promise<DubbingLanguage[]> {
    const res = await apiClient.get<DubbingLanguage[]>("/api/studio/dubbing/languages");
    return res.data;
  },

  async translate(req: DubbingTranslateRequest): Promise<DubbingTranslateResponse> {
    const res = await apiClient.post<DubbingTranslateResponse>(
      "/api/studio/dubbing/translate",
      req,
    );
    return res.data;
  },
};
