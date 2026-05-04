/**
 * Codec → ffmpeg argument mapping. Single source of truth used by
 * BOTH `ffmpeg-wasm-exporter.ts` (main-thread path) and
 * `workers/ffmpeg-encode.worker.ts` (background path). Per the
 * standing DRY rule, never inline these args at a call site —
 * adding codec support is one entry here and both consumers pick it
 * up automatically.
 */

export interface CodecPreset {
  codec?: "h264" | "h265" | "prores" | "dnxhd" | "vp9";
  container?: "mp4" | "mov" | "webm";
  videoBitrate?: number;
  audioBitrate?: number;
}

export interface FfmpegArgs {
  videoArg: string;
  outName: string;
  extraArgs: string[];
  mime: string;
}

export function ffmpegArgsFor(preset: CodecPreset): FfmpegArgs {
  const codec = preset.codec ?? "h264";
  const container = preset.container ?? "mp4";
  const bitrate = preset.videoBitrate;
  const bitrateArgs = bitrate ? ["-b:v", String(bitrate)] : [];
  const outName = `out.${container}`;
  const mime = mimeFor(container);

  switch (codec) {
    case "h265":
      return { videoArg: "libx265", outName, extraArgs: ["-preset", "fast", ...bitrateArgs], mime };
    case "prores":
      return { videoArg: "prores_ks", outName, extraArgs: ["-profile:v", "3"], mime };
    case "dnxhd":
      return { videoArg: "dnxhd", outName, extraArgs: ["-profile:v", "dnxhr_hq"], mime };
    case "vp9":
      return { videoArg: "libvpx-vp9", outName, extraArgs: ["-b:v", "0", "-crf", "30"], mime };
    case "h264":
    default:
      return { videoArg: "libx264", outName, extraArgs: ["-preset", "fast", ...bitrateArgs], mime };
  }
}

function mimeFor(container: "mp4" | "mov" | "webm"): string {
  switch (container) {
    case "mp4":  return "video/mp4";
    case "mov":  return "video/quicktime";
    case "webm": return "video/webm";
  }
}
