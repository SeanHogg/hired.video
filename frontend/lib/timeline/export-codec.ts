/**
 * The WebCodecs encoder settings for a Timeline's export codec — the ONE
 * place the editor's codec choice (studio / kit Export → CanvasState.codec →
 * Timeline.exportCodec) turns into an encoder codec string, the MP4 track
 * codec and a bitrate. Every codec WebCodecs can encode goes into MP4 (the
 * container the upload + posting pipeline accepts); ProRes / DNxHD never
 * reach here (pickRenderEngine routes them to ffmpeg.wasm).
 */
import type { TimelineExportCodec } from "@shared/timeline";
import type { Mp4VideoCodec } from "./mp4-mux";

export interface WebcodecsVideoCodec {
  /** WebCodecs `VideoEncoder` codec string. */
  codec: string;
  /** MP4 video track codec (lib/timeline/mp4-mux). */
  muxer: Mp4VideoCodec;
  bitrate: number;
}

type Tier = "4k" | "1080" | "720" | "sd";

function tierOf(width: number, height: number): Tier {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (long > 1920 || short > 1080) return "4k";
  if (short >= 1080) return "1080";
  if (short >= 720) return "720";
  return "sd";
}

/** Codec strings per tier: profile + level high enough for the frame size. */
const CODEC_STRINGS: Record<Mp4VideoCodec, Record<Tier, string>> = {
  // H.264 High 5.1 / High 4.0 / Main 3.1 / Baseline 3.0
  avc: { "4k": "avc1.640033", "1080": "avc1.640028", "720": "avc1.4D001F", sd: "avc1.42E01E" },
  // HEVC Main, levels 5.1 / 4.1 / 3.1 / 3.1
  hevc: { "4k": "hvc1.1.6.L153.B0", "1080": "hvc1.1.6.L123.B0", "720": "hvc1.1.6.L93.B0", sd: "hvc1.1.6.L93.B0" },
  // VP9 profile 0, 8-bit, levels 5.1 / 4.1 / 3.1 / 3.0
  vp9: { "4k": "vp09.00.51.08", "1080": "vp09.00.41.08", "720": "vp09.00.31.08", sd: "vp09.00.30.08" },
};

const BITRATE: Record<Tier, number> = { "4k": 16_000_000, "1080": 4_000_000, "720": 2_500_000, sd: 1_500_000 };
/** HEVC / VP9 reach H.264 quality at roughly 70% of its bitrate. */
const EFFICIENT = 0.7;

const MUXER_OF: Record<Exclude<TimelineExportCodec, "prores" | "dnxhd">, WebcodecsVideoCodec["muxer"]> = {
  h264: "avc",
  h265: "hevc",
  vp9: "vp9",
};

/** Encoder settings for `exportCodec` at `width`×`height` (absent = H.264). */
export function webcodecsVideoCodec(exportCodec: TimelineExportCodec | undefined, width: number, height: number): WebcodecsVideoCodec {
  const tier = tierOf(width, height);
  const muxer = exportCodec && exportCodec in MUXER_OF ? MUXER_OF[exportCodec as keyof typeof MUXER_OF] : "avc";
  const bitrate = Math.round(BITRATE[tier] * (muxer === "avc" ? 1 : EFFICIENT));
  return { codec: CODEC_STRINGS[muxer][tier], muxer, bitrate };
}
