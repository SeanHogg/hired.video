// Pure mapping from a resume template descriptor to the schematic thumbnail
// the template cards draw (layout family + accent swatch + serif flag). The
// card renders this as a light "paper" sketch instead of mounting a full
// DeclarativeResumeRenderer per card, so a grid of templates stays cheap and
// every surface (browse grid, home gallery, related strip) draws the same
// sketch for the same template.

import type { ThemeKey } from "@/lib/resume-template-themes";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

export type ThumbLayout = "hero" | "single" | "two" | "sidebar" | "photo";

export interface ThumbSpec {
  layout: ThumbLayout;
  /** Static Tailwind background class for the template's accent colour. */
  accentBg: string;
  serif: boolean;
}

/** Accent swatch per theme. Static strings so Tailwind JIT keeps them. The
 *  resume paper is always light (the renderer pins documents to light), so
 *  these are document colours, not app chrome. */
export const THEME_ACCENT_BG: Record<ThemeKey, string> = {
  "hired-purple": "bg-primary",
  "iron-gray": "bg-gray-600",
  "balanced-blue": "bg-sky-700",
  "trusted-taupe": "bg-stone-500",
  "assertive-asphalt": "bg-gray-800",
  "warm-amber": "bg-amber-700",
  "executive-navy": "bg-blue-900",
  "minimal-slate": "bg-slate-500",
  "dev-graphite": "bg-gray-900",
  "growth-emerald": "bg-emerald-700",
};

/**
 * Layout family:
 *  - hero document with a platform component block (career timeline) → "hero"
 *  - any other hero document (headshot-led)                           → "photo"
 *  - two-column print, sans type → coloured "sidebar"; serif/mono → "two"
 *  - everything else                                                  → "single"
 */
export function thumbLayoutFor(d: ResumeTemplateDescriptor): ThumbLayout {
  if (d.documentMode === "hero") {
    return d.sections.some((b) => b.kind === "component" && b.enabled) ? "hero" : "photo";
  }
  if (d.layout.columns === 2) {
    return d.theme.fontFamily === "sans" ? "sidebar" : "two";
  }
  return "single";
}

export function thumbSpecFor(d: ResumeTemplateDescriptor): ThumbSpec {
  return {
    layout: thumbLayoutFor(d),
    accentBg: THEME_ACCENT_BG[d.theme.themeKey] ?? "bg-primary",
    serif: d.theme.fontFamily === "serif",
  };
}
