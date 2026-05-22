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
  // No AI settings here on purpose. Model + temperature + maxTokens are
  // server-owned via the use-case-driven facade (USE_CASE_PROFILES).
  // The frontend never picks, stores, or transmits any of them.
  // Video settings
  resolution: "720p" | "1080p" | "4k";
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3";
  targetDuration: number;       // seconds
  motion: "minimal" | "moderate" | "cinematic";
  /** Render preset — codec + container chosen by the user. Optional;
   *  defaults to h264/aac/mp4. Persisted via render-settings-sync into
   *  `script.video.{codec,container,audioCodec}` so the saved project
   *  carries the choice. */
  codec?: "h264" | "h265" | "prores" | "dnxhd" | "vp9";
  container?: "mp4" | "mov" | "webm";
  audioCodec?: "aac" | "pcm" | "opus";
  // TTS voiceover
  voiceover: VoiceoverConfig | null;
  // Captions
  captions: CaptionConfig | null;
  /** Optional studio brand kit applied to AI script generation. When set,
   *  the storyboard endpoint replaces the script's colour palette + font +
   *  logo with the kit's values. Null = no kit selected (default). */
  brandKitId?: string | null;

  // ─── Comic-specific intake (mediaKind === "comic") ────────────────────
  // Only populated when the active template is one of the comic genres.
  // Other templates leave them undefined and the AI scaffolder ignores
  // them. Stored on `StudioProjectState` rather than a parallel comic-
  // state slice so the existing save / load / dirty-tracking pipeline
  // carries them for free.
  /** Selected genre id (`hero`, `noir`, `scifi`, …). Single source of
   *  truth read by `ComicIntake`, the catalog's per-template seed
   *  picker, and the `/api/studio/generate-comic` route. */
  comicGenreId?: import("@shared/comic-genres").ComicGenreId;
  /** The protagonist's display name. Defaults to the user's first name
   *  on load if blank. */
  comicProtagonistName?: string;
  /** Which source artefact powers the scaffolder: the user's resume,
   *  their profile bio + services, or just the free-form prompt.
   *  `auto` = "use whichever is richest" — the scaffolder picks. */
  comicSourceKind?: "resume" | "profile" | "services" | "auto";
  /** When set, the scaffolder calls `/api/studio/generate-image` once
   *  to produce a protagonist headshot, then uses it as the character
   *  image on every page. Off by default (free SVG silhouettes); on
   *  trades tokens for a personalised hero portrait. */
  comicGenerateCharacterPortrait?: boolean;
}

export const defaultStudioState: Omit<StudioProjectState, "script" | "activeTemplate" | "compiledVideo" | "videoBlob" | "videoUrl" | "thumbnailUrl" | "projectId" | "youtubeVideoId"> = {
  name: "New Video Resume",
  prompt: "Create a professional 28-second video resume",
  resumeText: "",
  purpose: "resume",
  status: "idle",
  resolution: "720p",
  aspectRatio: "16:9",
  targetDuration: 28,
  motion: "moderate",
  voiceover: null,
  captions: null,
  brandKitId: null,
};
