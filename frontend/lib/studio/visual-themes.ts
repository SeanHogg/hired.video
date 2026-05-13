/**
 * Visual themes + background presets — single source of truth shared by
 * the v1 classic sidebar (StudioSidebar.tsx) and the v2 canvas editor.
 *
 * Per the standing DRY rule: every "pick a theme" / "pick a background"
 * surface reads from these arrays. Adding a theme is one entry here and
 * both editors pick it up automatically.
 */

export interface VisualTheme {
  /** Stable id, used as the persisted theme handle on a project. */
  id: string;
  label: string;
  /** Maps to the worked-example template JSON file the v1 wizard loads. */
  file: string;
  desc: string;
  /** [primary, accent, surface] — primary is the canvas background, accent
   *  is the contrast colour widgets should use for headings/CTAs, surface
   *  is the body-text + chrome colour. */
  colors: [string, string, string];
  duration: number;
  motion: "minimal" | "moderate" | "energetic";
  pattern?: "hook-led" | "story-led" | "pivot-led";
}

export const VISUAL_THEMES: VisualTheme[] = [
  {
    id: "hook-led",
    label: "Hook-Led",
    file: "video-resume-hook-led",
    desc: "60s · Front-loads the achievement · Slate / sky · Fade",
    colors: ["#0f172a", "#38bdf8", "#1e293b"],
    duration: 60,
    motion: "moderate",
    pattern: "hook-led",
  },
  {
    id: "story-led",
    label: "Story-Led",
    file: "video-resume-story-led",
    desc: "75s · One project, deep · Stone / amber · Cut",
    colors: ["#0c0a09", "#f59e0b", "#292524"],
    duration: 75,
    motion: "minimal",
    pattern: "story-led",
  },
  {
    id: "pivot-led",
    label: "Pivot-Led",
    file: "video-resume-pivot-led",
    desc: "60s · Career switcher narrative · Emerald · Fade",
    colors: ["#064e3b", "#34d399", "#022c22"],
    duration: 60,
    motion: "moderate",
    pattern: "pivot-led",
  },
  {
    id: "professional",
    label: "Professional",
    file: "video-resume-professional",
    desc: "28s · Purple gradient · Fade · Moderate motion",
    colors: ["#7c3aed", "#2563eb", "#c4b5fd"],
    duration: 28,
    motion: "moderate",
  },
  {
    id: "minimal",
    label: "Minimal",
    file: "video-resume-minimal",
    desc: "20s · Dark monochrome · Cut · Subtle motion",
    colors: ["#18181b", "#3f3f46", "#a1a1aa"],
    duration: 20,
    motion: "minimal",
  },
];

export interface BgPreset {
  label: string;
  /** Value passed as video.theme.background + optional color encoded as
   *  "type:color1:color2" — backward-compatible with the v1 storyboard. */
  value: string;
  /** CSS background for the swatch. */
  preview: string;
  /** Solid colour used when applying to v2 canvas-state scene backgrounds
   *  (which doesn't currently animate gradients during preview). */
  solidColor: string;
}

export const BG_PRESETS: BgPreset[] = [
  {
    label: "Purple Gradient",
    value: "gradient:#7c3aed:#2563eb",
    preview: "linear-gradient(135deg,#7c3aed,#2563eb)",
    solidColor: "#5b3aed",
  },
  {
    label: "Sunset",
    value: "gradient:#f97316:#ec4899",
    preview: "linear-gradient(135deg,#f97316,#ec4899)",
    solidColor: "#f15a5a",
  },
  {
    label: "Ocean",
    value: "gradient:#0ea5e9:#06b6d4",
    preview: "linear-gradient(135deg,#0ea5e9,#06b6d4)",
    solidColor: "#0aa9d9",
  },
  {
    label: "Forest",
    value: "gradient:#16a34a:#065f46",
    preview: "linear-gradient(135deg,#16a34a,#065f46)",
    solidColor: "#0b7d48",
  },
  {
    label: "Dark Tech Grid",
    value: "dark-tech-grid:#7c3aed",
    preview: "linear-gradient(135deg,#0f0f23,#1e1b4b)",
    solidColor: "#16143a",
  },
  {
    label: "Particles",
    value: "particles:#7c3aed",
    preview: "radial-gradient(circle at 30% 30%,#7c3aed44,#1a0533)",
    solidColor: "#1a0533",
  },
  { label: "Midnight", value: "solid:#0f172a", preview: "#0f172a", solidColor: "#0f172a" },
  { label: "Charcoal", value: "solid:#18181b", preview: "#18181b", solidColor: "#18181b" },
];

export function findTheme(id: string): VisualTheme | null {
  return VISUAL_THEMES.find((t) => t.id === id) ?? null;
}
