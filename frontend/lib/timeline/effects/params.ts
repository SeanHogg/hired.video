// Shared effect-param primitives — the ONE home for the tiny coercion/clamp
// helpers every timeline effect needs when reading its untyped `params` bag.

/** Clamp to [0, 1]. NaN passes through unchanged (matches Math.max/min). */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Wrap into [0, 1) (hue rotation). */
export function wrap01(v: number): number {
  let x = v;
  while (x < 0) x += 1;
  while (x >= 1) x -= 1;
  return x;
}

/** Clamp to [0, 255] (a pixel channel byte; no rounding). */
export function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** `v` when it is a finite number, else `fallback` (NaN/±Infinity/non-numbers fall back). */
export function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** `v` when it is a string (including ""), else `fallback`. */
export function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
