/**
 * ffmpeg.wasm encoder probe: `-encoders` output parsing, the once-per-session
 * cache, the required-encoder check that fails an HEVC / VP9 encode up front
 * on a core without libx265 / libvpx, "unknown never blocks", and a probe
 * timeout reported as such (the loader then swaps in a fresh core).
 *
 * Run: vitest run lib/timeline/__tests__/ffmpeg-encoder-probe.test.ts
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertEncodersAvailable,
  ffmpegCanEncode,
  missingEncoders,
  parseEncoderList,
  PROBE_TIMEOUT_MS,
  probedEncoders,
  probeEncoders,
  requiredEncoders,
  resetEncoderProbe,
  type ProbeTarget,
} from "../ffmpeg/encoder-probe";
import { ffmpegEncodingFor } from "../ffmpeg/encode-args";
import { FfmpegRenderError } from "../ffmpeg/errors";

/** Real `ffmpeg -hide_banner -encoders` shape (trimmed), as the core logs it. */
const ENCODERS_OUTPUT = [
  "Encoders:",
  " V..... = Video",
  " A..... = Audio",
  " S..... = Subtitle",
  " .F.... = Frame-level multithreading",
  " ..S... = Slice-level multithreading",
  " ...X.. = Codec is experimental",
  " ....B. = Supports draw_horiz_band",
  " .....D = Supports direct rendering method 1",
  " ------",
  " V....D a64multi             Multicolor charset for Commodore 64 (codec a64_multi)",
  " V....D dnxhd                VC3/DNxHD",
  " VFS... prores_ks            Apple ProRes (iCodec Pro) (codec prores)",
  " V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)",
  " A....D aac                  AAC (Advanced Audio Coding)",
  " A....D pcm_s24le            PCM signed 24-bit little-endian",
  " S..... ass                  ASS (Advanced SubStation Alpha) subtitle",
].join("\n");

const FULL_CORE = ENCODERS_OUTPUT + "\n V....D libx265 libx265 H.265 / HEVC (codec hevc)\n V....D libvpx-vp9 libvpx VP9 (codec vp9)";

function fakeTarget(output: string | Error) {
  const listeners = new Set<(e: { type: string; message: string }) => void>();
  const exec = vi.fn(async (_args: string[], _timeoutMs?: number) => {
    if (output instanceof Error) throw output;
    // The core logs one line per message.
    output.split("\n").forEach((message) => listeners.forEach((cb) => cb({ type: "stderr", message })));
    return 0;
  });
  const target: ProbeTarget & { exec: typeof exec } = {
    exec,
    on: (_event, cb) => void listeners.add(cb),
    off: (_event, cb) => void listeners.delete(cb),
  };
  return { target, listeners };
}

afterEach(() => resetEncoderProbe());

describe("parseEncoderList", () => {
  it("reads encoder names from the table, not the legend", () => {
    const names = parseEncoderList(ENCODERS_OUTPUT);
    expect([...names].sort()).toEqual(["a64multi", "aac", "ass", "dnxhd", "libx264", "pcm_s24le", "prores_ks"]);
    expect(names.has("=")).toBe(false);
    expect(names.has("Video")).toBe(false);
  });

  it("handles CRLF and a name at end of line", () => {
    expect([...parseEncoderList(" V....D libx265\r\n A....D aac   AAC\r\n")]).toEqual(["libx265", "aac"]);
  });

  it("empty / garbage output → no encoders", () => {
    expect(parseEncoderList("").size).toBe(0);
    expect(parseEncoderList("ffmpeg version n6.0\nUnrecognized option 'encoders'").size).toBe(0);
  });
});

describe("requiredEncoders / missingEncoders", () => {
  it("names the video and audio encoders each codec needs", () => {
    expect(requiredEncoders(ffmpegEncodingFor("h265", 1920, 1080, 30))).toEqual(["libx265", "aac"]);
    expect(requiredEncoders(ffmpegEncodingFor("vp9", 1920, 1080, 30))).toEqual(["libvpx-vp9", "aac"]);
    expect(requiredEncoders(ffmpegEncodingFor("prores", 1920, 1080, 30))).toEqual(["prores_ks", "pcm_s24le"]);
  });

  it("unknown (no probe) never reports anything missing", () => {
    expect(missingEncoders(ffmpegEncodingFor("h265", 1920, 1080, 30), null)).toEqual([]);
  });

  it("lists what the core lacks", () => {
    const lacking = parseEncoderList(ENCODERS_OUTPUT);
    expect(missingEncoders(ffmpegEncodingFor("h265", 1280, 720, 30), lacking)).toEqual(["libx265"]);
    expect(missingEncoders(ffmpegEncodingFor("vp9", 1280, 720, 30), lacking)).toEqual(["libvpx-vp9"]);
    expect(missingEncoders(ffmpegEncodingFor("dnxhd", 1920, 1080, 30), lacking)).toEqual([]);
  });
});

