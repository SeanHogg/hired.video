/**
 * Export codec → ffmpeg command lines. Pure: the ONE place a
 * Timeline.exportCodec + frame size turns into encoder flags, container,
 * MIME, and the size estimate the memory preflight uses. The Timeline
 * engine's ffmpeg.wasm path (`ffmpeg-render.ts`) reads from here.
 *
 *   ProRes   prores_ks, profile proxy|lt|standard|hq (default standard =
 *            the "ProRes 422" the codec picker offers), 10-bit 4:2:2, .mov
 *   DNxHD    1920×1080 / 1280×720 at 24/25/30/50/60 fps → classic DNxHD at
 *            the 8-bit HQ bitrate the spec defines for that size + rate
 *   DNxHR    every other size (vertical, square, 4K) → dnxhr_hq, .mov
 *   H.264 / HEVC / VP9 → MP4 (only reached when a complex transition routes
 *            an MP4 codec to ffmpeg.wasm)
 *
 * MOV carries 24-bit PCM audio (mastering); MP4 carries AAC.
 */
import type { TimelineExportCodec } from "@shared/timeline";
import { webcodecsVideoCodec } from "../export-codec";

export type ProresProfile = "proxy" | "lt" | "standard" | "hq";

const PRORES_PROFILE_ID: Record<ProresProfile, number> = { proxy: 0, lt: 1, standard: 2, hq: 3 };
/** Apple's published 1920×1080 @ 29.97 target rates (Mbps). */
const PRORES_1080P30_MBPS: Record<ProresProfile, number> = { proxy: 45, lt: 102, standard: 147, hq: 220 };

/** Classic DNxHD frame sizes → fps → 8-bit HQ bitrate (Mbps), per the
 *  DNxHD spec table ffmpeg validates against (CID 1238 / 1251). */
const DNXHD_HQ_MBPS: Record<string, Record<number, number>> = {
  "1920x1080": { 24: 175, 25: 185, 30: 220, 50: 365, 60: 440 },
  "1280x720": { 24: 90, 25: 90, 30: 110, 50: 180, 60: 220 },
};
/** DNxHR HQ ≈ 220 Mbps at 1080p30 (scales with pixels × fps). */
const DNXHR_HQ_1080P30_MBPS = 220;

const PIXELS_1080P = 1920 * 1080;

export interface FfmpegEncoding {
  codec: TimelineExportCodec;
  container: "mov" | "mp4";
  extension: "mov" | "mp4";
  mime: "video/quicktime" | "video/mp4";
  /** `-c:v …` through `-pix_fmt …` for the video stream. */
  videoArgs: string[];
  /** `-c:a …` for the muxed audio stream. */
  audioArgs: string[];
  /** Approximate encoded video bitrate (bits/s) — drives the memory preflight. */
  estimatedBitrate: number;
}

export interface FfmpegEncodingOptions {
  proresProfile?: ProresProfile;
}

function scaledBitrate(mbpsAt1080p30: number, width: number, height: number, fps: number): number {
  return Math.round(mbpsAt1080p30 * 1_000_000 * ((width * height) / PIXELS_1080P) * (fps / 29.97));
}

const MOV_AUDIO = ["-c:a", "pcm_s24le"];
const MP4_AUDIO = ["-c:a", "aac", "-b:a", "192k"];

function mov(codec: TimelineExportCodec, videoArgs: string[], estimatedBitrate: number): FfmpegEncoding {
  return { codec, container: "mov", extension: "mov", mime: "video/quicktime", videoArgs, audioArgs: MOV_AUDIO, estimatedBitrate };
}

function mp4(codec: TimelineExportCodec, videoArgs: string[], width: number, height: number): FfmpegEncoding {
  const estimatedBitrate = webcodecsVideoCodec(codec, width, height).bitrate;
  return { codec, container: "mp4", extension: "mp4", mime: "video/mp4", videoArgs, audioArgs: MP4_AUDIO, estimatedBitrate };
}

/** Classic DNxHD bitrate (Mbps) for this size + rate, or null → use DNxHR. */
export function dnxhdBitrateMbps(width: number, height: number, fps: number): number | null {
  return DNXHD_HQ_MBPS[`${width}x${height}`]?.[Math.round(fps)] ?? null;
}

