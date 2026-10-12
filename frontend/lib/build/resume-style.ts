/**
 * The résumé's look on paper, set by hand over its template — font, text
 * size, spacing, colour and the page (Letter / A4). Part of the résumé's
 * design (resume-design.ts stores it on `content.meta.style`), applied to
 * the template descriptor so every surface — the kit page, /resumes/:id
 * and its print / PDF route — renders it the same. Unset fields keep the
 * template's own. Pure.
 */
import type { Density, FontFamilyKey, ThemeKey } from "@/lib/resume-template-themes";
import { THEMES } from "@/lib/resume-template-themes";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

export const RESUME_FONTS: readonly FontFamilyKey[] = ["sans", "serif", "mono"];
export const RESUME_SIZES = ["small", "medium", "large"] as const;
export type ResumeSize = (typeof RESUME_SIZES)[number];
export const RESUME_SPACINGS: readonly Density[] = ["compact", "comfortable", "spacious"];
export const RESUME_COLOURS = Object.keys(THEMES) as ThemeKey[];
export const RESUME_PAPERS = ["letter", "a4"] as const;
export type ResumePaper = (typeof RESUME_PAPERS)[number];

/** How much each text size scales the page's type (medium = as designed). */
export const RESUME_SIZE_SCALE: Record<ResumeSize, number> = { small: 0.92, medium: 1, large: 1.08 };

export interface ResumeStyle {
  font?: FontFamilyKey;
  size?: ResumeSize;
  spacing?: Density;
  colour?: ThemeKey;
  paper?: ResumePaper;
}

const pick = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : undefined;

/** A stored style, keeping only what is valid (anything else → the template's). */
export function parseResumeStyle(raw: unknown): ResumeStyle {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const style: ResumeStyle = {
    font: pick(RESUME_FONTS, r.font),
    size: pick(RESUME_SIZES, r.size),
    spacing: pick(RESUME_SPACINGS, r.spacing),
    colour: pick(RESUME_COLOURS, r.colour),
    paper: pick(RESUME_PAPERS, r.paper),
  };
  return compactStyle(style);
}

/** The style without its unset fields (an empty object = the template's look). */
export function compactStyle(style: ResumeStyle): ResumeStyle {
  return Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined)) as ResumeStyle;
}

export function isEmptyStyle(style: ResumeStyle | undefined): boolean {
  return !style || Object.keys(compactStyle(style)).length === 0;
}

/** Stable identity of a style, for "did it change" checks. */
export function resumeStyleKey(style: ResumeStyle | undefined): string {
  const s = compactStyle(style ?? {});
  return [s.font, s.size, s.spacing, s.colour, s.paper].map((v) => v ?? "").join(",");
}

/** The template with the style laid over it. */
export function applyResumeStyle(descriptor: ResumeTemplateDescriptor, style: ResumeStyle | undefined): ResumeTemplateDescriptor {
  if (isEmptyStyle(style)) return descriptor;
  const s = style as ResumeStyle;
  const fontScale = s.size ? RESUME_SIZE_SCALE[s.size] : descriptor.theme.fontScale;
  return {
    ...descriptor,
    ...(s.paper ? { paper: s.paper } : {}),
    theme: {
      ...descriptor.theme,
      ...(s.font ? { fontFamily: s.font } : {}),
      ...(s.spacing ? { density: s.spacing } : {}),
      ...(s.colour ? { themeKey: s.colour } : {}),
      ...(fontScale !== undefined && fontScale !== 1 ? { fontScale } : {}),
    },
  };
}

/** The paper a descriptor prints on (Letter unless it says A4). */
export function resumePaper(descriptor: Pick<ResumeTemplateDescriptor, "paper">): ResumePaper {
  return descriptor.paper === "a4" ? "a4" : "letter";
}

/** The size a style shows as picked (the template's size is medium). */
export function resumeSizeOf(style: ResumeStyle): ResumeSize {
  return style.size ?? "medium";
}

/** CSS `@page { size }` for the résumé's print route — A4 is exactly 210×297mm. */
export function resumePrintPageSize(descriptor: Pick<ResumeTemplateDescriptor, "paper">): string {
  return resumePaper(descriptor) === "a4" ? "210mm 297mm" : "8.5in 11in";
}
