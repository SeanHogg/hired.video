/**
 * Built-in export profiles. The user picks one in the NLE export
 * picker; the render facade reads `timeline.exportProfile` and routes
 * through `pickRenderEngine` (which is the single source of truth for
 * "does this need ffmpeg-wasm?").
 *
 * Profiles map onto the M5 Pro Feature Mapping rows in
 * `project_nle_decision.md`:
 *   - "h264-1080p" / "h264-720p"  → fast WebCodecs path
 *   - "h264-4k"                   → 4K Export
 *   - "h264-8k"                   → 8K Export (M5)
 *   - "prores-422"                → ProRes export (M5 / M3 follow-on)
 *   - "youtube-shorts-9x16"       → 9:16 social-media preset
 *   - "instagram-square-1x1"      → 1:1 social-media preset
 *
 * Custom user-saved profiles get persisted alongside the built-ins
 * once the per-account preset table lands; this list is the
 * single source the editor reads from until then.
 */

import type { ExportProfile } from "@shared/timeline";

export const BUILTIN_EXPORT_PROFILES: ExportProfile[] = [
  {
    id: "h264-1080p",
    label: "H.264 · 1080p",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    outputWidth: 1920,
    outputHeight: 1080,
    videoBitrate: 8_000_000,
    audioBitrate: 192_000,
  },
  {
    id: "h264-720p",
    label: "H.264 · 720p",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    outputWidth: 1280,
    outputHeight: 720,
    videoBitrate: 4_000_000,
    audioBitrate: 128_000,
  },
  {
    id: "h264-4k",
    label: "H.264 · 4K UHD",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    outputWidth: 3840,
    outputHeight: 2160,
    videoBitrate: 35_000_000,
    audioBitrate: 256_000,
  },
  {
    id: "h264-8k",
    label: "H.264 · 8K UHD",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    outputWidth: 7680,
    outputHeight: 4320,
    videoBitrate: 100_000_000,
    audioBitrate: 320_000,
  },
  {
    id: "prores-422",
    label: "ProRes 422 · master",
    container: "mov",
    videoCodec: "prores_ks",
    audioCodec: "pcm_s16le",
    outputWidth: 1920,
    outputHeight: 1080,
    audioBitrate: 1_536_000,
  },
  {
    id: "dnxhd-1080p",
    label: "DNxHD · 1080p",
    container: "mov",
    videoCodec: "dnxhd",
    audioCodec: "pcm_s16le",
    outputWidth: 1920,
    outputHeight: 1080,
    videoBitrate: 145_000_000,
  },
  {
    id: "youtube-shorts-9x16",
    label: "YouTube Shorts · 1080×1920",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    outputWidth: 1080,
    outputHeight: 1920,
    videoBitrate: 8_000_000,
    audioBitrate: 192_000,
  },
  {
    id: "instagram-square-1x1",
    label: "Instagram square · 1080×1080",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    outputWidth: 1080,
    outputHeight: 1080,
    videoBitrate: 8_000_000,
    audioBitrate: 192_000,
  },
];

/** Look up by id. Used by the EditorExportPicker and the render
 *  facade so profile resolution is centralised. */
export function getExportProfile(id: string): ExportProfile | null {
  return BUILTIN_EXPORT_PROFILES.find((p) => p.id === id) ?? null;
}
