// Declarative resume template descriptor (v1.2).
// v1.2 change: `sections` is now a discriminated union of SectionBlock (a slice
// of resume data) and ComponentBlock (a whitelisted platform widget like
// ResumeTimelines). Any block can appear at any position, including sidebar.
// See README § "Phase 1 first-pass: static vs declarative decomposition".

import type { Density, FontFamilyKey, HeadingStyle, ThemeKey } from "@/lib/resume-template-themes";

export type ResumeSectionKey =
  | "work"
  | "education"
  | "volunteer"
  | "skills"
  | "languages"
  | "projects"
  | "awards"
  | "certificates"
  | "publications"
  | "interests"
  | "references";

export type SectionLayout = "timeline" | "cards" | "grid" | "list" | "compact";

export type CardStyle = "elevated" | "flat" | "bordered" | "ghost";

export type SectionTitleSize = "sm" | "md" | "lg" | "xl";

export type SortOrder = "date_desc" | "date_asc" | "manual";

export type HeroLayout = "split" | "stacked" | "compact";

export type DocumentMode = "hero" | "print";

// Whitelisted lucide icon keys — keeps user-authored templates sandboxed.
export type TemplateIconKey =
  | "building"
  | "graduation-cap"
  | "heart"
  | "star"
  | "languages"
  | "folder-open"
  | "trophy"
  | "award"
  | "book-open"
  | "lightbulb"
  | "user-check"
  | "calendar"
  | "chart-bar";

// Whitelisted platform components that a template can drop into its section
// list. New components must be registered in DeclarativeResumeRenderer's
// COMPONENT_REGISTRY (see lib/resume-template-components.ts).
export type ComponentKey = "career-timeline";

export interface SectionBlock {
  kind?: "section";                  // default; omitted for back-compat with v1.1 presets
  key: ResumeSectionKey;
  enabled: boolean;
  title?: string;
  icon?: TemplateIconKey;
  layout: SectionLayout;
  columns?: 1 | 2 | 3 | 4;
  showHighlights?: boolean;
  sortBy?: SortOrder;
}

export interface ComponentBlock {
  kind: "component";
  id?: string;                       // stable id for sidebar referencing; defaults to component key
  component: ComponentKey;
  enabled: boolean;
  title?: string;                    // optional heading above the component; omit to render headless
  icon?: TemplateIconKey;
  props?: Record<string, unknown>;   // component-specific options (shape defined per component)
}

export type ResumeBlock = SectionBlock | ComponentBlock;

export function blockId(b: ResumeBlock): string {
  if (b.kind === "component") return b.id ?? b.component;
  return b.key;
}

export interface ResumeTemplateDescriptor {
  id: string;
  name: string;
  industry?: string;                  // display-only label, e.g. "Payroll / Finance"
  version: "1.0" | "1.1" | "1.2";
  documentMode: DocumentMode;         // "hero" = gradient + video resume · "print" = paper-style document
  theme: {
    themeKey: ThemeKey;
    fontFamily: FontFamilyKey;
    headingStyle: HeadingStyle;       // "underlined" | "divider" | "caps" | "plain"
    density: Density;
    cardStyle?: CardStyle;
    sectionTitleSize?: SectionTitleSize;
  };
  layout: {
    columns: 1 | 2;                   // 2 → sidebar + main split (print mode)
    sidebar?: string[];               // block ids (section key OR component id) to place in the sidebar
  };
  hero: {
    enabled: boolean;
    layout: HeroLayout;
    showAvatar: boolean;
    showContactButtons: boolean;
    showSummary: boolean;
    showVideo: boolean;
  };
  sections: ResumeBlock[];
}

// -----------------------------------------------------------------------------
// Default + industry presets
// -----------------------------------------------------------------------------

const baseSections: ResumeTemplateDescriptor["sections"] = [
  { key: "work", enabled: true, title: "Work Experience", icon: "building", layout: "timeline", showHighlights: true, sortBy: "date_desc" },
  { key: "education", enabled: true, title: "Education", icon: "graduation-cap", layout: "timeline", sortBy: "date_desc" },
  { key: "volunteer", enabled: true, title: "Volunteer Experience", icon: "heart", layout: "timeline", showHighlights: true, sortBy: "date_desc" },
  { key: "skills", enabled: true, title: "Skills", icon: "star", layout: "grid", columns: 3 },
  { key: "languages", enabled: true, title: "Languages", icon: "languages", layout: "grid", columns: 3 },
  { key: "projects", enabled: true, title: "Projects", icon: "folder-open", layout: "cards" },
  { key: "awards", enabled: true, title: "Awards", icon: "trophy", layout: "list" },
  { key: "certificates", enabled: true, title: "Certificates", icon: "award", layout: "list" },
  { key: "publications", enabled: true, title: "Publications", icon: "book-open", layout: "list" },
  { key: "interests", enabled: true, title: "Interests", icon: "lightbulb", layout: "grid", columns: 3 },
  { key: "references", enabled: true, title: "References", icon: "user-check", layout: "list" },
];

