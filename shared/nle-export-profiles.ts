/**
 * #285 NLE M5 — Custom export profiles. Stores per-account codec /
 * container / bitrate / resolution presets. The exporter dispatches on
 * `containerFormat` + `videoCodec` and the audio side picks
 * `audioCodec`.
 *
 * Out-of-the-box profiles ship below; user-saved profiles persist via
 * `/api/studio/export-profiles` (route follow-up under #1796).
 */

export type ContainerFormat = "mp4" | "mov" | "webm" | "gif";
export type VideoCodec = "h264" | "h265" | "vp9" | "av1" | "prores_proxy" | "prores_lt";
export type AudioCodec = "aac" | "mp3" | "opus" | "flac" | "wav_pcm";

export interface ExportProfile {
  id: string;
  label: string;
  containerFormat: ContainerFormat;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  /** Output resolution; null = keep source. */
  width: number | null;
  height: number | null;
  /** Target bitrate (kbps). */
  videoBitrateKbps: number | null;
  audioBitrateKbps: number;
  fps: number | null;
  /** "Server-only" when the browser can't realistically encode this
   *  shape (e.g. 8K / ProRes RAW). The exporter routes those to the
   *  server-side ffmpeg path. */
  serverOnly: boolean;
}

export const NLE_EXPORT_PROFILES: ReadonlyArray<ExportProfile> = [
  { id: "mp4_1080p_h264",      label: "MP4 · 1080p · H.264",  containerFormat: "mp4",  videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080, videoBitrateKbps: 8_000,  audioBitrateKbps: 192, fps: 30, serverOnly: false },
  { id: "mp4_4k_h264",         label: "MP4 · 4K · H.264",     containerFormat: "mp4",  videoCodec: "h264", audioCodec: "aac", width: 3840, height: 2160, videoBitrateKbps: 35_000, audioBitrateKbps: 256, fps: 30, serverOnly: false },
  { id: "mp4_1080p_h265",      label: "MP4 · 1080p · H.265",  containerFormat: "mp4",  videoCodec: "h265", audioCodec: "aac", width: 1920, height: 1080, videoBitrateKbps: 5_000,  audioBitrateKbps: 192, fps: 30, serverOnly: false },
  { id: "webm_1080p_vp9",      label: "WebM · 1080p · VP9",   containerFormat: "webm", videoCodec: "vp9",  audioCodec: "opus",width: 1920, height: 1080, videoBitrateKbps: 6_000,  audioBitrateKbps: 160, fps: 30, serverOnly: false },
  { id: "gif_720p",            label: "GIF · 720p",            containerFormat: "gif",  videoCodec: "h264", audioCodec: "aac", width: 1280, height: 720,  videoBitrateKbps: null,   audioBitrateKbps: 0,   fps: 15, serverOnly: false },
  { id: "mov_proxy_1080p",     label: "MOV · ProRes Proxy 1080p", containerFormat: "mov", videoCodec: "prores_proxy", audioCodec: "wav_pcm", width: 1920, height: 1080, videoBitrateKbps: 42_000, audioBitrateKbps: 1_536, fps: 30, serverOnly: false },
  { id: "mov_lt_4k",           label: "MOV · ProRes LT 4K",   containerFormat: "mov",  videoCodec: "prores_lt", audioCodec: "wav_pcm", width: 3840, height: 2160, videoBitrateKbps: 102_000, audioBitrateKbps: 1_536, fps: 30, serverOnly: false },
  { id: "mp4_8k_h265_server",  label: "MP4 · 8K · H.265 (server)", containerFormat: "mp4", videoCodec: "h265", audioCodec: "aac", width: 7680, height: 4320, videoBitrateKbps: 100_000, audioBitrateKbps: 256, fps: 30, serverOnly: true },
];

export function findExportProfile(id: string): ExportProfile | undefined {
  return NLE_EXPORT_PROFILES.find((p) => p.id === id);
}
