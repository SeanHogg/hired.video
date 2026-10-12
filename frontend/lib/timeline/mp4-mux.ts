/**
 * The MP4 muxer seam — the ONE place the render pipeline turns WebCodecs
 * encoder output into an MP4 file. Used by the render-encode worker (studio
 * export) and the proxy generator. Backed by `mediabunny` (#522: the
 * deprecated `mp4-muxer` / `webm-muxer` packages are gone); callers only see
 * this interface, so a future muxer swap touches this file alone.
 *
 * Shape: create → `addVideoChunk` / `addAudioChunk` straight from the
 * encoders' `output` callbacks (synchronous, in decode order) → `finalize()`
 * returns the finished file. Every write is chained behind `output.start()`,
 * so a chunk that arrives before the output is ready is queued, not dropped,
 * and the first failure surfaces from `finalize()`.
 */
import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

/** The MP4 video track codec family (see lib/timeline/export-codec). */
export type Mp4VideoCodec = "avc" | "hevc" | "vp9";

export interface Mp4MuxConfig {
  video: { codec: Mp4VideoCodec; frameRate?: number };
  /** AAC audio track; omit for a video-only file. */
  audio?: { codec: "aac" } | null;
}

export interface Mp4Mux {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  /** Waits for every queued chunk, writes the moov (fast-start) and returns the file. */
  finalize(): Promise<ArrayBuffer>;
}

export function createMp4Mux(config: Mp4MuxConfig): Mp4Mux {
  const target = new BufferTarget();
  const output = new Output({
    // In-memory fast start: moov ahead of mdat, so the file streams on the
    // web (same layout mp4-muxer's `fastStart: "in-memory"` produced).
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const video = new EncodedVideoPacketSource(config.video.codec);
  output.addVideoTrack(video, config.video.frameRate ? { frameRate: config.video.frameRate } : undefined);
  const audio = config.audio ? new EncodedAudioPacketSource(config.audio.codec) : null;
  if (audio) output.addAudioTrack(audio);

  // One ordered chain: packets must reach the muxer in decode order, and
  // nothing may be added before `start()` resolves.
  let chain: Promise<void> = output.start();
  const enqueue = (write: () => Promise<void>) => {
    chain = chain.then(write);
    // Keep an unobserved rejection from surfacing as "unhandled" before
    // finalize() awaits the chain (which rethrows it).
    chain.catch(() => {});
  };

  return {
    addVideoChunk(chunk, meta) {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      enqueue(() => video.add(packet, meta));
    },
    addAudioChunk(chunk, meta) {
      if (!audio) throw new Error("mp4-mux: audio chunk added to a video-only output");
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      enqueue(() => audio.add(packet, meta));
    },
    async finalize() {
      await chain;
      await output.finalize();
      if (!target.buffer) throw new Error("mp4-mux: output produced no buffer");
      return target.buffer;
    },
  };
}
