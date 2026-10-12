// Shared declarative content-template descriptor (#2154c).
//
// A résumé template and a job template are the same thing with different
// sections: listing facts (id / name / industry / price / description), a
// version, a document mode (hero page vs paper), a theme from the shared
// visual system (resume-template-themes), a 1- or 2-column layout with a
// sidebar, a hero, and an ordered section list. This is that shape once;
// `ResumeTemplateDescriptor` (resume-template.ts) and `JobTemplateDescriptor`
// (job-template.ts) are instantiations with their own section / hero types.
// One template concept (owner decision 2026-10-10: résumé — and job —
// templates are studio templates whose content kind is a column value).

import type { Density, FontFamilyKey, HeadingStyle, ThemeKey } from "@/lib/resume-template-themes";

export type TemplateCardStyle = "elevated" | "flat" | "bordered" | "ghost";

export type TemplateSectionTitleSize = "sm" | "md" | "lg" | "xl";

export type TemplateHeroLayout = "split" | "stacked" | "compact";

/** "hero" = a gradient hero page · "print" = a paper-style document. */
export type TemplateDocumentMode = "hero" | "print";

export interface ContentTemplateTheme {
  themeKey: ThemeKey;
  fontFamily: FontFamilyKey;
  headingStyle: HeadingStyle;
  density: Density;
  cardStyle?: TemplateCardStyle;
  sectionTitleSize?: TemplateSectionTitleSize;
  /** Scales the page's type; absent = 1. */
  fontScale?: number;
}

export interface ContentTemplateDescriptor<
  TSection,
  THero extends { enabled: boolean; layout: TemplateHeroLayout },
  TSidebarId extends string = string,
  TVersion extends string = string,
> {
  id: string;
  name: string;
  /** Display-only label, e.g. "Payroll / Finance". */
  industry?: string;
  /** 0 or undefined = free; >0 = a paid marketplace listing. */
  priceCents?: number;
  /** Short copy for gallery cards. */
  description?: string;
  version: TVersion;
  documentMode: TemplateDocumentMode;
  theme: ContentTemplateTheme;
  layout: {
    /** 2 → sidebar + main split. */
    columns: 1 | 2;
    sidebar?: TSidebarId[];
  };
  hero: THero;
  sections: TSection[];
}
