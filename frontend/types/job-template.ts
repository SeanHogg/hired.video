// Declarative job template descriptor (v1.0).
//
// Mirrors the ResumeTemplateDescriptor shape so job postings can be
// rendered, branded, and themed via the same declarative engine. Themes,
// font families, heading styles, and density tokens are imported from the
// shared resume-template-themes module — jobs and resumes share the full
// visual system.
//
// Section kinds are job-specific (description / responsibilities /
// requirements / qualifications / skills / benefits / company / apply).
// Layouts reuse the same "list" / "cards" / "grid" / "prose" primitives.

import type { Density, FontFamilyKey, HeadingStyle, ThemeKey } from "@/lib/resume-template-themes";

export type JobSectionKey =
  | "description"
  | "responsibilities"
  | "requirements"
  | "qualifications"
  | "skills"
  | "benefits"
  | "company"
  | "apply";

export type JobSectionLayout = "list" | "cards" | "grid" | "prose" | "compact";

export type JobCardStyle = "elevated" | "flat" | "bordered" | "ghost";

export type JobSectionTitleSize = "sm" | "md" | "lg" | "xl";

export type JobHeroLayout = "split" | "stacked" | "compact";

export type JobDocumentMode = "hero" | "print";

// Whitelisted lucide icon keys for job sections.
export type JobIconKey =
  | "briefcase"
  | "list-checks"
  | "target"
  | "graduation-cap"
  | "sparkles"
  | "gift"
  | "building"
  | "send";

export interface JobSectionBlock {
  key: JobSectionKey;
  enabled: boolean;
  title?: string;
  icon?: JobIconKey;
  layout: JobSectionLayout;
  columns?: 1 | 2 | 3 | 4;
  sortBy?: "manual" | "priority";
}

export interface JobTemplateDescriptor {
  id: string;
  name: string;
  industry?: string;
  priceCents?: number;                // 0 or undefined = free; >0 = paid marketplace listing (future).
  description?: string;
  version: "1.0";
  documentMode: JobDocumentMode;
  theme: {
    themeKey: ThemeKey;
    fontFamily: FontFamilyKey;
    headingStyle: HeadingStyle;
    density: Density;
    cardStyle?: JobCardStyle;
    sectionTitleSize?: JobSectionTitleSize;
  };
  layout: {
    columns: 1 | 2;                   // 2 → sidebar + main split (print mode).
    sidebar?: JobSectionKey[];
  };
  hero: {
    enabled: boolean;
    layout: JobHeroLayout;
    showCompanyLogo: boolean;
    showSalary: boolean;
    showLocation: boolean;
    showEmploymentType: boolean;
    showApplyButton: boolean;
    // Optional video job posting embed in the hero (gap #98 async interview
    // pattern, reused here for employer pitch video).
    showVideo: boolean;
  };
  sections: JobSectionBlock[];
}

// -----------------------------------------------------------------------------
// Default + industry presets
// -----------------------------------------------------------------------------

const baseJobSections: JobSectionBlock[] = [
  { key: "description", enabled: true, title: "About this role", icon: "briefcase", layout: "prose" },
  { key: "responsibilities", enabled: true, title: "What you'll do", icon: "list-checks", layout: "list" },
  { key: "requirements", enabled: true, title: "Requirements", icon: "target", layout: "list" },
  { key: "qualifications", enabled: true, title: "Qualifications", icon: "graduation-cap", layout: "list" },
  { key: "skills", enabled: true, title: "Skills", icon: "sparkles", layout: "grid", columns: 3 },
  { key: "benefits", enabled: true, title: "Benefits", icon: "gift", layout: "cards", columns: 2 },
  { key: "company", enabled: true, title: "About the company", icon: "building", layout: "prose" },
  { key: "apply", enabled: true, title: "Apply", icon: "send", layout: "compact" },
];

// 1. Default (hired.video) — gradient hero + prose-led sections.
export const DEFAULT_JOB_DESCRIPTOR: JobTemplateDescriptor = {
  id: "hired-job-default",
  name: "Hired Video — Job (Default)",
  industry: "All",
  priceCents: 0,
  description: "Signature hired.video job layout — gradient hero with embedded employer pitch, prose-led description, grid skills, and benefit cards.",
  version: "1.0",
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
    showCompanyLogo: true,
    showSalary: true,
    showLocation: true,
    showEmploymentType: true,
    showApplyButton: true,
    showVideo: true,
  },
  sections: baseJobSections,
};

// Helper for print-mode presets.
function printJobPreset(
  overrides: Partial<JobTemplateDescriptor> & Pick<JobTemplateDescriptor, "id" | "name">,
): JobTemplateDescriptor {
  return {
    industry: "All",
    version: "1.0",
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
      showCompanyLogo: true,
      showSalary: true,
      showLocation: true,
      showEmploymentType: true,
      showApplyButton: true,
      showVideo: false,
      ...overrides.hero,
    },
    sections: overrides.sections ?? baseJobSections.map((s) => ({
      ...s,
      layout: s.key === "skills" ? "grid" as JobSectionLayout : "list" as JobSectionLayout,
    })),
    ...overrides,
  } as JobTemplateDescriptor;
}

