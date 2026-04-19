/**
 * resume-shape.ts — Safe defaults and pass-through for the canonical
 * camelCase JSON Resume shape used across the frontend (ResumeViewer,
 * ResumeBuilder, MergePreview, etc.).
 *
 * Historically this file mapped a lowercase envelope to a PascalCase one
 * — that distinction no longer exists; content is camelCase everywhere.
 * The remaining helpers just guarantee every section is an array so
 * consumers can iterate without undefined checks.
 */

import type { ResumeData } from "@/types/resume";

/** Empty ResumeData — safe default when no data is available. */
export function getEmptyResumeData(): ResumeData {
  return {
    basics: {
      name: "",
      label: "",
      image: "",
      email: "",
      phone: "",
      url: "",
      summary: "",
      location: null,
    },
    work: [],
    volunteer: [],
    education: [],
    awards: [],
    certificates: [],
    publications: [],
    skills: [],
    languages: [],
    interests: [],
    references: [],
    projects: [],
    metaData: [],
  };
}

/** Normalise an arbitrary content blob into a ResumeData with every
 *  section array present. Used by merge/upload paths where the incoming
 *  content may omit sections. */
export function mapContentToResumeData(content: unknown): ResumeData {
  if (!content || typeof content !== "object") return getEmptyResumeData();
  const c = content as Record<string, any>;
  const empty = getEmptyResumeData();
  return {
    basics: c.basics ?? empty.basics,
    work: Array.isArray(c.work) ? c.work : [],
    volunteer: Array.isArray(c.volunteer) ? c.volunteer : [],
    education: Array.isArray(c.education) ? c.education : [],
    awards: Array.isArray(c.awards) ? c.awards : [],
    certificates: Array.isArray(c.certificates) ? c.certificates : [],
    publications: Array.isArray(c.publications) ? c.publications : [],
    skills: Array.isArray(c.skills) ? c.skills : [],
    languages: Array.isArray(c.languages) ? c.languages : [],
    interests: Array.isArray(c.interests) ? c.interests : [],
    references: Array.isArray(c.references) ? c.references : [],
    projects: Array.isArray(c.projects) ? c.projects : [],
    meta: c.meta,
    metaData: Array.isArray(c.metaData) ? c.metaData : [],
  };
}
