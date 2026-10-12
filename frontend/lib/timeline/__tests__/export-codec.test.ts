/**
 * The export codec → WebCodecs encoder settings: H.264 by default (the
 * settings the fast path always used at 1080p), HEVC / VP9 when picked,
 * levels high enough for 4K, all muxed into MP4.
 */
import { describe, expect, it } from "vitest";
import { webcodecsVideoCodec } from "../export-codec";

describe("webcodecsVideoCodec", () => {
  it("defaults to the H.264 settings the fast path used at 1080p", () => {
    expect(webcodecsVideoCodec(undefined, 1920, 1080)).toEqual({ codec: "avc1.640028", muxer: "avc", bitrate: 4_000_000 });
    expect(webcodecsVideoCodec("h264", 1080, 1920).codec).toBe("avc1.640028");
  });

  it("uses the codec the owner picked", () => {
    expect(webcodecsVideoCodec("h265", 1920, 1080)).toMatchObject({ muxer: "hevc", codec: "hvc1.1.6.L123.B0" });
    expect(webcodecsVideoCodec("vp9", 1920, 1080)).toMatchObject({ muxer: "vp9", codec: "vp09.00.41.08" });
    expect(webcodecsVideoCodec("h265", 1920, 1080).bitrate).toBeLessThan(4_000_000);
  });

  it("picks a level that can encode 4K", () => {
    expect(webcodecsVideoCodec("h264", 3840, 2160)).toMatchObject({ codec: "avc1.640033", bitrate: 16_000_000 });
    expect(webcodecsVideoCodec("vp9", 2160, 3840).codec).toBe("vp09.00.51.08");
  });

  it("falls back to H.264 for codecs WebCodecs can't encode", () => {
    expect(webcodecsVideoCodec("prores", 1920, 1080).muxer).toBe("avc");
  });
});