// 2. Corporate — Iron Gray, sans, 2-column, divider headings (ATS-friendly).
export const JOB_CORPORATE_IRON_GRAY: JobTemplateDescriptor = printJobPreset({
  id: "job-corporate-iron-gray",
  name: "Corporate — Iron Gray",
  industry: "Finance / Corporate",
  priceCents: 0,
  description: "Classic two-column print layout with divider headings — ATS-friendly for corporate, finance, and operations roles.",
  theme: {
    themeKey: "iron-gray",
    fontFamily: "sans",
    headingStyle: "divider",
    density: "compact",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 2, sidebar: ["skills", "requirements", "apply"] },
});

// 3. Executive — Trusted Taupe, serif, 1-column, spacious.
export const JOB_EXECUTIVE_TAUPE: JobTemplateDescriptor = printJobPreset({
  id: "job-executive-taupe",
  name: "Executive — Trusted Taupe",
  industry: "Executive / C-Suite",
  priceCents: 0,
  description: "Spacious single-column serif layout with elegant divider headings — built for VP, Director, and C-suite roles.",
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

// 4. Tech / Startup — Balanced Blue, sans, 1-column, underlined headings.
export const JOB_TECH_BLUE: JobTemplateDescriptor = printJobPreset({
  id: "job-tech-blue",
  name: "Tech / Startup — Balanced Blue",
  industry: "Tech / Startup",
  priceCents: 0,
  description: "Modern single-column blue palette — optimized for engineering, product, and design roles at tech companies.",
  theme: {
    themeKey: "balanced-blue",
    fontFamily: "sans",
    headingStyle: "underlined",
    density: "comfortable",
    cardStyle: "elevated",
    sectionTitleSize: "md",
  },
  layout: { columns: 1 },
});

// 5. Hospitality / Retail — Warm Amber, sans, caps headings.
export const JOB_HOSPITALITY_AMBER: JobTemplateDescriptor = printJobPreset({
  id: "job-hospitality-amber",
  name: "Hospitality — Warm Amber",
  industry: "Hospitality / Retail",
  priceCents: 0,
  description: "Warm, approachable amber palette with ALL-CAPS headings — for hospitality, retail, customer success, and service roles.",
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

// 6. Creative / Minimal — Minimal Slate, mono, plain headings.
export const JOB_CREATIVE_MINIMAL: JobTemplateDescriptor = printJobPreset({
  id: "job-creative-minimal",
  name: "Creative — Minimal Slate",
  industry: "Creative / Product",
  priceCents: 0,
  description: "Ultra-minimal monospace layout with generous whitespace — product, design, and creative roles.",
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

// 7. Risk / Consulting — Assertive Asphalt, caps headings.
export const JOB_RISK_ASPHALT: JobTemplateDescriptor = printJobPreset({
  id: "job-risk-asphalt",
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
  layout: { columns: 2, sidebar: ["skills", "requirements", "qualifications"] },
});

// 8. Casting Call — Film / Theatre. Renders a role posting in the
// industry-standard breakdown order: role description → requirements
// (age range, gender, look, union status) → qualifications (experience
// level) → submission instructions (skills slot repurposed as
// "special skills required", apply slot as "how to submit"). Hero is
// hidden so the role name + production read as the headline, not the
// production company logo. Pairs with the `casting_call` Studio video
// template — the video is the announcement, the job posting is the
// long-form breakdown.
export const JOB_CASTING_CALL: JobTemplateDescriptor = printJobPreset({
  id: "job-casting-call",
  name: "Casting Call — Film & Theatre",
  industry: "Film / Theatre / Television",
  priceCents: 0,
  description:
    "Industry-standard casting breakdown — role description, requirements (age / gender / look / union), submission window, and how-to-submit instructions.",
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
    showCompanyLogo: false,
    showSalary: true,
    showLocation: true,
    showEmploymentType: true,
    showApplyButton: true,
    showVideo: true,
  },
  sections: [
    { key: "description", enabled: true, title: "The role", icon: "briefcase", layout: "prose" },
    { key: "requirements", enabled: true, title: "Casting requirements", icon: "target", layout: "list" },
    { key: "qualifications", enabled: true, title: "Experience", icon: "graduation-cap", layout: "list" },
    { key: "skills", enabled: true, title: "Special skills required", icon: "sparkles", layout: "grid", columns: 3 },
    { key: "benefits", enabled: true, title: "Production details", icon: "gift", layout: "list" },
    { key: "company", enabled: true, title: "About the production", icon: "building", layout: "prose" },
    { key: "apply", enabled: true, title: "How to submit a self-tape", icon: "send", layout: "compact" },
  ],
});

export const JOB_TEMPLATE_PRESETS: JobTemplateDescriptor[] = [
  DEFAULT_JOB_DESCRIPTOR,
  JOB_CORPORATE_IRON_GRAY,
  JOB_EXECUTIVE_TAUPE,
  JOB_TECH_BLUE,
  JOB_HOSPITALITY_AMBER,
  JOB_CREATIVE_MINIMAL,
  JOB_RISK_ASPHALT,
  JOB_CASTING_CALL,
];

export function getJobTemplateById(id: string | null | undefined): JobTemplateDescriptor | null {
  if (!id) return null;
  return JOB_TEMPLATE_PRESETS.find((t) => t.id === id) ?? null;
}
