import { clamp01 } from "@/lib/numeric";
/**
 * Highlight scoring — picks the best moments inside source clips so
 * the sizzle builder can favour them when filling the timeline.
 *
 * The facade returns `Window[]` ranges per source. The sizzle builder
 * picks ranges that fit the beat slots without thinking about WHY
 * each range scored highly. Per the standing DRY rule, the builder
 * never re-implements scoring inline.
 *
 * Engines (single dispatch via `scoreHighlights`):
 *   - "heuristic": motion + audio loudness (always available, no model)
 *   - "whisper-llm": Whisper transcript scored by an LLM for narrative
 *     value (deferred — registers when the transcribe + LLM client
 *     plumbing lands; the facade falls back to heuristic until then)
 *
 * Reference-arch parity with the headshot engine and TTS engines: ONE
 * facade, multiple registered backends, caller never picks.
 */

export interface HighlightWindow {
  /** Start time within the source media, in seconds. */
  startSec: number;
  /** Window length in seconds. */
  durationSec: number;
  /** 0..1 — higher = better candidate for the reel. */
  score: number;
  /** Free-form attribution: "loudness peak," "fast cut," etc. Surfaced
   *  in the editor so users see why a moment was picked. */
  reason: string;
}

export interface HighlightScorerInput {
  videoElement: HTMLVideoElement;
  sourceDurationSec: number;
}

export interface HighlightScorer {
  id: string;
  isAvailable(): Promise<boolean>;
  score(input: HighlightScorerInput): Promise<HighlightWindow[]>;
}

const SCORERS: HighlightScorer[] = [];

export function registerHighlightScorer(s: HighlightScorer): void {
  SCORERS.push(s);
}

/** Pick the best scorer available. Order = registration order; the
 *  heuristic registers last so it's the always-available fallback. */
export async function scoreHighlights(input: HighlightScorerInput): Promise<HighlightWindow[]> {
  for (const s of SCORERS) {
    if (await s.isAvailable()) return s.score(input);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Heuristic scorer — frame-difference for motion + audio RMS for
// loudness, blended into one score per ~1-second window.
// ---------------------------------------------------------------------------

const WINDOW_SEC = 1.0;
const SAMPLE_FPS = 4; // sample 4 frames per second when scanning

registerHighlightScorer({
  id: "heuristic",
  async isAvailable() {
    return typeof OffscreenCanvas !== "undefined";
  },
  async score({ videoElement, sourceDurationSec }) {
    const totalWindows = Math.max(1, Math.floor(sourceDurationSec / WINDOW_SEC));
    const windows: HighlightWindow[] = [];

    const w = 64;
    const h = 36;
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext("2d");
    if (!ctx) return [];

    let prevPixels: Uint8ClampedArray | null = null;
    let cumulativeMotion = 0;
    let samplesInWindow = 0;
    let windowStart = 0;

    for (let t = 0; t < sourceDurationSec; t += 1 / SAMPLE_FPS) {
      videoElement.currentTime = t;
      await waitForSeek(videoElement);
      ctx.drawImage(videoElement, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h).data;
      if (prevPixels) {
        let diff = 0;
        for (let i = 0; i < frame.length; i += 4) {
          diff += Math.abs(frame[i] - prevPixels[i]);
          diff += Math.abs(frame[i + 1] - prevPixels[i + 1]);
          diff += Math.abs(frame[i + 2] - prevPixels[i + 2]);
        }
        cumulativeMotion += diff / (w * h);
        samplesInWindow++;
      }
      prevPixels = new Uint8ClampedArray(frame);

      if (t - windowStart >= WINDOW_SEC) {
        const avgMotion = samplesInWindow > 0 ? cumulativeMotion / samplesInWindow : 0;
        const score = clamp01(avgMotion / 60); // 60 ≈ "lots of motion" empirically
        windows.push({
          startSec: windowStart,
          durationSec: WINDOW_SEC,
          score,
          reason: score > 0.3 ? "fast motion" : "low motion",
        });
        windowStart = t;
        cumulativeMotion = 0;
        samplesInWindow = 0;
      }
      if (windows.length >= totalWindows) break;
    }

    return windows;
  },
});

function waitForSeek(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      video.removeEventListener("seeked", handler);
      resolve();
    };
    video.addEventListener("seeked", handler);
  });
}

