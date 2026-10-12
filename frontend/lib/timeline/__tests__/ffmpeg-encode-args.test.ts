/**
 * Export codec → ffmpeg args: ProRes profiles, DNxHD at the spec sizes and
 * DNxHR everywhere else, MP4 codecs, segment / mux command lines, and the
 * memory limits that chunk frames and refuse over-long masters.
 *
 * Run: vitest run lib/timeline/__tests__/ffmpeg-encode-args.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  concatList,
  dnxhdBitrateMbps,
  ffmpegEncodingFor,
  framesPerSegment,
  maxEncodableSeconds,
  muxArgs,
  RAW_SEGMENT_BUDGET_BYTES,
  segmentEncodeArgs,
} from "../ffmpeg/encode-args";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

describe("ffmpegEncodingFor — ProRes", () => {
  it("defaults to ProRes 422 standard (profile 2), 10-bit 4:2:2 in MOV with PCM audio", () => {
    const enc = ffmpegEncodingFor("prores", 1920, 1080, 30);
    expect(flag(enc.videoArgs, "-c:v")).toBe("prores_ks");
    expect(flag(enc.videoArgs, "-profile:v")).toBe("2");
    expect(flag(enc.videoArgs, "-pix_fmt")).toBe("yuv422p10le");
    expect(enc).toMatchObject({ container: "mov", extension: "mov", mime: "video/quicktime" });
    expect(flag(enc.audioArgs, "-c:a")).toBe("pcm_s24le");
  });

  it.each([
    ["proxy", "0"],
    ["lt", "1"],
    ["standard", "2"],
    ["hq", "3"],
  ] as const)("maps the %s profile to prores_ks profile %s", (profile, id) => {
    expect(flag(ffmpegEncodingFor("prores", 1920, 1080, 30, { proresProfile: profile }).videoArgs, "-profile:v")).toBe(id);
  });

  it("scales the size estimate with pixels and frame rate", () => {
    const hd = ffmpegEncodingFor("prores", 1920, 1080, 30).estimatedBitrate;
    const uhd = ffmpegEncodingFor("prores", 3840, 2160, 30).estimatedBitrate;
    const hd60 = ffmpegEncodingFor("prores", 1920, 1080, 60).estimatedBitrate;
    expect(hd).toBeGreaterThan(140_000_000);
    expect(hd).toBeLessThan(150_000_000);
    expect(uhd / hd).toBeCloseTo(4, 5);
    expect(hd60 / hd).toBeCloseTo(2, 5);
  });
});

describe("ffmpegEncodingFor — DNxHD / DNxHR", () => {
  it.each([
    [1920, 1080, 24, 175],
    [1920, 1080, 25, 185],
    [1920, 1080, 30, 220],
    [1920, 1080, 60, 440],
    [1280, 720, 30, 110],
    [1280, 720, 60, 220],
  ])("uses classic DNxHD at %ix%i@%i → %i Mbps", (w, h, fps, mbps) => {
    const enc = ffmpegEncodingFor("dnxhd", w, h, fps);
    expect(flag(enc.videoArgs, "-c:v")).toBe("dnxhd");
    expect(flag(enc.videoArgs, "-b:v")).toBe(`${mbps}M`);
    expect(flag(enc.videoArgs, "-profile:v")).toBeUndefined();
    expect(flag(enc.videoArgs, "-pix_fmt")).toBe("yuv422p");
    expect(enc.estimatedBitrate).toBe(mbps * 1_000_000);
    expect(enc.container).toBe("mov");
  });

  it.each([
    [1080, 1920, 30, "vertical 9:16"],
    [1080, 1080, 30, "square"],
    [3840, 2160, 30, "4K"],
    [1920, 1080, 48, "1080p at a rate outside the DNxHD table"],
  ])("switches to DNxHR HQ for %ix%i@%i (%s)", (w, h, fps) => {
    const enc = ffmpegEncodingFor("dnxhd", w, h, fps);
    expect(flag(enc.videoArgs, "-profile:v")).toBe("dnxhr_hq");
    expect(flag(enc.videoArgs, "-b:v")).toBeUndefined();
    expect(enc).toMatchObject({ codec: "dnxhd", container: "mov", mime: "video/quicktime" });
  });

  it("rounds NTSC rates onto the DNxHD table", () => {
    expect(dnxhdBitrateMbps(1920, 1080, 29.97)).toBe(220);
    expect(dnxhdBitrateMbps(1920, 1080, 23.976)).toBe(175);
    expect(dnxhdBitrateMbps(1440, 1080, 30)).toBeNull();
  });
});

describe("ffmpegEncodingFor — MP4 codecs", () => {
  it("defaults to H.264 MP4 with AAC", () => {
    const enc = ffmpegEncodingFor(undefined, 1920, 1080, 30);
    expect(flag(enc.videoArgs, "-c:v")).toBe("libx264");
    expect(flag(enc.videoArgs, "-pix_fmt")).toBe("yuv420p");
    expect(enc).toMatchObject({ codec: "h264", container: "mp4", mime: "video/mp4" });
    expect(flag(enc.audioArgs, "-c:a")).toBe("aac");
  });

  it("maps HEVC and VP9 into MP4", () => {
    expect(flag(ffmpegEncodingFor("h265", 1920, 1080, 30).videoArgs, "-c:v")).toBe("libx265");
    expect(flag(ffmpegEncodingFor("vp9", 1920, 1080, 30).videoArgs, "-c:v")).toBe("libvpx-vp9");
    expect(ffmpegEncodingFor("vp9", 1920, 1080, 30).container).toBe("mp4");
  });
});

describe("segment + mux command lines", () => {
  it("encodes a raw RGBA chunk at the timeline size and rate, video only", () => {
    const enc = ffmpegEncodingFor("prores", 1920, 1080, 30);
    const args = segmentEncodeArgs(enc, { width: 1920, height: 1080, fps: 30, input: "/w/in.rgba", output: "/w/seg.mov" });
    expect(args.slice(0, 10)).toEqual(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", "1920x1080", "-r", "30", "-i", "/w/in.rgba"]);
    expect(args).toContain("-an");
    expect(args).not.toContain("-vf");
    expect(args.slice(-2)).toEqual(["-y", "/w/seg.mov"]);
  });

  it("pads odd frame sizes to even for chroma subsampling", () => {
    const enc = ffmpegEncodingFor("prores", 1081, 1919, 30);
    expect(flag(segmentEncodeArgs(enc, { width: 1081, height: 1919, fps: 30, input: "i", output: "o" }), "-vf")).toBe("pad=ceil(iw/2)*2:ceil(ih/2)*2");
  });

  it("stream-copies the segments and muxes PCM audio into MOV", () => {
    const enc = ffmpegEncodingFor("dnxhd", 1920, 1080, 30);
    const args = muxArgs(enc, { concatList: "/w/list", audio: "/s/audio.wav", output: "/w/out.mov" });
    expect(args.slice(0, 6)).toEqual(["-f", "concat", "-safe", "0", "-i", "/w/list"]);
    expect(flag(args, "-c:v")).toBe("copy");
    expect(flag(args, "-c:a")).toBe("pcm_s24le");
    expect(args.filter((a) => a === "-map")).toHaveLength(2);
    expect(args).not.toContain("-movflags");
  });

  it("skips the audio map when silent and fast-starts MP4", () => {
    const args = muxArgs(ffmpegEncodingFor("h264", 1280, 720, 30), { concatList: "l", audio: null, output: "o.mp4" });
    expect(args.filter((a) => a === "-i")).toHaveLength(1);
    expect(args).not.toContain("-c:a");
    expect(flag(args, "-movflags")).toBe("+faststart");
  });

  it("writes an ffconcat list", () => {
    expect(concatList(["/s/a.mov", "/s/b.mov"])).toBe("ffconcat version 1.0\nfile '/s/a.mov'\nfile '/s/b.mov'\n");
  });
});

describe("memory limits", () => {
  it("keeps a raw chunk inside the budget, at least one frame", () => {
    const hd = framesPerSegment(1920, 1080);
    expect(hd * 1920 * 1080 * 4).toBeLessThanOrEqual(RAW_SEGMENT_BUDGET_BYTES);
    expect(hd).toBeGreaterThan(1);
    expect(framesPerSegment(3840, 2160)).toBeGreaterThanOrEqual(1);
    expect(framesPerSegment(16384, 16384)).toBe(1);
  });

  it("allows about a minute of 1080p ProRes 422 and much less 4K", () => {
    const hd = maxEncodableSeconds(ffmpegEncodingFor("prores", 1920, 1080, 30));
    const uhd = maxEncodableSeconds(ffmpegEncodingFor("prores", 3840, 2160, 30));
    expect(hd).toBeGreaterThanOrEqual(60);
    expect(uhd).toBeLessThan(hd / 3);
  });
});
