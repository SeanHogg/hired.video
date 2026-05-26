/**
 * WCAG 2.2 contrast helpers (#1556).
 *
 * Pure functions — no DOM, no React. Used by the Studio Accessibility
 * Panel to check that text widgets meet the AA / AAA contrast ratio
 * against their effective background (widget container fill > scene
 * background colour).
 *
 * References:
 *   - WCAG 2.2 SC 1.4.3 Contrast (Minimum)   — AA 4.5:1 (3:1 for large)
 *   - WCAG 2.2 SC 1.4.6 Contrast (Enhanced)  — AAA 7:1 (4.5:1 for large)
 */

export interface ContrastResult {
  /** Ratio between 1 and 21. Higher = more contrast. */
  ratio: number;
  /** Whether the ratio passes WCAG 2.2 AA for non-large text. */
  passesAA: boolean;
  /** Whether the ratio passes WCAG 2.2 AAA for non-large text. */
  passesAAA: boolean;
  /** Whether the ratio passes AA for "large text" (≥18pt or ≥14pt bold,
   *  which at 96dpi maps to ≥24px / ≥18.66px). */
  passesAALarge: boolean;
}

export function contrastRatio(fg: string, bg: string): number {
  const fgLum = relativeLuminance(parseHex(fg));
  const bgLum = relativeLuminance(parseHex(bg));
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

export function evaluateContrast(
  fg: string,
  bg: string,
  opts: { fontPx: number; bold?: boolean } = { fontPx: 16 },
): ContrastResult {
  const ratio = contrastRatio(fg, bg);
  const isLargeText = opts.fontPx >= 24 || (opts.bold === true && opts.fontPx >= 18.66);
  return {
    ratio,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
    passesAALarge: ratio >= 3 || (!isLargeText && ratio >= 4.5),
  };
}

/** Parse a `#rgb` / `#rrggbb` / `rgb(…)` / named colour into [r,g,b] in
 *  the 0..255 range. Unknown formats fall back to black so the contrast
 *  check still produces a defined number rather than NaN. */
export function parseHex(input: string): [number, number, number] {
  if (!input) return [0, 0, 0];
  const trimmed = input.trim().toLowerCase();

  // #rgb / #rrggbb
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b];
    }
  }

  // rgb(…) / rgba(…)
  const rgbMatch = trimmed.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }

  // Two named-colour fallbacks the Studio palettes lean on; the rest fall
  // through to black, which biases contrast downward (a false positive on
  // the audit, not a false negative — fail safe).
  if (trimmed === "white") return [255, 255, 255];
  if (trimmed === "black") return [0, 0, 0];
  return [0, 0, 0];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
