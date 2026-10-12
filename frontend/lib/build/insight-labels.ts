/**
 * i18n key maps for the shared insight vocabulary. The pure analyzer
 * (shared/resume-insights.ts) returns canonical values; every kit surface
 * renders them through these maps so labels are defined once.
 */
import type {
  CareerPattern,
  ResumeIndustry,
  ResumeStructure,
  Seniority,
} from "@shared/resume-insights";

export const INDUSTRY_LABEL_KEYS: Record<ResumeIndustry, string> = {
  "Software / Engineering": "build.industry.software",
  "Healthcare / Clinical": "build.industry.healthcare",
  "Finance / Payroll": "build.industry.finance",
  "Sales / Business Development": "build.industry.sales",
  "Creative / Product": "build.industry.creative",
  "Executive / C-Suite": "build.industry.executive",
  "Intern / New Grad": "build.industry.newGrad",
  "Hospitality / Retail": "build.industry.hospitality",
  "Risk / Consulting": "build.industry.consulting",
  "Film / Theatre / Television": "build.industry.acting",
  "Film / Television": "build.industry.film",
};

export const SENIORITY_LABEL_KEYS: Record<Seniority, string> = {
  entry: "build.seniority.entry",
  mid: "build.seniority.mid",
  senior: "build.seniority.senior",
  executive: "build.seniority.executive",
};

export const PATTERN_LABEL_KEYS: Record<CareerPattern, string> = {
  steady: "build.pattern.steady",
  pivot: "build.pattern.pivot",
  gaps: "build.pattern.gaps",
  "early-career": "build.pattern.earlyCareer",
};

export const STRUCTURE_LABEL_KEYS: Record<ResumeStructure, string> = {
  chronological: "build.structure.chronological",
  hybrid: "build.structure.hybrid",
  functional: "build.structure.functional",
};

export const STRUCTURE_WHY_KEYS: Record<ResumeStructure, string> = {
  chronological: "build.structure.chronologicalWhy",
  hybrid: "build.structure.hybridWhy",
  functional: "build.structure.functionalWhy",
};
