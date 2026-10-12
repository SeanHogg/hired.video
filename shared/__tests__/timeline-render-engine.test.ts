/**
 * The render engine honours the owner's export codec: H.264 / HEVC / VP9
 * (any size up to 4K) encode on WebCodecs; ProRes / DNxHD need ffmpeg.wasm.
 *
 * Run: node --import tsx --test shared/__tests__/timeline-render-engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyTimeline, isPostingCodec, pickRenderEngine, POSTING_EXPORT_CODEC, timelineForPosting, type Clip, type Timeline, type TimelineExportCodec } from "../timeline.js";

function withVideo(opts: { width?: number; height?: number; exportCodec?: TimelineExportCodec } = {}): Timeline {
  const timeline = emptyTimeline({ width: opts.width, height: opts.height });
  const clip = { id: "c1", sourceId: "s1", startFrame: 0, durationFrames: 30 } as Clip;
  timeline.tracks[0] = { ...timeline.tracks[0], clips: [clip] };
  return opts.exportCodec ? { ...timeline, exportCodec: opts.exportCodec } : timeline;
}

describe("pickRenderEngine and the export codec", () => {
  it("keeps H.264 (or no codec) on WebCodecs", () => {
    assert.equal(pickRenderEngine(withVideo()), "webcodecs");
    assert.equal(pickRenderEngine(withVideo({ exportCodec: "h264" })), "webcodecs");
  });

  it("encodes HEVC and VP9 on WebCodecs", () => {
    assert.equal(pickRenderEngine(withVideo({ exportCodec: "h265" })), "webcodecs");
    assert.equal(pickRenderEngine(withVideo({ exportCodec: "vp9" })), "webcodecs");
  });

  it("keeps 4K on WebCodecs (the strategy checks browser support)", () => {
    assert.equal(pickRenderEngine(withVideo({ width: 3840, height: 2160 })), "webcodecs");
  });

  it("routes ProRes and DNxHD to ffmpeg.wasm", () => {
    assert.equal(pickRenderEngine(withVideo({ exportCodec: "prores" })), "ffmpeg-wasm");
    assert.equal(pickRenderEngine(withVideo({ exportCodec: "dnxhd" })), "ffmpeg-wasm");
  });

  it("still routes an empty-video timeline to audio-only", () => {
    assert.equal(pickRenderEngine({ ...emptyTimeline(), exportCodec: "prores" }), "audio-only");
  });
});

describe("timelineForPosting — posting always renders H.264 MP4", () => {
  it("keeps H.264 (or no codec) timelines untouched", () => {
    const plain = withVideo();
    assert.equal(timelineForPosting(plain), plain);
    const h264 = withVideo({ exportCodec: "h264" });
    assert.equal(timelineForPosting(h264), h264);
    assert.equal(isPostingCodec(undefined), true);
    assert.equal(POSTING_EXPORT_CODEC, "h264");
  });

  it("strips download-only codecs so the posting render stays on WebCodecs H.264", () => {
    for (const codec of ["prores", "dnxhd", "h265", "vp9"] as const) {
      const posted = timelineForPosting(withVideo({ exportCodec: codec }));
      assert.equal(posted.exportCodec, undefined, codec);
      assert.equal(isPostingCodec(codec), false, codec);
      assert.equal(pickRenderEngine(posted), "webcodecs", codec);
    }
  });
});
