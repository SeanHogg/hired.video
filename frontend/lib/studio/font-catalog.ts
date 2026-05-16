/**
 * Font catalog — single source of truth for "what fonts can the studio
 * use?". Used by both editors and by the render facade.
 *
 * The `family` field is the CSS font-family stack written into the
 * widget's `style.fontFamily`. Adding a font requires (a) entry here +
 * (b) Google-Fonts preload in the page head so the render-time canvas
 * can paint it. The preload happens once at the editor shell mount.
 */

export interface FontPreset {
  id: string;
  label: string;
  /** CSS font-family stack. */
  family: string;
  /** Google Fonts URL (preconnect path) when applicable. `null` for
   *  system stacks that don't need a network load. */
  googleFontUrl: string | null;
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: "inter",
    label: "Inter",
    family: "'Inter', sans-serif",
    googleFontUrl:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
  },
  {
    id: "roboto",
    label: "Roboto",
    family: "'Roboto', sans-serif",
    googleFontUrl:
      "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    family: "'Montserrat', sans-serif",
    googleFontUrl:
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap",
  },
  {
    id: "playfair",
    label: "Playfair Display",
    family: "'Playfair Display', serif",
    googleFontUrl:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    family: "'JetBrains Mono', monospace",
    googleFontUrl:
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap",
  },
  {
    id: "system",
    label: "System default",
    family: "system-ui, sans-serif",
    googleFontUrl: null,
  },
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

/**
 * Inject `<link rel="stylesheet" href={googleFontUrl}>` tags for every
 * non-system font preset, idempotent across mounts (#581). Call once at
 * the editor shell so text widgets paint with their preset typography
 * instead of falling back to system stacks until the network catches up.
 */
export function preloadStudioFonts(): void {
  if (typeof document === "undefined") return;
  for (const preset of FONT_PRESETS) {
    if (!preset.googleFontUrl) continue;
    const existing = document.head.querySelector(
      `link[data-studio-font="${preset.id}"]`,
    );
    if (existing) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = preset.googleFontUrl;
    link.dataset.studioFont = preset.id;
    document.head.appendChild(link);
  }
}