// 1. Default (hired.video) — matches current ResumeDetail pixel-close.
export const DEFAULT_DESCRIPTOR: ResumeTemplateDescriptor = {
  id: "hired-default",
  name: "Hired Video (Default)",
  industry: "All",
  version: "1.1",
  documentMode: "hero",
  theme: {
    themeKey: "hired-purple",
    fontFamily: "sans",
    headingStyle: "plain",
    density: "comfortable",
    cardStyle: "elevated",
    sectionTitleSize: "xl",
  },
  layout: { columns: 1 },
  hero: {
    enabled: true,
    layout: "split",
    showAvatar: true,
    showContactButtons: true,
    showSummary: true,
    showVideo: true,
  },
  sections: baseSections,
};

// Helper to create a print-mode preset with minimal boilerplate.
function printPreset(
  overrides: Partial<ResumeTemplateDescriptor> & Pick<ResumeTemplateDescriptor, "id" | "name">,
): ResumeTemplateDescriptor {
  return {
    industry: "All",
    version: "1.1",
    documentMode: "print",
    theme: {
      themeKey: "iron-gray",
      fontFamily: "sans",
      headingStyle: "underlined",
      density: "comfortable",
      cardStyle: "ghost",
      sectionTitleSize: "md",
      ...overrides.theme,
    },
    layout: { columns: 1, ...overrides.layout },
    hero: {
      enabled: true,
      layout: "compact",
      showAvatar: false,
      showContactButtons: true,
      showSummary: true,
      showVideo: false,
      ...overrides.hero,
    },
    sections: overrides.sections ?? baseSections.map((s) => ({ ...s, layout: "list" as SectionLayout })),
    ...overrides,
  } as ResumeTemplateDescriptor;
}

// 2. Payroll / Finance — Iron Gray, serif, 2-column, divider headings.
export const PAYROLL_IRON_GRAY: ResumeTemplateDescriptor = printPreset({
  id: "payroll-iron-gray",
  name: "Payroll & Finance — Iron Gray",
  industry: "Finance / Payroll",
  theme: {
    themeKey: "iron-gray",
    fontFamily: "serif",
    headingStyle: "divider",
    density: "compact",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 2, sidebar: ["skills", "education", "certificates", "languages"] },
});

// 3. Risk / Consulting — Assertive Asphalt, sans, 2-column, caps headings.
export const RISK_ASPHALT: ResumeTemplateDescriptor = printPreset({
  id: "risk-asphalt",
  name: "Risk & Consulting — Asphalt",
  industry: "Risk / Consulting",
  theme: {
    themeKey: "assertive-asphalt",
    fontFamily: "sans",
    headingStyle: "caps",
    density: "comfortable",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 2, sidebar: ["skills", "languages", "certificates"] },
});

// 4. Executive — Trusted Taupe, serif, 1-column, divider headings, spacious.
export const EXECUTIVE_TAUPE: ResumeTemplateDescriptor = printPreset({
  id: "executive-taupe",
  name: "Executive — Trusted Taupe",
  industry: "Executive / C-Suite",
  theme: {
    themeKey: "trusted-taupe",
    fontFamily: "serif",
    headingStyle: "divider",
    density: "spacious",
    cardStyle: "ghost",
    sectionTitleSize: "lg",
  },
  layout: { columns: 1 },
});

// 5. New Grad / Intern — Balanced Blue, Education first, 1-column, underlined headings.
export const INTERN_EDUCATION_FIRST: ResumeTemplateDescriptor = printPreset({
  id: "intern-education-first",
  name: "New Grad — Education First",
  industry: "Intern / New Grad",
  theme: {
    themeKey: "balanced-blue",
    fontFamily: "sans",
    headingStyle: "underlined",
    density: "comfortable",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 1 },
  sections: [
    baseSections.find((s) => s.key === "education")!,
    baseSections.find((s) => s.key === "work")!,
    baseSections.find((s) => s.key === "projects")!,
    baseSections.find((s) => s.key === "skills")!,
    baseSections.find((s) => s.key === "volunteer")!,
    baseSections.find((s) => s.key === "awards")!,
    baseSections.find((s) => s.key === "languages")!,
    baseSections.find((s) => s.key === "interests")!,
  ].map((s) => ({ ...s, layout: s.key === "skills" || s.key === "languages" || s.key === "interests" ? "grid" as SectionLayout : "list" as SectionLayout, columns: 2 })),
});

// 6. Hospitality — Warm Amber, sans, caps headings, 1-column.
export const HOSPITALITY_AMBER: ResumeTemplateDescriptor = printPreset({
  id: "hospitality-amber",
  name: "Hospitality — Warm Amber",
  industry: "Hospitality / Retail",
  theme: {
    themeKey: "warm-amber",
    fontFamily: "sans",
    headingStyle: "caps",
    density: "comfortable",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 1 },
});

// 7. Creative / Minimal — minimal slate, mono font, plain headings.
export const CREATIVE_MINIMAL: ResumeTemplateDescriptor = printPreset({
  id: "creative-minimal",
  name: "Creative — Minimal Slate",
  industry: "Creative / Product",
  theme: {
    themeKey: "minimal-slate",
    fontFamily: "mono",
    headingStyle: "plain",
    density: "spacious",
    cardStyle: "ghost",
    sectionTitleSize: "sm",
  },
  layout: { columns: 1 },
});

export const TEMPLATE_PRESETS: ResumeTemplateDescriptor[] = [
  DEFAULT_DESCRIPTOR,
  PAYROLL_IRON_GRAY,
  RISK_ASPHALT,
  EXECUTIVE_TAUPE,
  INTERN_EDUCATION_FIRST,
  HOSPITALITY_AMBER,
  CREATIVE_MINIMAL,
];
