import type { MediaKind } from "./kinds.js";

// ─── Output profiles ─────────────────────────────────────────────────────────
//
// An OutputProfile describes one concrete "Export as…" choice the user
// can pick in the save menu. The render facade reads container + audioCodec
// + (optionally) videoCodec to drive ffmpeg.wasm / WebCodecs / gif.js.
//
// Profiles are grouped by mediaKind. Adding a new export format is one
// entry in this table and every picker / exporter picks it up.

export type AudioCodecId = "aac" | "mp3" | "opus" | "pcm";
export type VideoCodecId =
  | "h264"
  | "h265"
  | "prores"
  | "dnxhd"
  | "vp9"
  | "gif"
  | "webp"
  | "apng";

export type ContainerId =
  | "mp4"
  | "mov"
  | "webm"
  | "mp3"
  | "m4a"
  | "wav"
  | "ogg"
  | "gif"
  | "webp"
  | "apng"
  // Game runtime bundles — not media containers per se, but they ride
  // the same OutputProfile shape so the save-menu doesn't need a
  // per-kind branch. The export facade reads the profile id to
  // dispatch to the game-export pipeline.
  | "html5-bundle"
  | "web-embed"
  // Comic exports — same OutputProfile shape so the save-menu code path
  // stays uniform. `png-strip` is a tall vertical strip (one PNG, every
  // page stacked); `pdf` is a paginated PDF; `cbz` is the comic-archive
  // ZIP format readers understand. Motion comics also export to the
  // existing animation containers (gif/webp/mp4) via separate profiles.
  | "png-strip"
  | "pdf"
  | "cbz"
  // Image runtime — Photoshop-shaped raster authoring (#932). Single-
  // frame static exports; the same OutputProfile shape lets the save
  // menu render them without a per-kind branch.
  | "png"
  | "jpg"
  | "svg"
  // CAD runtime — 2D vector drafting (#930). Standard CAD exchange
  // formats. DXF + DWG are the AutoCAD-family lingua franca; STL +
  // STEP land alongside the future 3D modeling branch.
  | "dxf"
  | "dwg"
  | "stl"
  | "step"
  // Photoshop round-trip via ag-psd (#940 Phase 2).
  | "psd";

export interface OutputProfile {
  /** Stable id — referenced by `studio_projects.timeline_spec.outputProfile`
   *  and by the editor's saved last-used-codec setting. */
  id: string;
  label: string;
  /** One-line picker hint. */
  hint: string;
  /** Media kind this profile belongs to. The save menu filters by this. */
  mediaKind: MediaKind;
  container: ContainerId;
  /** Output mime — the render facade tags Blob results with this. */
  mime: string;
  /** Set when the profile encodes video frames. Null for audio-only. */
  videoCodec: VideoCodecId | null;
  /** Set when the profile encodes audio. Null for silent animation. */
  audioCodec: AudioCodecId | null;
  /** Pro-tier gate — read via `useSubscription().isPro`. */
  proOnly: boolean;
  /** Default download file extension (with dot). */
  fileExt: string;
}