/** The ffmpeg encoding for `codec` (absent = H.264) at `width`×`height`@`fps`. */
export function ffmpegEncodingFor(
  codec: TimelineExportCodec | undefined,
  width: number,
  height: number,
  fps: number,
  opts: FfmpegEncodingOptions = {},
): FfmpegEncoding {
  switch (codec) {
    case "prores": {
      const profile = opts.proresProfile ?? "standard";
      return mov(
        "prores",
        ["-c:v", "prores_ks", "-profile:v", String(PRORES_PROFILE_ID[profile]), "-vendor", "apl0", "-pix_fmt", "yuv422p10le"],
        scaledBitrate(PRORES_1080P30_MBPS[profile], width, height, fps),
      );
    }
    case "dnxhd": {
      const mbps = dnxhdBitrateMbps(width, height, fps);
      if (mbps !== null) {
        return mov("dnxhd", ["-c:v", "dnxhd", "-b:v", `${mbps}M`, "-pix_fmt", "yuv422p"], mbps * 1_000_000);
      }
      return mov(
        "dnxhd",
        ["-c:v", "dnxhd", "-profile:v", "dnxhr_hq", "-pix_fmt", "yuv422p"],
        scaledBitrate(DNXHR_HQ_1080P30_MBPS, width, height, fps),
      );
    }
    case "h265":
      return mp4("h265", ["-c:v", "libx265", "-preset", "fast", "-crf", "24", "-tag:v", "hvc1", "-pix_fmt", "yuv420p"], width, height);
    case "vp9":
      return mp4("vp9", ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1", "-pix_fmt", "yuv420p"], width, height);
    case "h264":
    case undefined:
      return mp4("h264", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"], width, height);
    default:
      throw new Error(`Unknown export codec: ${codec satisfies never}`);
  }
}

/** 4:2:2 / 4:2:0 chroma needs even dimensions — pad odd sizes by one pixel. */
function evenPad(width: number, height: number): string[] {
  return width % 2 === 0 && height % 2 === 0 ? [] : ["-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"];
}

/** Encode one chunk of raw RGBA frames into a video-only segment. */
export function segmentEncodeArgs(
  encoding: FfmpegEncoding,
  args: { width: number; height: number; fps: number; input: string; output: string },
): string[] {
  return [
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${args.width}x${args.height}`,
    "-r", String(args.fps),
    "-i", args.input,
    ...evenPad(args.width, args.height),
    ...encoding.videoArgs,
    "-an",
    "-y", args.output,
  ];
}

/** Stitch the segments (stream copy — ProRes / DNx are intra-only, H.264
 *  segments each open on an IDR) and mux the audio mix in. */
export function muxArgs(
  encoding: FfmpegEncoding,
  args: { concatList: string; audio: string | null; output: string },
): string[] {
  return [
    "-f", "concat",
    "-safe", "0",
    "-i", args.concatList,
    ...(args.audio ? ["-i", args.audio] : []),
    "-map", "0:v:0",
    ...(args.audio ? ["-map", "1:a:0", ...encoding.audioArgs] : []),
    "-c:v", "copy",
    ...(encoding.container === "mp4" ? ["-movflags", "+faststart"] : []),
    "-y", args.output,
  ];
}

/** ffconcat list for the concat demuxer. */
export function concatList(paths: readonly string[]): string {
  return ["ffconcat version 1.0", ...paths.map((p) => `file '${p}'`)].join("\n") + "\n";
}

/**
 * Memory limits. The encoder runs inside one wasm32 heap: a raw chunk of
 * frames plus the finished file must fit. Raw chunks stay ≤ 256 MB; the
 * finished file (MEMFS, before it is read out) is budgeted at 1.2 GB so a
 * long 4K ProRes fails up front with a clear message instead of an
 * out-of-memory crash 90% of the way through.
 */
export const RAW_SEGMENT_BUDGET_BYTES = 256 * 1024 * 1024;
export const OUTPUT_BUDGET_BYTES = 1_200_000_000;
const MAX_FRAMES_PER_SEGMENT = 120;

/** Frames per raw RGBA chunk at this size (at least one). */
export function framesPerSegment(width: number, height: number): number {
  const perFrame = width * height * 4;
  return Math.max(1, Math.min(MAX_FRAMES_PER_SEGMENT, Math.floor(RAW_SEGMENT_BUDGET_BYTES / perFrame)));
}

/** Longest duration (whole seconds) that fits the output budget. */
export function maxEncodableSeconds(encoding: FfmpegEncoding): number {
  return Math.floor((OUTPUT_BUDGET_BYTES * 8) / encoding.estimatedBitrate);
}
