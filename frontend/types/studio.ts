import type { VideoScript, VoiceoverConfig, CaptionConfig } from "./video-script";
import type { CompiledVideo } from "../lib/compiler/types";
import type { StudioPurpose } from "../lib/services/studio-service";

export type StudioStatus =
  | "idle"
  | "generating"
  | "ready"
  | "exporting"
  | "uploading"
  | "publishing"
  | "done"
  | "error";

export interface StudioProjectState {
  id?: string;
  name: string;
  prompt: string;
  resumeText: string;
  resumeId?: string;            // references resumeInformation.id
  jobDescription?: string;      // Feature G3: video for this job
  script: VideoScript | null;   // replaces legacy storyboard
  /** Full template VideoScript — theme is re-applied after each regeneration */
  activeTemplate: VideoScript | null;
  compiledVideo: CompiledVideo | null;
  /** Local exported blob — transient, only set after a fresh export. Optional for paid users. */
  videoBlob: Blob | null;
  /** Hosted video URL (R2 CDN or YouTube) — persisted server-side, restored on project load. */
  videoUrl: string | null;
  /** Public thumbnail URL (R2 CDN) — restored on project load. */
  thumbnailUrl: string | null;
  projectId: string | null;
  youtubeVideoId: string | null;
  status: StudioStatus;
  // Content template purpose
  purpose: StudioPurpose;       // default "resume"
  // AI settings
  model: string;                // default "qwen/qwen3.6-plus:free"
  temperature: number;          // 0–1
  // Video settings
  resolution: "720p" | "1080p" | "4k";
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3";
  targetDuration: number;       // seconds
  motion: "minimal" | "moderate" | "cinematic";
  // TTS voiceover
  voiceover: VoiceoverConfig | null;
  // Captions
  captions: CaptionConfig | null;
}

export const defaultStudioState: Omit<StudioProjectState, "script" | "activeTemplate" | "compiledVideo" | "videoBlob" | "videoUrl" | "thumbnailUrl" | "projectId" | "youtubeVideoId"> = {
  name: "New Video Resume",
  prompt: "Create a professional 28-second video resume",
  resumeText: "",
  purpose: "resume",
  status: "idle",
  model: "qwen/qwen3.6-plus:free",
  temperature: 0.7,
  resolution: "720p",
  aspectRatio: "16:9",
  targetDuration: 28,
  motion: "moderate",
  voiceover: null,
  captions: null,
};
