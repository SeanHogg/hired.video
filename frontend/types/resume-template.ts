// Declarative resume template descriptor (v1).
// See README § "Phase 1 first-pass: static vs declarative decomposition".

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

export interface ResumeTemplateDescriptor {
  id: string;
  name: string;
  version: "1.0";
  theme: {
    accentClass?: string;
    heroGradient?: [string, string];
    cardStyle?: CardStyle;
    sectionTitleSize?: SectionTitleSize;
  };
  hero: {
    enabled: boolean;
    layout: HeroLayout;
    showAvatar: boolean;
    showContactButtons: boolean;
    showSummary: boolean;
    showVideo: boolean;
  };
  sections: Array<{
    key: ResumeSectionKey;
    enabled: boolean;
    title?: string;
    icon?: TemplateIconKey;
    layout: SectionLayout;
    columns?: 1 | 2 | 3 | 4;
    showHighlights?: boolean;
    sortBy?: SortOrder;
  }>;
}

// Default descriptor — reproduces current ResumeDetail output pixel-close.
export const DEFAULT_DESCRIPTOR: ResumeTemplateDescriptor = {
  id: "default",
  name: "Default (Timeline)",
  version: "1.0",
  theme: {
    accentClass: "primary",
    heroGradient: ["primary", "primary/80"],
    cardStyle: "elevated",
    sectionTitleSize: "xl",
  },
  hero: {
    enabled: true,
    layout: "split",
    showAvatar: true,
    showContactButtons: true,
    showSummary: true,
    showVideo: true,
  },
  sections: [
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
  ],
};

// Preset: Compact — stacked hero, no video, condensed section layouts.
export const COMPACT_DESCRIPTOR: ResumeTemplateDescriptor = {
  ...DEFAULT_DESCRIPTOR,
  id: "compact",
  name: "Compact",
  hero: { enabled: true, layout: "compact", showAvatar: true, showContactButtons: true, showSummary: true, showVideo: false },
  theme: { ...DEFAULT_DESCRIPTOR.theme, cardStyle: "flat", sectionTitleSize: "md" },
  sections: DEFAULT_DESCRIPTOR.sections.map((s) =>
    s.key === "work" || s.key === "education" || s.key === "volunteer"
      ? { ...s, layout: "compact" as SectionLayout }
      : s,
  ),
};

// Preset: Two-column grids for everything list-y.
export const TWO_COLUMN_DESCRIPTOR: ResumeTemplateDescriptor = {
  ...DEFAULT_DESCRIPTOR,
  id: "two-column",
  name: "Two-Column",
  sections: DEFAULT_DESCRIPTOR.sections.map((s) =>
    s.layout === "grid" ? { ...s, columns: 2 as 2 } : s,
  ),
};

// Preset: Monochrome — no accent colour, flat cards, sober titles.
export const MONOCHROME_DESCRIPTOR: ResumeTemplateDescriptor = {
  ...DEFAULT_DESCRIPTOR,
  id: "monochrome",
  name: "Monochrome",
  theme: {
    accentClass: "foreground",
    heroGradient: ["muted-foreground", "foreground"],
    cardStyle: "bordered",
    sectionTitleSize: "lg",
  },
};

export const TEMPLATE_PRESETS: ResumeTemplateDescriptor[] = [
  DEFAULT_DESCRIPTOR,
  COMPACT_DESCRIPTOR,
  TWO_COLUMN_DESCRIPTOR,
  MONOCHROME_DESCRIPTOR,
];
