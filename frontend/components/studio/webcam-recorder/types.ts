import type { RecordingMode } from "@/lib/studio/recording-modes";

export interface WebcamRecorderProps {
  /**
   * Hands the produced clip blob to the host. The recorder deliberately
   * has no trim / split / delete affordances (#1499): timing-model
   * operations belong on the timeline. The host turns the blob into a
   * video widget (V2) or scene (V1 NLE) where the existing edge-drag
   * trim handles and split/delete shortcuts already act on it.
   */
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
  teleprompterText?: string;
  mode?: RecordingMode;
  maxDurationSec?: number;
  /** When true, calls startPreview() once on mount (after permissions
   *  prompt). Used by the Tool Promo template + extension capture
   *  handoff so users land already in the camera/screen prompt without
   *  hunting for a "Start Camera" button. Mode changes after mount
   *  still require remount via `key` — auto-start does NOT make mode
   *  reactive. */
  autoStart?: boolean;
  /** When supplied, the header shows the shared RecordingModeButtons
   *  chips so the user can swap source mid-session. Shown only while
   *  idle / previewing — hidden during an active recording and while a
   *  finished take awaits Use / Discard. The host owns `mode`, so it
   *  must remount this recorder (`key={mode}`) on change; the unmount
   *  cleanup releases every stream of the old source. */
  onModeChange?: (mode: RecordingMode) => void;
}

export type RecordingState = "idle" | "previewing" | "recording" | "recorded";

export type Resolution = "720p" | "1080p";

export type FacingMode = "user" | "environment";

export const RESOLUTIONS: readonly Resolution[] = ["720p", "1080p"];

export const RESOLUTION_CONSTRAINTS: Record<
  Resolution,
  { width: number; height: number }
> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

/** Mutable handle the compositor writes its RAF id into (a React ref
 *  satisfies it structurally, so the hooks pass their refs directly). */
export interface FrameHandle {
  current: number | null;
}