describe("probeEncoders", () => {
  it("runs -encoders once, caches the list, and detaches its log listener", async () => {
    const { target, listeners } = fakeTarget(ENCODERS_OUTPUT);
    await probeEncoders(target);
    await probeEncoders(target);
    expect(target.exec).toHaveBeenCalledTimes(1);
    expect(target.exec.mock.calls[0]?.[0]).toEqual(["-hide_banner", "-encoders"]);
    expect(probedEncoders()?.has("prores_ks")).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it("a failed probe leaves the result unknown and never throws", async () => {
    const { target, listeners } = fakeTarget(new Error("exec crashed"));
    await expect(probeEncoders(target)).resolves.toBe("unknown");
    expect(probedEncoders()).toBeNull();
    expect(listeners.size).toBe(0);
  });

  it("an empty listing stays unknown (and is retried next load)", async () => {
    const empty = fakeTarget("");
    await probeEncoders(empty.target);
    expect(probedEncoders()).toBeNull();
    const full = fakeTarget(FULL_CORE);
    await probeEncoders(full.target);
    expect(full.target.exec).toHaveBeenCalledTimes(1);
    expect(probedEncoders()?.has("libx265")).toBe(true);
  });
});

describe("probeEncoders timeout", () => {
  afterEach(() => vi.useRealTimers());

  function slowTarget(exec: () => Promise<number>): ProbeTarget {
    return { exec: vi.fn(exec), on: () => undefined, off: () => undefined };
  }

  it("ffmpeg's exec timeout (exit 1 after the full timeout) reports timeout, list unknown", async () => {
    vi.useFakeTimers();
    const target = slowTarget(() => new Promise((resolve) => setTimeout(() => resolve(1), PROBE_TIMEOUT_MS)));
    const outcome = probeEncoders(target);
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    await expect(outcome).resolves.toBe("timeout");
    expect(probedEncoders()).toBeNull();
  });

  it("a core that never answers reports timeout", async () => {
    vi.useFakeTimers();
    const target = slowTarget(() => new Promise<number>(() => undefined));
    const outcome = probeEncoders(target);
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 5_000);
    await expect(outcome).resolves.toBe("timeout");
    expect(probedEncoders()).toBeNull();
  });

  it("a quick non-zero exit is unknown, not a timeout", async () => {
    await expect(probeEncoders(slowTarget(async () => 1))).resolves.toBe("unknown");
  });
});

describe("availability", () => {
  it("before any probe: unknown, and encodes are not blocked", () => {
    expect(ffmpegCanEncode("h265")).toBeNull();
    expect(() => assertEncodersAvailable(ffmpegEncodingFor("h265", 1920, 1080, 30))).not.toThrow();
  });

  it("a core without libx265 / libvpx: HEVC + VP9 unavailable, ProRes / DNxHD / H.264 fine", async () => {
    await probeEncoders(fakeTarget(ENCODERS_OUTPUT).target);
    expect(ffmpegCanEncode("h265")).toBe(false);
    expect(ffmpegCanEncode("vp9")).toBe(false);
    expect(ffmpegCanEncode("prores")).toBe(true);
    expect(ffmpegCanEncode("dnxhd")).toBe(true);
    expect(ffmpegCanEncode("h264")).toBe(true);
    let caught: unknown;
    try {
      assertEncodersAvailable(ffmpegEncodingFor("h265", 1920, 1080, 30));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FfmpegRenderError);
    expect((caught as FfmpegRenderError).code).toBe("CODEC_UNAVAILABLE");
  });

  it("a full core: every codec available", async () => {
    await probeEncoders(fakeTarget(FULL_CORE).target);
    for (const codec of ["h264", "h265", "vp9", "prores", "dnxhd"] as const) expect(ffmpegCanEncode(codec)).toBe(true);
  });
});
