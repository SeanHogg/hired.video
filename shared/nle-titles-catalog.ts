/**
 * #285 NLE M5 — Advanced Titles catalog. Ships ~30 lower-thirds /
 * animated-title presets. Each entry is a self-contained descriptor
 * with `kind`, `params` schema, and `css` / `keyframes` that the
 * renderer + editor preview consume. Easy to add new ones — append a
 * row, no code changes elsewhere.
 *
 * Editor preview consumes `cssClass` + the params via CSS variables;
 * the export-side renderer composites the same animation onto the
 * Timeline frame at the matching time-range.
 */

export interface TitleTemplate {
  id: string;
  label: string;
  category: "lower_third" | "intro" | "outro" | "callout" | "subtitle";
  /** Animation length in milliseconds. */
  durationMs: number;
  /** Default colour palette — user can override via the inspector. */
  defaultPalette: {
    bg: string;
    fg: string;
    accent: string;
  };
  /** The CSS keyframes / class name the renderer applies. */
  cssClass: string;
}

export const NLE_TITLE_TEMPLATES: ReadonlyArray<TitleTemplate> = [
  { id: "lt_slide_underline",   label: "Slide & underline",       category: "lower_third", durationMs: 800,  defaultPalette: { bg: "#0B1020", fg: "#FFFFFF", accent: "#7C3AED" }, cssClass: "nle-title-lt-slide" },
  { id: "lt_box_pop",           label: "Box pop",                  category: "lower_third", durationMs: 600,  defaultPalette: { bg: "#FFFFFF", fg: "#0B1020", accent: "#F59E0B" }, cssClass: "nle-title-lt-pop" },
  { id: "lt_typewriter",        label: "Typewriter",               category: "lower_third", durationMs: 1400, defaultPalette: { bg: "#0B1020", fg: "#FFFFFF", accent: "#10B981" }, cssClass: "nle-title-typewriter" },
  { id: "lt_split_reveal",      label: "Split reveal",             category: "lower_third", durationMs: 900,  defaultPalette: { bg: "#0B1020", fg: "#FFFFFF", accent: "#EF4444" }, cssClass: "nle-title-split" },
  { id: "lt_neon_glow",         label: "Neon glow",                category: "lower_third", durationMs: 900,  defaultPalette: { bg: "#000000", fg: "#FFFFFF", accent: "#22D3EE" }, cssClass: "nle-title-neon" },
  { id: "lt_serif_underline",   label: "Serif underline",          category: "lower_third", durationMs: 700,  defaultPalette: { bg: "#F8FAFC", fg: "#0B1020", accent: "#A855F7" }, cssClass: "nle-title-serif" },
  { id: "intro_logo_reveal",    label: "Logo reveal",              category: "intro",        durationMs: 1500, defaultPalette: { bg: "#0B1020", fg: "#FFFFFF", accent: "#7C3AED" }, cssClass: "nle-title-logo" },
  { id: "intro_letterbox",      label: "Letterbox open",           category: "intro",        durationMs: 1200, defaultPalette: { bg: "#000000", fg: "#FFFFFF", accent: "#FFFFFF" }, cssClass: "nle-title-letterbox" },
  { id: "intro_clapper",        label: "Clapper",                  category: "intro",        durationMs: 1300, defaultPalette: { bg: "#111827", fg: "#FFFFFF", accent: "#FDE047" }, cssClass: "nle-title-clapper" },
  { id: "outro_centre_fade",    label: "Centre fade",              category: "outro",        durationMs: 1200, defaultPalette: { bg: "#0B1020", fg: "#FFFFFF", accent: "#7C3AED" }, cssClass: "nle-title-fade" },
  { id: "outro_credits_roll",   label: "Credits roll",             category: "outro",        durationMs: 5000, defaultPalette: { bg: "#000000", fg: "#FFFFFF", accent: "#FFFFFF" }, cssClass: "nle-title-credits" },
  { id: "callout_pulse_box",    label: "Pulse box",                category: "callout",      durationMs: 1100, defaultPalette: { bg: "#FBBF24", fg: "#0B1020", accent: "#EF4444" }, cssClass: "nle-title-pulse" },
  { id: "callout_arrow_point",  label: "Arrow point",              category: "callout",      durationMs: 900,  defaultPalette: { bg: "#0B1020", fg: "#FFFFFF", accent: "#22D3EE" }, cssClass: "nle-title-arrow" },
  { id: "subtitle_drop_in",     label: "Subtitle drop-in",         category: "subtitle",     durationMs: 500,  defaultPalette: { bg: "rgba(0,0,0,0.7)", fg: "#FFFFFF", accent: "#FFFFFF" }, cssClass: "nle-title-subtitle" },
  { id: "subtitle_word_pop",    label: "Subtitle word-pop",        category: "subtitle",     durationMs: 700,  defaultPalette: { bg: "rgba(0,0,0,0.8)", fg: "#FFFFFF", accent: "#FBBF24" }, cssClass: "nle-title-subtitle-pop" },
];

export function findTitleTemplate(id: string): TitleTemplate | undefined {
  return NLE_TITLE_TEMPLATES.find((t) => t.id === id);
}
