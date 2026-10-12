// Declarative resume template descriptor (v1.2).
// v1.2 change: `sections` is now a discriminated union of SectionBlock (a slice
// of resume data) and ComponentBlock (a whitelisted platform widget like
// ResumeTimelines). Any block can appear at any position, including sidebar.
// See README § "Phase 1 first-pass: static vs declarative decomposition".

import type { Density, FontFamilyKey, HeadingStyle, ThemeKey } from "@/lib/resume-template-themes";
import { resumeListing } from "@shared/marketplace-template-listings";
import type {
  ContentTemplateDescriptor,
  TemplateCardStyle,
  TemplateDocumentMode,
  TemplateHeroLayout,
  TemplateSectionTitleSize,
} from "@/types/content-template";

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

export type CardStyle = TemplateCardStyle;

export type SectionTitleSize = TemplateSectionTitleSize;

export type SortOrder = "date_desc" | "date_asc" | "manual";

export type HeroLayout = TemplateHeroLayout;

export type DocumentMode = TemplateDocumentMode;

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
// COMPONENT_REGISTRY (see components/resume-renderer/resume-template-components.ts).
// "document-block" is a free text / image / divider / spacer block a résumé
// authored on the document canvas carries (resume-document-descriptor.ts,
// #2101) — props { kind, text?, imageUrl? }; not offered in template authoring.
export type ComponentKey = "career-timeline" | "document-block";

export interface SectionBlock {
  kind?: "section";                  // default; omitted for back-compat with v1.1 presets
  key: ResumeSectionKey;
  enabled: boolean;
  title?: string;
  icon?: TemplateIconKey;
  layout: SectionLayout;
  columns?: 1 | 2 | 3 | 4;
  showHighlights?: boolean;
  // Opt-in for surfacing per-item media attachments (production stills,
  // demo reels, YouTube clips, hyperlinks) on the rendered resume. Reads
  // from `content.metaData` filtered by item id. Default off — only the
  // media-led templates (Actor — Headshot Hero, Director — Filmography
  // Serif, etc.) flip it on so credit / filmography cards show stills
  // alongside the text. The data path already exists for every item kind;
  // this flag controls visibility.
  showMedia?: boolean;
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

/** The résumé instantiation of the shared content-template shape
 *  (types/content-template.ts). */
export interface ResumeHeroConfig {
  enabled: boolean;
  layout: HeroLayout;
  showAvatar: boolean;
  showContactButtons: boolean;
  showSummary: boolean;
  showVideo: boolean;
}

export interface ResumeTemplateDescriptor
  extends ContentTemplateDescriptor<ResumeBlock, ResumeHeroConfig, string, "1.0" | "1.1" | "1.2"> {
  /** The paper it prints on (the résumé style's page); absent = US Letter. */
  paper?: "letter" | "a4";
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
  ...resumeListing("hired-default"),
  priceCents: 0,
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
  ...resumeListing("payroll-iron-gray"),
  priceCents: 0,
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
  ...resumeListing("risk-asphalt"),
  priceCents: 0,
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
  ...resumeListing("executive-taupe"),
  priceCents: 0,
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
  ...resumeListing("intern-education-first"),
  priceCents: 0,
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
  ...resumeListing("hospitality-amber"),
  priceCents: 0,
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
  ...resumeListing("creative-minimal"),
  priceCents: 0,
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
  ...resumeListing("software-engineer-graphite"),
  priceCents: 0,
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
  ...resumeListing("healthcare-clinical-blue"),
  priceCents: 0,
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
  ...resumeListing("sales-growth-emerald"),
  priceCents: 0,
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

// 11. Actor — Headshot Hero, hero mode for the 8x10 portrait, projects-first.
// Industry-standard one-pager: the avatar IS the headshot, credits read as
// "Project · Role · Director/Network" — modelled as the projects section
// with `showHighlights: true` so the renderer surfaces those three columns
// per row.
export const ACTOR_HEADSHOT_HERO: ResumeTemplateDescriptor = {
  id: "actor-headshot-hero",
  ...resumeListing("actor-headshot-hero"),
  priceCents: 0,
  version: "1.2",
  documentMode: "hero",
  theme: {
    themeKey: "minimal-slate",
    fontFamily: "serif",
    headingStyle: "caps",
    density: "compact",
    cardStyle: "ghost",
    sectionTitleSize: "md",
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
  sections: [
    { key: "projects", enabled: true, title: "Credits", icon: "folder-open", layout: "list", showHighlights: true, showMedia: true, sortBy: "date_desc" },
    { key: "skills", enabled: true, title: "Special Skills", icon: "star", layout: "grid", columns: 3 },
    { key: "languages", enabled: true, title: "Languages & Dialects", icon: "languages", layout: "grid", columns: 3 },
    { key: "education", enabled: true, title: "Training", icon: "graduation-cap", layout: "list", sortBy: "date_desc" },
    { key: "awards", enabled: true, title: "Awards & Festivals", icon: "trophy", layout: "list" },
    { key: "references", enabled: true, title: "Representation", icon: "user-check", layout: "list" },
  ],
};

// 12. Director — Filmography Serif, print mode, projects/awards-led.
// Mirrors the working filmmaker resume convention: filmography first,
// festival selections + awards above work history, training last.
export const DIRECTOR_FILMOGRAPHY_SERIF: ResumeTemplateDescriptor = printPreset({
  id: "director-filmography-serif",
  ...resumeListing("director-filmography-serif"),
  priceCents: 0,
  theme: {
    themeKey: "trusted-taupe",
    fontFamily: "serif",
    headingStyle: "divider",
    density: "spacious",
    cardStyle: "ghost",
    sectionTitleSize: "lg",
  },
  layout: { columns: 1 },
  hero: {
    enabled: true,
    layout: "compact",
    showAvatar: false,
    showContactButtons: true,
    showSummary: true,
    showVideo: false,
  },
  sections: [
    { key: "projects", enabled: true, title: "Filmography", icon: "folder-open", layout: "list", showHighlights: true, showMedia: true, sortBy: "date_desc" },
    { key: "awards", enabled: true, title: "Festivals & Awards", icon: "trophy", layout: "list" },
    { key: "publications", enabled: true, title: "Press & Coverage", icon: "book-open", layout: "list" },
    { key: "work", enabled: true, title: "Work History", icon: "building", layout: "list", showHighlights: true, sortBy: "date_desc" },
    { key: "education", enabled: true, title: "Training", icon: "graduation-cap", layout: "list", sortBy: "date_desc" },
    { key: "skills", enabled: true, title: "Crafts", icon: "star", layout: "grid", columns: 3 },
    { key: "references", enabled: true, title: "Representation", icon: "user-check", layout: "list" },
  ],
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
  ACTOR_HEADSHOT_HERO,
  DIRECTOR_FILMOGRAPHY_SERIF,
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
    const fontScale = theme!.fontScale;
    if (fontScale !== undefined) {
      need("theme.fontScale", typeof fontScale === "number" && fontScale >= 0.75 && fontScale <= 1.25, "expected 0.75–1.25");
    }
    if (d.paper !== undefined) oneOf("paper", d.paper, ["letter", "a4"] as const);

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
