/**
 * Per-scene colour-grading filter shape. Mirrors v1's
 * `script.video.theme.filters: VideoFilters` so the same renderer can
 * consume either editor's output.
 *
 * Single source of truth — FILTER_DEFS describes every slider's range,
 * default, and CSS-filter mapping so the picker UI + the canvas-v2
 * render-side applier never disagree.
 */

export interface VideoFilters {
  brightness: number; // 0..2
  contrast: number;   // 0..2
  saturation: number; // 0..2
  hue: number;        // -180..180 (degrees)
  blur: number;       // 0..10 (px)
  warmth: number;     // -1..1 (cool ↔ warm tint)
}

export interface FilterDef {
  id: keyof VideoFilters;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** Convert the slider value to a CSS filter fragment. Used by the
   *  in-editor preview (we apply CSS filter for cheap immediate
   *  feedback); the render side runs the same math against the canvas
   *  pixel buffer for export. */
  toCss(value: number): string;
}

export const FILTER_DEFS: FilterDef[] = [
  {
    id: "brightness",
    label: "Brightness",
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: 1,
    toCss: (v) => `brightness(${v})`,
  },
  {
    id: "contrast",
    label: "Contrast",
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: 1,
    toCss: (v) => `contrast(${v})`,
  },
  {
    id: "saturation",
    label: "Saturation",
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: 1,
    toCss: (v) => `saturate(${v})`,
  },
  {
    id: "hue",
    label: "Hue",
    min: -180,
    max: 180,
    step: 5,
    defaultValue: 0,
    toCss: (v) => `hue-rotate(${v}deg)`,
  },
  {
    id: "blur",
    label: "Blur",
    min: 0,
    max: 10,
    step: 0.5,
    defaultValue: 0,
    toCss: (v) => `blur(${v}px)`,
  },
  {
    id: "warmth",
    label: "Warmth",
    min: -1,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    // Warmth is approximated as sepia + hue-shift for in-editor preview.
    // Render-side applies a colour matrix for accuracy.
    toCss: (v) =>
      v === 0 ? "" : `sepia(${Math.abs(v)}) hue-rotate(${v > 0 ? 0 : -25}deg)`,
  },
];

export const DEFAULT_FILTERS: VideoFilters = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  warmth: 0,
};

export function isIdentityFilters(filters: VideoFilters | null | undefined): boolean {
  if (!filters) return true;
  return (
    filters.brightness === 1 &&
    filters.contrast === 1 &&
    filters.saturation === 1 &&
    filters.hue === 0 &&
    filters.blur === 0 &&
    filters.warmth === 0
  );
}

/** Compose a single CSS filter string from the filter values. Returns
 *  empty string when filters are identity, so consumers can short-
 *  circuit (no-op DOM update). */
export function filtersToCss(filters: VideoFilters | null | undefined): string {
  if (!filters || isIdentityFilters(filters)) return "";
  return FILTER_DEFS.map((def) => def.toCss(filters[def.id])).filter(Boolean).join(" ");
}
