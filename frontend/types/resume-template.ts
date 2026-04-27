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
  | "user-check";

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
  priceCents?: number;                // 0 or undefined = free; >0 = paid (future marketplace)
  description?: string;               // short copy for template gallery cards
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

// Career timeline component block — shown on the default hired.video viewer
// above the Work Experience section (matches current ResumeDetail).
const CAREER_TIMELINE_BLOCK: ComponentBlock = {
  kind: "component",
  component: "career-timeline",
  enabled: true,
};

const baseSections: SectionBlock[] = [
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
  priceCents: 0,
  description: "Signature hired.video layout — gradient hero with embedded video resume, timeline work history, and cross-section career overview.",
  version: "1.2",
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
  sections: [CAREER_TIMELINE_BLOCK, ...baseSections],
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
  priceCents: 0,
  description: "Classic two-column print layout with sober serif headings — ATS-friendly for payroll, accounting, and financial analyst roles.",
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
  priceCents: 0,
  description: "Dark, assertive two-column layout with ALL-CAPS headings — signals gravitas for risk, audit, compliance, and consulting.",
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
  priceCents: 0,
  description: "Spacious single-column serif layout with elegant divider headings — built for CXO, VP, and Director-level narratives.",
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
  priceCents: 0,
  description: "Education leads, projects and coursework shine — optimized for interns, recent grads, and anyone with limited work history.",
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
  priceCents: 0,
  description: "Warm, approachable amber palette with ALL-CAPS headings — suited to hospitality, retail, customer success, and service roles.",
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
  priceCents: 0,
  description: "Ultra-minimal monospace layout with generous whitespace — product designers, creative directors, and indie makers.",
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

// 8. Software Engineer — Dev Graphite, mono, 2-column with skills/projects sidebar.
export const SOFTWARE_ENGINEER_GRAPHITE: ResumeTemplateDescriptor = printPreset({
  id: "software-engineer-graphite",
  name: "Software Engineer — Dev Graphite",
  industry: "Software / Engineering",
  priceCents: 0,
  description: "Two-column developer-focused layout with monospace accents — tech stack and projects sidebar, achievement-led work history.",
  theme: {
    themeKey: "dev-graphite",
    fontFamily: "mono",
    headingStyle: "plain",
    density: "comfortable",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 2, sidebar: ["skills", "projects", "certificates", "languages"] },
});

// 9. Healthcare / Clinical — Balanced Blue, sans, 2-column with credentials sidebar.
export const HEALTHCARE_CLINICAL_BLUE: ResumeTemplateDescriptor = printPreset({
  id: "healthcare-clinical-blue",
  name: "Healthcare — Clinical Blue",
  industry: "Healthcare / Clinical",
  priceCents: 0,
  description: "Credentials-forward two-column layout for nurses, physicians, and allied health — licenses and certifications above the fold.",
  theme: {
    themeKey: "balanced-blue",
    fontFamily: "sans",
    headingStyle: "underlined",
    density: "compact",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 2, sidebar: ["certificates", "skills", "education", "languages"] },
});

// 10. Sales / BD — Growth Emerald, sans, 1-column, achievement-driven caps headings.
export const SALES_GROWTH_EMERALD: ResumeTemplateDescriptor = printPreset({
  id: "sales-growth-emerald",
  name: "Sales — Growth Emerald",
  industry: "Sales / Business Development",
  priceCents: 0,
  description: "Achievement-driven single-column layout with confident green accents — built for AEs, SDRs, sales leaders, and BD professionals.",
  theme: {
    themeKey: "growth-emerald",
    fontFamily: "sans",
    headingStyle: "caps",
    density: "comfortable",
    cardStyle: "ghost",
    sectionTitleSize: "md",
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
  SOFTWARE_ENGINEER_GRAPHITE,
  HEALTHCARE_CLINICAL_BLUE,
  SALES_GROWTH_EMERALD,
];

export function getTemplateById(id: string | null | undefined): ResumeTemplateDescriptor | null {
  if (!id) return null;
  return TEMPLATE_PRESETS.find((t) => t.id === id) ?? null;
}

// -----------------------------------------------------------------------------
// Validation — used by the in-viewer "Edit the Template Design" editor so
// hand-written JSON can't put the renderer into an invalid state.
// -----------------------------------------------------------------------------

const VALID_VERSIONS = ["1.0", "1.1", "1.2"] as const;
const VALID_DOCUMENT_MODES: DocumentMode[] = ["hero", "print"];
const VALID_THEME_KEYS: ThemeKey[] = [
  "hired-purple", "iron-gray", "balanced-blue", "trusted-taupe",
  "assertive-asphalt", "warm-amber", "executive-navy", "minimal-slate",
  "dev-graphite", "growth-emerald",
];
const VALID_FONTS: FontFamilyKey[] = ["sans", "serif", "mono"];
const VALID_HEADINGS: HeadingStyle[] = ["underlined", "divider", "caps", "plain"];
const VALID_DENSITIES: Density[] = ["compact", "comfortable", "spacious"];
const VALID_CARD_STYLES: CardStyle[] = ["elevated", "flat", "bordered", "ghost"];
const VALID_TITLE_SIZES: SectionTitleSize[] = ["sm", "md", "lg", "xl"];
const VALID_HERO_LAYOUTS: HeroLayout[] = ["split", "stacked", "compact"];
const VALID_SECTION_LAYOUTS: SectionLayout[] = ["timeline", "cards", "grid", "list", "compact"];
const VALID_SORT: SortOrder[] = ["date_desc", "date_asc", "manual"];
const VALID_SECTION_KEYS: ResumeSectionKey[] = [
  "work", "education", "volunteer", "skills", "languages", "projects",
  "awards", "certificates", "publications", "interests", "references",
];
const VALID_ICONS: TemplateIconKey[] = [
  "building", "graduation-cap", "heart", "star", "languages", "folder-open",
  "trophy", "award", "book-open", "lightbulb", "user-check",
];
const VALID_COMPONENT_KEYS: ComponentKey[] = ["career-timeline"];

export type DescriptorValidation =
  | { ok: true; value: ResumeTemplateDescriptor }
  | { ok: false; error: string };

export function validateDescriptor(value: unknown): DescriptorValidation {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Template must be a JSON object.");
    }
    const d = value as Record<string, unknown>;
    const need = (path: string, cond: boolean, hint?: string) => {
      if (!cond) throw new Error(`${path} — invalid or missing${hint ? ` (${hint})` : ""}.`);
    };
    const oneOf = <T extends string>(path: string, v: unknown, list: readonly T[]) =>
      need(path, typeof v === "string" && (list as readonly string[]).includes(v), `expected one of: ${list.join(", ")}`);

    need("id", typeof d.id === "string" && (d.id as string).length > 0);
    need("name", typeof d.name === "string" && (d.name as string).length > 0);
    oneOf("version", d.version, VALID_VERSIONS);
    oneOf("documentMode", d.documentMode, VALID_DOCUMENT_MODES);

    const theme = d.theme as Record<string, unknown> | undefined;
    need("theme", !!theme && typeof theme === "object");
    oneOf("theme.themeKey", theme!.themeKey, VALID_THEME_KEYS);
    oneOf("theme.fontFamily", theme!.fontFamily, VALID_FONTS);
    oneOf("theme.headingStyle", theme!.headingStyle, VALID_HEADINGS);
    oneOf("theme.density", theme!.density, VALID_DENSITIES);
    if (theme!.cardStyle !== undefined) oneOf("theme.cardStyle", theme!.cardStyle, VALID_CARD_STYLES);
    if (theme!.sectionTitleSize !== undefined) oneOf("theme.sectionTitleSize", theme!.sectionTitleSize, VALID_TITLE_SIZES);

    const layout = d.layout as Record<string, unknown> | undefined;
    need("layout", !!layout && typeof layout === "object");
    need("layout.columns", layout!.columns === 1 || layout!.columns === 2, "expected 1 or 2");
    if (layout!.sidebar !== undefined) {
      need(
        "layout.sidebar",
        Array.isArray(layout!.sidebar) && (layout!.sidebar as unknown[]).every((s) => typeof s === "string"),
        "expected array of strings",
      );
    }

    const hero = d.hero as Record<string, unknown> | undefined;
    need("hero", !!hero && typeof hero === "object");
    need("hero.enabled", typeof hero!.enabled === "boolean");
    oneOf("hero.layout", hero!.layout, VALID_HERO_LAYOUTS);
    need("hero.showAvatar", typeof hero!.showAvatar === "boolean");
    need("hero.showContactButtons", typeof hero!.showContactButtons === "boolean");
    need("hero.showSummary", typeof hero!.showSummary === "boolean");
    need("hero.showVideo", typeof hero!.showVideo === "boolean");

    need("sections", Array.isArray(d.sections), "expected array");
    (d.sections as unknown[]).forEach((raw, i) => {
      const s = raw as Record<string, unknown>;
      need(`sections[${i}]`, !!s && typeof s === "object");
      if (s.kind === "component") {
        oneOf(`sections[${i}].component`, s.component, VALID_COMPONENT_KEYS);
        need(`sections[${i}].enabled`, typeof s.enabled === "boolean");
      } else {
        oneOf(`sections[${i}].key`, s.key, VALID_SECTION_KEYS);
        need(`sections[${i}].enabled`, typeof s.enabled === "boolean");
        oneOf(`sections[${i}].layout`, s.layout, VALID_SECTION_LAYOUTS);
        if (s.columns !== undefined) need(`sections[${i}].columns`, [1, 2, 3, 4].includes(s.columns as number), "expected 1–4");
        if (s.sortBy !== undefined) oneOf(`sections[${i}].sortBy`, s.sortBy, VALID_SORT);
        if (s.icon !== undefined) oneOf(`sections[${i}].icon`, s.icon, VALID_ICONS);
      }
    });

    return { ok: true, value: d as unknown as ResumeTemplateDescriptor };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// True when `d` is byte-identical to one of the stock presets — used to decide
// whether to badge the current descriptor as "Custom" in the viewer.
export function matchesAnyPreset(d: ResumeTemplateDescriptor): boolean {
  const serialised = JSON.stringify(d);
  return TEMPLATE_PRESETS.some((p) => JSON.stringify(p) === serialised);
}
