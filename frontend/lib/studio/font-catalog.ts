/**
 * Font catalog — single source of truth for "what fonts can the studio
 * use?". Used by both editors and by the render facade.
 *
 * Fonts are SELF-HOSTED (bundled via `@fontsource/*`) rather than
 * runtime-loaded from `fonts.googleapis.com`. The studio enforces
 * `Cross-Origin-Embedder-Policy: credentialless` (for ffmpeg.wasm's
 * SharedArrayBuffer in the export path), and runtime cross-origin font
 * loading is incompatible with that + the Workbox CacheFirst service
 * worker — the opaque cross-origin response made `caches.match` throw
 * and the `<link>` fetches failed with `net::ERR_FAILED` on every
 * editor mount. Importing the `@fontsource` CSS here makes the faces
 * same-origin, available from first paint, offline-safe, and free of
 * any third-party dependency. The latin 400/700 subsets mirror the
 * weights the old Google Fonts URLs requested (`wght@400;700`).
 *
 * Because this module sits in the studio dependency graph only, the
 * font assets code-split into the studio chunks — non-studio routes
 * don't pay for them. Adding a font is one `@fontsource` install + its
 * two CSS imports + one `FONT_PRESETS` entry; there is no page-head
 * preload step to remember anymore.
 */
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/playfair-display/latin-400.css";
import "@fontsource/playfair-display/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";

export interface FontPreset {
  id: string;
  label: string;
  /** CSS font-family stack written into the widget's `style.fontFamily`. */
  family: string;
}

export const FONT_PRESETS: FontPreset[] = [
  { id: "inter", label: "Inter", family: "'Inter', sans-serif" },
  { id: "roboto", label: "Roboto", family: "'Roboto', sans-serif" },
  { id: "montserrat", label: "Montserrat", family: "'Montserrat', sans-serif" },
  { id: "playfair", label: "Playfair Display", family: "'Playfair Display', serif" },
  { id: "jetbrains", label: "JetBrains Mono", family: "'JetBrains Mono', monospace" },
  { id: "system", label: "System default", family: "system-ui, sans-serif" },
];

export function findFontPreset(id: string | null | undefined): FontPreset | null {
  if (!id) return null;
  return FONT_PRESETS.find((f) => f.id === id) ?? null;
}

/** Resolve a font id to its CSS family stack. Falls through to the
 *  system stack for unknown ids so missing fonts never crash. */
export function fontFamilyFor(id: string | null | undefined): string {
  return findFontPreset(id)?.family ?? "system-ui, sans-serif";
}
