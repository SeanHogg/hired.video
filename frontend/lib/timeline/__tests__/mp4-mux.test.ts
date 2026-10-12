/**
 * The MP4 mux seam (#522 — mediabunny behind `createMp4Mux`). jsdom has no
 * WebCodecs, so the chunk classes are stubbed with the same surface the
 * browser's `EncodedVideoChunk` / `EncodedAudioChunk` expose (type,
 * timestamp µs, duration µs, byteLength, copyTo). Decoder configs are the
 * shapes Chrome's VideoEncoder (VP9 720p) and AudioEncoder (AAC-LC 48 kHz
 * stereo, AudioSpecificConfig 0x11 0x90) hand to their first output.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMp4Mux } from "../mp4-mux";

class FakeChunk {
  type: "key" | "delta";
  timestamp: number;
  duration: number;
  private data: Uint8Array;
  constructor(init: { type: "key" | "delta"; timestamp: number; duration: number; data: Uint8Array }) {
    this.type = init.type;
    this.timestamp = init.timestamp;
    this.duration = init.duration;
    this.data = init.data;
  }
  get byteLength() {
    return this.data.byteLength;
  }
  copyTo(dest: Uint8Array) {
    dest.set(this.data);
  }
}
class FakeVideoChunk extends FakeChunk {}
class FakeAudioChunk extends FakeChunk {}

beforeAll(() => {
  vi.stubGlobal("EncodedVideoChunk", FakeVideoChunk);
  vi.stubGlobal("EncodedAudioChunk", FakeAudioChunk);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const FPS = 30;
const VP9_720P: EncodedVideoChunkMetadata = {
  decoderConfig: { codec: "vp09.00.31.08", codedWidth: 1280, codedHeight: 720 },
};
const AAC_LC_48K: EncodedAudioChunkMetadata = {
  decoderConfig: { codec: "mp4a.40.2", numberOfChannels: 2, sampleRate: 48_000, description: new Uint8Array([0x11, 0x90]) },
};

function videoChunk(i: number): EncodedVideoChunk {
  return new FakeVideoChunk({
    // Keyframe every 2 s, as the render worker requests.
    type: i % (FPS * 2) === 0 ? "key" : "delta",
    timestamp: Math.round((i / FPS) * 1_000_000),
    duration: Math.round(1_000_000 / FPS),
    data: new Uint8Array([0x82, 0x49, 0x83, i & 0xff]),
  }) as unknown as EncodedVideoChunk;
}

function audioChunk(i: number): EncodedAudioChunk {
  return new FakeAudioChunk({
    type: "key",
    timestamp: Math.round(((i * 1024) / 48_000) * 1_000_000),
    duration: Math.round((1024 / 48_000) * 1_000_000),
    data: new Uint8Array([0x21, 0x10, i & 0xff]),
  }) as unknown as EncodedAudioChunk;
}

/** Box-level view of the file: type order + each track's stsz sample count. */
function inspect(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder("latin1").decode(bytes);
  const view = new DataView(buffer);
  const sampleCounts: number[] = [];
  for (let p = text.indexOf("stsz"); p >= 0; p = text.indexOf("stsz", p + 4)) {
    // 'stsz' + version/flags (4) + sample_size (4) → sample_count.
    sampleCounts.push(view.getUint32(p + 12));
  }
  return {
    firstBox: text.slice(4, 8),
    moovBeforeMdat: text.indexOf("moov") >= 0 && text.indexOf("moov") < text.indexOf("mdat"),
    hasVp9: text.includes("vp09"),
    hasAac: text.includes("mp4a"),
    sampleCounts,
  };
}

describe("createMp4Mux", () => {
  it("muxes a video + AAC export into a fast-start MP4, keeping chunks added before start resolves", async () => {
    const mux = createMp4Mux({ video: { codec: "vp9", frameRate: FPS }, audio: { codec: "aac" } });
    // Synchronous adds, straight from encoder callbacks, before the output
    // has started — the seam must queue them in order.
    for (let i = 0; i < 65; i++) mux.addVideoChunk(videoChunk(i), i === 0 ? VP9_720P : undefined);
    for (let i = 0; i < 4; i++) mux.addAudioChunk(audioChunk(i), i === 0 ? AAC_LC_48K : undefined);

    const file = inspect(await mux.finalize());
    expect(file.firstBox).toBe("ftyp");
    expect(file.moovBeforeMdat).toBe(true);
    expect(file.hasVp9).toBe(true);
    expect(file.hasAac).toBe(true);
    expect(file.sampleCounts).toEqual([65, 4]);
  });

  it("writes a video-only file (proxy path) with exactly one frame", async () => {
    const mux = createMp4Mux({ video: { codec: "vp9", frameRate: FPS } });
    mux.addVideoChunk(videoChunk(0), VP9_720P);

    const file = inspect(await mux.finalize());
    expect(file.firstBox).toBe("ftyp");
    expect(file.hasAac).toBe(false);
    expect(file.sampleCounts).toEqual([1]);
  });

  it("refuses an audio chunk on a video-only output", () => {
    const mux = createMp4Mux({ video: { codec: "vp9" } });
    expect(() => mux.addAudioChunk(audioChunk(0), AAC_LC_48K)).toThrow(/video-only/);
  });

  it("surfaces a muxing failure from finalize (first packet without a decoder config)", async () => {
    const mux = createMp4Mux({ video: { codec: "vp9", frameRate: FPS } });
    mux.addVideoChunk(videoChunk(0));
    mux.addVideoChunk(videoChunk(1));
    await expect(mux.finalize()).rejects.toThrow(/metadata/i);
  });
});
