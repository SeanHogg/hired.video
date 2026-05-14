/**
 * Codec catalog — single source of truth for "which codec implies which
 * container + audio codec". Used by:
 *   - v1's StudioSettings codec section
 *   - v2's DesignPanel "Export" section
 *   - the render strategy (when it ships) to map an authoring choice to
 *     ffmpeg / WebCodecs encoder params
 *
 * Per the standing DRY rule: every codec-aware surface reads from
 * `CODEC_PRESETS`. Adding a codec is one entry here and every picker /
 * exporter picks it up.
 */

export type Codec = "h264" | "h265" | "prores" | "dnxhd" | "vp9";
export type Container = "mp4" | "mov" | "webm";
export type AudioCodec = "aac" | "pcm" | "opus";

export interface CodecPreset {
  id: Codec;
  label: string;
  hint: string;
  container: Container;
  audioCodec: AudioCodec;
  proOnly: boolean;
}

export const CODEC_PRESETS: CodecPreset[] = [
  {
    id: "h264",
    label: "H.264 (MP4)",
    hint: "Fast · universal",
    container: "mp4",
    audioCodec: "aac",
    proOnly: false,
  },
  {
    id: "h265",
    label: "H.265 / HEVC (MP4)",
    hint: "Smaller file · Pro",
    container: "mp4",
    audioCodec: "aac",
    proOnly: true,
  },
  {
    id: "prores",
    label: "ProRes 422 (MOV)",
    hint: "Mastering · Pro",
    container: "mov",
    audioCodec: "pcm",
    proOnly: true,
  },
  {
    id: "dnxhd",
    label: "DNxHD (MOV)",
    hint: "Avid workflow · Pro",
    container: "mov",
    audioCodec: "pcm",
    proOnly: true,
  },
  {
    id: "vp9",
    label: "VP9 (WebM)",
    hint: "Open codec · Pro",
    container: "webm",
    audioCodec: "opus",
    proOnly: true,
  },
];

export function findCodecPreset(id: Codec | null | undefined): CodecPreset | null {
  if (!id) return null;
  return CODEC_PRESETS.find((c) => c.id === id) ?? null;
}
