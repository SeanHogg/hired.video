/**
 * Linked content registry — single source of truth for "what kinds of
 * user-created entities can be embedded as a draggable card on the v2
 * canvas?"
 *
 * Adding a new entity kind (job / profile / company / video / template)
 * is one entry here (a meta file beside this one, wired into
 * `LINKED_CONTENT_REGISTRY`) + one body in
 * `components/studio/v2/inline-bodies/registry.ts`. Every surface that
 * touches linked content — palette section, drag protocol, canvas
 * preview body, inspector, timeline serializer — reads from these maps.
 * There are no parallel switch statements on entity kind anywhere else.
 *
 * Per the standing DRY rule: shared logic (icon, view URL, list fetch,
 * preview fetch, CTA label) lives in one place; the components that
 * render linked content decide their own visibility / empty states by
 * inspecting the same registry.
 */
import { VISUAL_THEMES } from "../../visual-themes";
import type { LinkedContentKind, LinkedContentMeta } from "./types";
import { RESUME_LINKED_CONTENT } from "./resume";
import { JOB_LINKED_CONTENT } from "./job";
import { ARTICLE_LINKED_CONTENT } from "./article";
import { PROFILE_LINKED_CONTENT } from "./profile";
import { COMPANY_LINKED_CONTENT } from "./company";
import { VIDEO_LINKED_CONTENT } from "./video";

export type { LinkedContentKind, LinkedContentSummary } from "./types";

export const LINKED_CONTENT_REGISTRY: Record<LinkedContentKind, LinkedContentMeta> = {
  resume: RESUME_LINKED_CONTENT,
  job: JOB_LINKED_CONTENT,
  article: ARTICLE_LINKED_CONTENT,
  profile: PROFILE_LINKED_CONTENT,
  company: COMPANY_LINKED_CONTENT,
  video: VIDEO_LINKED_CONTENT,
};

const REF_SEPARATOR = ":";

/** Pack `(kind, id)` into a single dataTransfer payload string. Mirrors
 *  the music-source `kind:trackId` shape so the protocol layer stays a
 *  flat `data: string` channel — no second sidecar MIME per entity field. */
export function encodeLinkedContentRef(kind: LinkedContentKind, id: string): string {
  return `${kind}${REF_SEPARATOR}${id}`;
}

export function parseLinkedContentRef(
  ref: string,
): { kind: LinkedContentKind; id: string } | null {
  const idx = ref.indexOf(REF_SEPARATOR);
  if (idx <= 0) return null;
  const kind = ref.slice(0, idx);
  const id = ref.slice(idx + 1);
  if (!id) return null;
  if (!isLinkedContentKind(kind)) return null;
  return { kind, id };
}

export function isLinkedContentKind(value: string): value is LinkedContentKind {
  return Object.prototype.hasOwnProperty.call(LINKED_CONTENT_REGISTRY, value);
}

export function getLinkedContentMeta(kind: LinkedContentKind): LinkedContentMeta {
  return LINKED_CONTENT_REGISTRY[kind];
}

/**
 * Resolved CTA pill typography for a linked-content widget. The widget
 * lets the author override the kind-default label + font; this helper
 * is the single seam BOTH the DOM `<CtaPill>` AND the canvas-2D
 * `canvas-v2:linked-content` applier consume so the pill renders the
 * same text + font choice on every surface (editor, playback, export).
 *
 * Caller passes the per-widget overrides (`ctaText`, `ctaFontPx`,
 * `ctaFontWeight`, `ctaFontFamily`) plus the resolved entity kind; we
 * fall back to the kind-default `ctaLabel` and sensible typography
 * defaults so an un-customised widget keeps its current look. Each
 * field is required on the returned shape — neither renderer has to
 * re-derive a fallback inline.
 */
export interface LinkedContentCtaTypography {
  /** Final label rendered inside the pill. */
  label: string;
  /**
   * Explicit pixel font size. When `null`, the canvas-2D applier falls
   * back to its `min(w, h) * 0.06` bounding-box heuristic and the DOM
   * pill inherits its parent's CSS size — the per-surface defaults the
   * widget shipped with before #850. Numeric override pins the same
   * size on both surfaces.
   */
  fontPx: number | null;
  /** `"bold"` (default) or `"normal"`. */
  fontWeight: "normal" | "bold";
  /** Font-family stack. `"sans-serif"` on canvas; the DOM pill maps the
   *  same value into its `style.fontFamily` so both surfaces resolve
   *  the same glyph set. */
  fontFamily: string;
}

export interface LinkedContentCtaOverrides {
  ctaText?: string;
  ctaFontPx?: number;
  ctaFontWeight?: "normal" | "bold";
  ctaFontFamily?: string;
}

export function resolveLinkedContentCtaTypography(
  kind: LinkedContentKind,
  overrides: LinkedContentCtaOverrides | null | undefined,
): LinkedContentCtaTypography {
  const meta = getLinkedContentMeta(kind);
  const text = overrides?.ctaText?.trim();
  return {
    label: text && text.length > 0 ? text : meta.ctaLabel,
    fontPx:
      typeof overrides?.ctaFontPx === "number" &&
      Number.isFinite(overrides.ctaFontPx) &&
      overrides.ctaFontPx > 0
        ? overrides.ctaFontPx
        : null,
    fontWeight: overrides?.ctaFontWeight === "normal" ? "normal" : "bold",
    fontFamily:
      typeof overrides?.ctaFontFamily === "string" &&
      overrides.ctaFontFamily.trim().length > 0
        ? overrides.ctaFontFamily.trim()
        : "sans-serif",
  };
}

