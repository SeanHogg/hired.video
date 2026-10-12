/**
 * The ffmpeg.wasm engine's user-facing failures. Each carries a stable
 * `code` (for UI branching / tests) and a message already localized
 * through i18n — the studio surfaces render errors verbatim in a toast.
 */
import i18n from "@/lib/i18n/i18n";

export type FfmpegRenderErrorCode =
  | "LOAD_FAILED"
  | "TOO_LONG"
  | "ENCODE_FAILED"
  | "CODEC_UNAVAILABLE";

const MESSAGE_KEY: Record<FfmpegRenderErrorCode, string> = {
  LOAD_FAILED: "studio.render.ffmpeg.loadFailed",
  TOO_LONG: "studio.render.ffmpeg.tooLong",
  ENCODE_FAILED: "studio.render.ffmpeg.encodeFailed",
  CODEC_UNAVAILABLE: "studio.render.ffmpeg.codecUnavailable",
};

/** Display name used in the localized messages. */
export function codecLabel(codec: string): string {
  return ({ prores: "ProRes", dnxhd: "DNxHD", h264: "H.264", h265: "HEVC", vp9: "VP9" } as Record<string, string>)[codec] ?? codec;
}

export class FfmpegRenderError extends Error {
  readonly code: FfmpegRenderErrorCode;
  constructor(code: FfmpegRenderErrorCode, params: Record<string, string | number> = {}, options?: { cause?: unknown }) {
    super(String(i18n.t(MESSAGE_KEY[code], params)));
    this.name = "FfmpegRenderError";
    this.code = code;
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}
