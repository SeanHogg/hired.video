/**
 * resolveDocumentTheme — the single source of truth for how a `DocumentTheme`
 * (themeKey + fontFamily + headingStyle + density) renders to concrete CSS
 * tokens (colours, font stack, heading decoration, section/entry spacing).
 *
 * Why concrete values, not Tailwind classes: the document renderer
 * (`DocumentView`) is serialized via `renderToStaticMarkup` into a standalone
 * print window with NO stylesheet, so it must use inline styles. The editor
 * stage (`DocumentStage`) renders in-app. Both consume THIS resolver so the
 * editor canvas, the in-app preview, and the printed PDF can never drift on
 * what a template looks like ("preview === render === print"). It is also why
 * applying a template now visibly changes the page design — previously only the
 * font family was honoured and the theme palette/heading style were ignored.
 *
 * The palette mirrors the Tailwind class bundles in
 * [resume-template-themes.ts](../../resume-template-themes.ts) as raw hex so the
 * marketing gallery (Tailwind) and the studio canvas (inline) stay in visual
 * lockstep without a build-time class extractor.
 */
import type { ThemeKey } from "@/lib/resume-template-themes";
import type { DocumentTheme } from "./document-state";

/** CSS font stacks keyed by the theme's `fontFamily`. Shared with the editor
 *  stage + the print view so authoring and PDF use identical metrics. */
export const DOCUMENT_FONT_STACK: Record<DocumentTheme["fontFamily"], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  sans: "Inter, system-ui, -apple-system, sans-serif",
};

interface ThemePalette {
  /** Section titles, role names, links — the theme's identity colour. */
  accent: string;
  /** Heading underline / dividers. */
  accentBorder: string;
  /** The candidate's name + strong headings. */
  heading: string;
  /** Body copy. */
  text: string;
  /** Secondary / meta lines (dates, locations). */
  muted: string;
}

/** Raw hex mirror of `THEMES[*]` (Tailwind classes → values). Paper stays white
 *  across all themes (the coloured `pageBg` is the OUTER surface, not the
 *  sheet), so it isn't modelled here. */
const THEME_PALETTE: Record<ThemeKey, ThemePalette> = {
  "hired-purple": { accent: "#7c3aed", accentBorder: "#7c3aed", heading: "#1e1b4b", text: "#0f172a", muted: "#64748b" },
  "iron-gray": { accent: "#334155", accentBorder: "#334155", heading: "#1e293b", text: "#0f172a", muted: "#64748b" },
  "balanced-blue": { accent: "#1d4ed8", accentBorder: "#1d4ed8", heading: "#1e3a8a", text: "#0f172a", muted: "#64748b" },
  "trusted-taupe": { accent: "#57534e", accentBorder: "#78716c", heading: "#292524", text: "#1c1917", muted: "#78716c" },
  "assertive-asphalt": { accent: "#27272a", accentBorder: "#18181b", heading: "#18181b", text: "#18181b", muted: "#71717a" },
  "warm-amber": { accent: "#b45309", accentBorder: "#d97706", heading: "#78350f", text: "#1c1917", muted: "#78716c" },
  "executive-navy": { accent: "#334155", accentBorder: "#0f172a", heading: "#0f172a", text: "#0f172a", muted: "#64748b" },
  "minimal-slate": { accent: "#525252", accentBorder: "#d4d4d4", heading: "#171717", text: "#171717", muted: "#737373" },
  "dev-graphite": { accent: "#047857", accentBorder: "#059669", heading: "#0f172a", text: "#0f172a", muted: "#64748b" },
  "growth-emerald": { accent: "#047857", accentBorder: "#059669", heading: "#064e3b", text: "#0f172a", muted: "#64748b" },
};

/** Section + entry vertical rhythm (px) per density — the inline equivalent of
 *  `DENSITY_CLASS`. */
const DENSITY_GAP: Record<DocumentTheme["density"], { section: number; entry: number }> = {
  compact: { section: 10, entry: 8 },
  comfortable: { section: 16, entry: 12 },
  spacious: { section: 24, entry: 16 },
};

/** Concrete CSS decoration for a section heading, derived from `headingStyle`. */
export interface HeadingDecoration {
  textTransform: "uppercase" | "none";
  letterSpacing: string;
  borderBottom: string;
  paddingBottom: number;
}

function headingDecoration(
  style: DocumentTheme["headingStyle"],
  accentBorder: string,
): HeadingDecoration {
  switch (style) {
    case "underlined":
      return { textTransform: "none", letterSpacing: "0.02em", borderBottom: `1px solid ${accentBorder}`, paddingBottom: 3 };
    case "divider":
      return { textTransform: "none", letterSpacing: "0.02em", borderBottom: `2px solid ${accentBorder}`, paddingBottom: 4 };
    case "caps":
      return { textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "none", paddingBottom: 0 };
    case "plain":
      return { textTransform: "none", letterSpacing: "0.01em", borderBottom: "none", paddingBottom: 0 };
  }
}

/** Fully-resolved render tokens for a document theme. */
export interface ResolvedDocumentTheme extends ThemePalette {
  fontFamily: string;
  heading: string;
  sectionGap: number;
  entryGap: number;
  headingDecoration: HeadingDecoration;
}

/** Resolve a `DocumentTheme` to the concrete tokens both renderers use. */
export function resolveDocumentTheme(theme: DocumentTheme): ResolvedDocumentTheme {
  const palette = THEME_PALETTE[theme.themeKey] ?? THEME_PALETTE["hired-purple"];
  const gap = DENSITY_GAP[theme.density] ?? DENSITY_GAP.comfortable;
  return {
    ...palette,
    fontFamily: DOCUMENT_FONT_STACK[theme.fontFamily] ?? DOCUMENT_FONT_STACK.sans,
    sectionGap: gap.section,
    entryGap: gap.entry,
    headingDecoration: headingDecoration(theme.headingStyle, palette.accentBorder),
  };
}
