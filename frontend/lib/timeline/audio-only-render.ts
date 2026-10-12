/**
 * Audio-only render strategy.
 *
 * The third render engine, alongside WebCodecs (fast-path video) and
 * ffmpeg.wasm (heavy-path video). Selected by `pickRenderEngine()` in
 * shared/timeline.ts when the Timeline has zero video-track clips —
 * i.e. podcasts, voice templates, and any video project the user
 * emptied of v-tracks before exporting.
 *
 * Pipeline:
 *   1. Mix every audio track to a single stereo 48 kHz AudioBuffer via
 *      `renderTimelineAudio()` — the existing offline mixer that the
 *      WebCodecs strategy already uses for AV exports. Per the standing
 *      DRY rule, there is exactly ONE place that knows how to turn
 *      Timeline audio clips into PCM.
 *   2. Encode the AudioBuffer to a downloadable Blob.
 *
 * Phase 2 ships with WAV-only encoding (`audioBufferToWav`, the inlined
 * 16-bit PCM encoder we already use for in-Studio music bounces). MP3 /
 * M4A / Opus emit via ffmpeg.wasm transcode of the WAV blob — wiring
 * that branch lands when the ffmpeg.wasm strategy stops being a skeleton
 * (NLE M3). Until then `audio-only` returns a WAV regardless of the
 * `OutputProfile` the user picked, and the editor surfaces a "transcoded
 * to MP3/M4A on export — coming soon" hint per the upcoming gap entry.
 */

import type { RenderStrategy } from "./render";
import { renderTimelineAudio } from "./audio-mixer";
import { audioBufferToWav } from "@/lib/audio/wav";

export const audioOnlyStrategy: RenderStrategy = {
  id: "audio-only",

  async isAvailable() {
    // OfflineAudioContext is the only hard dependency. Available
    // everywhere we already run the editor (Web Audio is a baseline
    // requirement for the existing voiceover + music surfaces).
    if (typeof OfflineAudioContext === "undefined") return false;
    return true;
  },

  async render(timeline, sources, opts) {
    opts.onProgress?.(0);

    const audioBuffer = await renderTimelineAudio(timeline, sources, {
      resolveNestedTimeline: opts.resolveNestedTimeline,
    });
    if (!audioBuffer) {
      throw new Error(
        "Audio-only render needs at least one audible audio clip — " +
        "every track was muted, soloed-out, or empty.",
      );
    }

    opts.onProgress?.(0.9);

    const wavBytes = audioBufferToWav(audioBuffer);
    const blob = new Blob([wavBytes], { type: "audio/wav" });
    const durationSeconds = audioBuffer.duration;

    opts.onProgress?.(1);

    return {
      blob,
      mime: "audio/wav",
      durationSeconds,
      engine: "audio-only",
    };
  },
};
