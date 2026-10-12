/**
 * The words for the résumé's look (resume-style.ts) — one label key per
 * font, text size, spacing, colour and page. A new option is a new entry
 * here. Shared by the "This line" style drills and their row hints.
 */
import type { Density, FontFamilyKey, ThemeKey } from "@/lib/resume-template-themes";
import type { ResumeSize } from "@/lib/build/resume-style";
import { PAPER_LABEL_KEYS } from "@/components/workspace/inspector/InspectorChoice";

export const RESUME_FONT_LABEL_KEYS: Record<FontFamilyKey, string> = {
  sans: "workspace.letter.style.sans",
  serif: "workspace.letter.style.serif",
  mono: "workspace.letter.style.mono",
};

export const RESUME_SIZE_LABEL_KEYS: Record<ResumeSize, string> = {
  small: "build.resumeStyle.size.small",
  medium: "build.resumeStyle.size.medium",
  large: "build.resumeStyle.size.large",
};

export const RESUME_SPACING_LABEL_KEYS: Record<Density, string> = {
  compact: "build.resumeStyle.spacing.compact",
  comfortable: "build.resumeStyle.spacing.comfortable",
  spacious: "build.resumeStyle.spacing.spacious",
};

export const RESUME_COLOUR_LABEL_KEYS: Record<ThemeKey, string> = {
  "hired-purple": "build.resumeStyle.colour.hiredPurple",
  "iron-gray": "build.resumeStyle.colour.ironGray",
  "balanced-blue": "build.resumeStyle.colour.balancedBlue",
  "trusted-taupe": "build.resumeStyle.colour.trustedTaupe",
  "assertive-asphalt": "build.resumeStyle.colour.assertiveAsphalt",
  "warm-amber": "build.resumeStyle.colour.warmAmber",
  "executive-navy": "build.resumeStyle.colour.executiveNavy",
  "minimal-slate": "build.resumeStyle.colour.minimalSlate",
  "dev-graphite": "build.resumeStyle.colour.devGraphite",
  "growth-emerald": "build.resumeStyle.colour.growthEmerald",
};

export const RESUME_PAPER_LABEL_KEYS = PAPER_LABEL_KEYS;
