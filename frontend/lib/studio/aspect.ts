/**
 * Aspect-ratio helpers — one place to convert between the studio's
 * `"W:H"` string form (`video.aspect` on the persisted script) and the
 * numeric ratio CSS understands (`aspect-ratio: 1.7777…`).
 *
 * Both forms appear in the wild:
 *   • Backend `videos.storyboard.video.aspect` is a string like `"16:9"`.
 *   • Older callers and CSS expect a number like 16/9 = 1.7777.
 *
 * Centralised so AspectFrame, VideoPlayer, and any aspect-aware logic
 * share one parser + the same fallback (16:9) on missing/invalid input.
 */

export type AspectRatioInput = number | string | null | undefined;

/** Default fallback ratio (16:9) — matches the historical hardcoded
 *  `aspect-video` so missing metadata stays visually identical. */
export const DEFAULT_ASPECT_RATIO = 16 / 9;

/** Parse a ratio string like "16:9" / "9:16" / "1:1" / "4:3" into a
 *  number. Returns null on unparseable input so callers can decide
 *  whether to fall back. */
export function parseAspectString(input: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(input);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
}

/** Coerce any accepted input form into a numeric ratio, falling back to
 *  16:9 when the input is missing or unparseable. */
export function parseAspectRatio(input: AspectRatioInput): number {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return input;
  }
  if (typeof input === "string") {
    const parsed = parseAspectString(input);
    if (parsed != null) return parsed;
  }
  return DEFAULT_ASPECT_RATIO;
}