/** Every kind registered in `LINKED_CONTENT_REGISTRY` — drives the
 *  palette's section ordering and the inspector's "switch kind" picker. */
export const LINKED_CONTENT_KINDS = Object.keys(
  LINKED_CONTENT_REGISTRY,
) as LinkedContentKind[];

// ───────────────────────────────────────────────────────────────────────────
// Theme integration — single source of truth for "what colours does a
// linked-content card adopt from the active canvas theme / palette?"
// Read by `makeLinkedContentWidget` (initial stamp on insert) AND by
// `applyThemeToState` (re-stamp when the user switches themes) so the
// two paths can't drift.
// ───────────────────────────────────────────────────────────────────────────

/** Colour set rendered by `LinkedContentBody`. Mirrors the CTA widget's
 *  per-widget colour pattern — `bgColor` is the card body; `textColor`
 *  and `mutedColor` carry headline / secondary text; `accentColor` paints
 *  the CTA pill + icon chip; `accentTextColor` is the CTA pill label.
 *  Every field is required on this resolved shape (the optional fields
 *  on `LinkedContentWidgetParams` are filled by `resolveLinkedContentColors`
 *  at stamp time, so the body component never has to default). */
export interface LinkedContentColors {
  bgColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  accentTextColor: string;
}

/** Conservative fallback when no theme + no palette is active. White card
 *  on the slate / indigo palette is the same look V1 ships for stock
 *  cards everywhere else in the app, so a no-theme canvas feels native. */
export const DEFAULT_LINKED_CONTENT_COLORS: LinkedContentColors = {
  bgColor: "#ffffff",
  textColor: "#0f172a",
  mutedColor: "#64748b",
  accentColor: "#4f46e5",
  accentTextColor: "#ffffff",
};

/** Read [primary, accent, surface] for the canvas state — palette
 *  overrides theme triple slot-by-slot, mirroring `applyThemeToState`'s
 *  precedence rule (#582). Returns null when neither is set so callers
 *  can fall through to the conservative default. */
function readPaletteTriple(
  state: Pick<
    import("../canvas-state").CanvasState,
    "colorPalette" | "themeId"
  >,
): { primary: string; accent: string; surface: string } | null {
  const theme = state.themeId
    ? VISUAL_THEMES.find((t) => t.id === state.themeId)
    : null;
  const palette = state.colorPalette;
  const primary = palette?.[0] ?? theme?.colors[0];
  const accent = palette?.[1] ?? theme?.colors[1];
  const surface = palette?.[2] ?? theme?.colors[2];
  if (!primary || !accent || !surface) return null;
  return { primary, accent, surface };
}

/** WCAG-style relative luminance gate. Hex must be `#rrggbb` —
 *  shorthand / rgba / named colours bail to "light" so callers fall
 *  through to dark text (safer default). */
function isDark(hex: string): boolean {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L < 0.5;
}

/** Pick `#0f172a` or `#ffffff` for readable text over `bg`. Shared with
 *  the accent-pill so the CTA stays legible even when the theme's
 *  accent is dark (e.g. emerald palettes). */
function pickContrast(bg: string): string {
  return isDark(bg) ? "#ffffff" : "#0f172a";
}

/** Resolve the colour set a freshly-inserted linked-content card should
 *  adopt, given the active canvas theme / palette. Card bg = surface
 *  (the "body-text + chrome colour" per the VisualTheme contract — it's
 *  the panel-ish shade in every shipped theme). Text colours derive via
 *  contrast against bg so a dark-cinematic theme (e.g. "Story-Led") gets
 *  light text and a bright theme gets dark text without per-theme tuning. */
export function resolveLinkedContentColors(
  state: Pick<
    import("../canvas-state").CanvasState,
    "colorPalette" | "themeId"
  >,
): LinkedContentColors {
  const triple = readPaletteTriple(state);
  if (!triple) return DEFAULT_LINKED_CONTENT_COLORS;
  const bgColor = triple.surface;
  const textColor = pickContrast(bgColor);
  const mutedColor = isDark(bgColor) ? "#cbd5e1" : "#64748b";
  const accentColor = triple.accent;
  const accentTextColor = pickContrast(accentColor);
  return { bgColor, textColor, mutedColor, accentColor, accentTextColor };
}

/** Apply current-state colours to a `LinkedContentWidgetParams`. Used
 *  both at insert time (to seed the card) and by `applyThemeToState` (to
 *  re-stamp every linked-content widget when the theme changes).
 *  Splitting this from `resolveLinkedContentColors` lets callers reuse
 *  the same resolved triple across many widgets in one walk. */
export function stampLinkedContentColors(
  data: import("../canvas-state").LinkedContentWidgetParams,
  colors: LinkedContentColors,
): import("../canvas-state").LinkedContentWidgetParams {
  return { ...data, ...colors };
}

/** Theme-aware colour set for an engagement-asset card (#1587). Reuses
 *  `resolveLinkedContentColors` so engagement cards and linked-content
 *  cards can't drift apart — engagement params carry the same four
 *  colour fields (no `mutedColor`), so we project the relevant subset.
 *  Stamped at insert time and re-stamped by `applyThemeToState`, exactly
 *  like linked-content. */
export function stampEngagementAssetColors(
  data: import("../canvas-state").EngagementAssetWidgetParams,
  state: Pick<import("../canvas-state").CanvasState, "colorPalette" | "themeId">,
): import("../canvas-state").EngagementAssetWidgetParams {
  const { bgColor, textColor, accentColor, accentTextColor } =
    resolveLinkedContentColors(state);
  return { ...data, bgColor, textColor, accentColor, accentTextColor };
}
