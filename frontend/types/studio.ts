import type { VideoScript } from "./video-script";
import type { CompiledVideo } from "../lib/compiler/types";

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
  videoBlob: Blob | null;
  projectId: string | null;
  youtubeVideoId: string | null;
  status: StudioStatus;
  // AI settings
  model: string;                // default "google/gemini-flash-1.5"
  temperature: number;          // 0–1
  // Video settings
  resolution: "720p" | "1080p";
  aspectRatio: "16:9" | "9:16" | "1:1";
  targetDuration: number;       // seconds
  motion: "minimal" | "moderate" | "cinematic";
}

export const defaultStudioState: Omit<StudioProjectState, "script" | "activeTemplate" | "compiledVideo" | "videoBlob" | "projectId" | "youtubeVideoId"> = {
  name: "New Video Resume",
  prompt: "Create a professional 28-second video resume",
  resumeText: "",
  status: "idle",
  model: "google/gemini-flash-1.5",
  temperature: 0.7,
  resolution: "720p",
  aspectRatio: "16:9",
  targetDuration: 28,
  motion: "moderate",
};
