/**
 * Which encoders the loaded ffmpeg.wasm core actually ships. The jsdelivr
 * `@ffmpeg/core-mt` build is assumed to include libx265 / libvpx (HEVC / VP9
 * routed through ffmpeg when a complex transition needs it), but a core
 * without them would only fail deep inside the first segment encode with a
 * generic "encoder stopped". So the first core load runs `-encoders` once,
 * caches the parsed list for the page session, and every encode checks its
 * codec against it up front — failing fast with a localized message.
 *
 * Unknown (probe not run yet, or it failed) never blocks: the encode then
 * behaves exactly as before the probe existed. A probe that hits its timeout
 * reports "timeout": the core's health is then unknown, so the loader
 * terminates that instance and exports on a fresh one (ffmpeg-loader).
 */
import type { TimelineExportCodec } from "@shared/timeline";
import { ffmpegEncodingFor, type FfmpegEncoding } from "./encode-args";
import { FfmpegRenderError, codecLabel } from "./errors";

/** The slice of an @ffmpeg/ffmpeg instance the probe drives. */
export interface ProbeTarget {
  exec(args: string[], timeoutMs?: number): Promise<number>;
  on(event: "log", callback: (e: { type: string; message: string }) => void): void;
  off(event: "log", callback: (e: { type: string; message: string }) => void): void;
}

export const PROBE_TIMEOUT_MS = 15_000;
/** Past ffmpeg's own exec timeout, how long we wait before giving up on a
 *  core that never answers at all. */
const PROBE_HANG_GRACE_MS = 2_000;

/** How a probe ended: a cached list, unknown (failed / empty), or timed out
 *  (the core may be wedged — don't export on it). */
export type ProbeOutcome = "probed" | "unknown" | "timeout";

/** One `ffmpeg -encoders` row: 6 capability flags (V/A/S + F S X B D or
 *  dots), then the encoder name. Header/legend rows never match: the legend
 *  rows have a single flag letter followed by `=`. */
const ENCODER_ROW = /^\s*([VAS][.A-Z]{5})\s+([A-Za-z0-9_-]+)(?:\s|$)/;

/** Encoder names from `ffmpeg -encoders` output. */
export function parseEncoderList(output: string): Set<string> {
  const names = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = ENCODER_ROW.exec(line);
    if (match?.[2]) names.add(match[2]);
  }
  return names;
}

let probed: ReadonlySet<string> | null = null;

/** The cached encoder list, or null when no core has been probed yet. */
export function probedEncoders(): ReadonlySet<string> | null {
  return probed;
}

/** Test seam: forget the cached probe. */
export function resetEncoderProbe(): void {
  probed = null;
}

/** Run `-encoders` once per page session (no-op once cached). Never throws:
 *  a failed or empty probe leaves the result unknown; one that ran into its
 *  timeout (ffmpeg's exec timeout returns 1 — told apart from an error by the
 *  elapsed time — or no answer at all) reports "timeout". */
export async function probeEncoders(target: ProbeTarget): Promise<ProbeOutcome> {
  if (probed) return "probed";
  const lines: string[] = [];
  const onLog = (e: { message: string }) => {
    lines.push(e.message);
  };
  let hang: ReturnType<typeof setTimeout> | undefined;
  try {
    target.on("log", onLog);
    const startedAt = Date.now();
    const HUNG = Symbol("hung");
    const result = await Promise.race([
      target.exec(["-hide_banner", "-encoders"], PROBE_TIMEOUT_MS),
      new Promise<typeof HUNG>((resolve) => {
        hang = setTimeout(() => resolve(HUNG), PROBE_TIMEOUT_MS + PROBE_HANG_GRACE_MS);
      }),
    ]);
    if (result === HUNG) return "timeout";
    const names = parseEncoderList(lines.join("\n"));
    if (names.size > 0) {
      probed = names;
      return "probed";
    }
    return result !== 0 && Date.now() - startedAt >= PROBE_TIMEOUT_MS ? "timeout" : "unknown";
  } catch {
    // Unknown — the encode proceeds and reports its own failure.
    return "unknown";
  } finally {
    if (hang !== undefined) clearTimeout(hang);
    try {
      target.off("log", onLog);
    } catch {
      // A core that can't detach a listener still exports.
    }
  }
}

function flag(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** The encoders an encoding needs (video, plus audio when it encodes any). */
export function requiredEncoders(encoding: FfmpegEncoding): string[] {
  return [flag(encoding.videoArgs, "-c:v"), flag(encoding.audioArgs, "-c:a")].filter(
    (name): name is string => !!name && name !== "copy",
  );
}

/** Encoders the encoding needs that the probed core lacks ([] when unknown). */
export function missingEncoders(encoding: FfmpegEncoding, encoders: ReadonlySet<string> | null = probed): string[] {
  if (!encoders) return [];
  return requiredEncoders(encoding).filter((name) => !encoders.has(name));
}

/**
 * Whether the loaded ffmpeg core can encode `codec`: true / false once a
 * core has been probed this session, null before. For export-codec UIs that
 * route a codec through ffmpeg.wasm (the size doesn't change the encoder).
 */
export function ffmpegCanEncode(codec: TimelineExportCodec): boolean | null {
  if (!probed) return null;
  return missingEncoders(ffmpegEncodingFor(codec, 1920, 1080, 30), probed).length === 0;
}

/** Throw the localized "codec unavailable" error when the probed core lacks
 *  an encoder this encoding needs. */
export function assertEncodersAvailable(encoding: FfmpegEncoding): void {
  if (missingEncoders(encoding).length > 0) {
    throw new FfmpegRenderError("CODEC_UNAVAILABLE", { codec: codecLabel(encoding.codec) });
  }
}
