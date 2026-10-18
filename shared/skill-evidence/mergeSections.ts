// Per-section merge functions (work, volunteer, projects, education, awards,
// publications, interests, languages, references).

import type {
  SkillEvidence,
  Work,
  Volunteer,
  Project,
  Education,
  Award,
  Publication,
  Interest,
  Language,
  Reference,
} from "../resume.js";
import { fillIfEmpty, mergeDateRange, mergeSectionItems, mergeStringArrays } from "./mergeHelpers.js";

// ─── Per-section merge functions ───────────────────────────────────────────

/** Merge two or more work entries. Same employer + same role split
 *  across two rows (the LLM does this when there's a date gap or two
 *  resume lines for the same job) collapses into one — earliest start,
 *  latest end, union of highlights, primary's identity wins, summary
 *  is concatenated when both have one. */
export function mergeWork(input: {
  work: Work[];
  evidence: SkillEvidence[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { work: Work[]; evidence: SkillEvidence[] } {
  const result = mergeSectionItems<Work>({
    items: input.work,
    evidence: input.evidence,
    evidenceItemType: "work",
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (w) => !!(w.name?.trim() || w.position?.trim()),
    mergeFields: (primary, absorbed) => {
      const range = mergeDateRange([primary, ...absorbed]);
      const summaries = [primary.summary, ...absorbed.map((a) => a.summary)]
        .map((s) => (s ?? "").trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i);
      return {
        ...primary,
        name: fillIfEmpty(primary.name, absorbed.map((a) => a.name)),
        position: fillIfEmpty(primary.position, absorbed.map((a) => a.position)),
        url: fillIfEmpty(primary.url, absorbed.map((a) => a.url)),
        summary: summaries.join("\n\n"),
        startDate: range.startDate,
        endDate: range.endDate,
        highlights: mergeStringArrays(primary.highlights, ...absorbed.map((a) => a.highlights)),
      };
    },
  });
  return { work: result.items, evidence: result.evidence };
}

/** Merge two or more volunteer entries. Same shape as work — primary's
 *  organization + position win, dates extend, highlights union. */
export function mergeVolunteer(input: {
  volunteer: Volunteer[];
  evidence: SkillEvidence[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { volunteer: Volunteer[]; evidence: SkillEvidence[] } {
  const result = mergeSectionItems<Volunteer>({
    items: input.volunteer,
    evidence: input.evidence,
    evidenceItemType: "volunteer",
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (v) => !!(v.organization?.trim() || v.position?.trim()),
    mergeFields: (primary, absorbed) => {
      const range = mergeDateRange([primary, ...absorbed]);
      const summaries = [primary.summary, ...absorbed.map((a) => a.summary)]
        .map((s) => (s ?? "").trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i);
      return {
        ...primary,
        organization: fillIfEmpty(primary.organization, absorbed.map((a) => a.organization)),
        position: fillIfEmpty(primary.position, absorbed.map((a) => a.position)),
        url: fillIfEmpty(primary.url, absorbed.map((a) => a.url)),
        summary: summaries.join("\n\n"),
        startDate: range.startDate,
        endDate: range.endDate,
        highlights: mergeStringArrays(primary.highlights, ...absorbed.map((a) => a.highlights)),
      };
    },
  });
  return { volunteer: result.items, evidence: result.evidence };
}

/** Merge two or more project entries. Combines highlights, keywords,
 *  roles. Date range extends; description concatenates. */
export function mergeProjects(input: {
  projects: Project[];
  evidence: SkillEvidence[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { projects: Project[]; evidence: SkillEvidence[] } {
  const result = mergeSectionItems<Project>({
    items: input.projects,
    evidence: input.evidence,
    evidenceItemType: "project",
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (p) => !!p.name?.trim(),
    mergeFields: (primary, absorbed) => {
      const range = mergeDateRange([primary, ...absorbed]);
      const descs = [primary.description, ...absorbed.map((a) => a.description)]
        .map((s) => (s ?? "").trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i);
      return {
        ...primary,
        name: fillIfEmpty(primary.name, absorbed.map((a) => a.name)),
        entity: fillIfEmpty(primary.entity, absorbed.map((a) => a.entity)),
        type: fillIfEmpty(primary.type, absorbed.map((a) => a.type)),
        url: fillIfEmpty(primary.url, absorbed.map((a) => a.url)),
        description: descs.join("\n\n"),
        startDate: range.startDate,
        endDate: range.endDate,
        highlights: mergeStringArrays(primary.highlights, ...absorbed.map((a) => a.highlights)),
        keywords: mergeStringArrays(primary.keywords, ...absorbed.map((a) => a.keywords)),
        roles: mergeStringArrays(primary.roles, ...absorbed.map((a) => a.roles)),
      };
    },
  });
  return { projects: result.items, evidence: result.evidence };
}

/** Merge two or more education entries. Same institution + degree
 *  duplicated by a re-import collapses to one; courses union. */
export function mergeEducation(input: {
  education: Education[];
  evidence: SkillEvidence[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { education: Education[]; evidence: SkillEvidence[] } {
  const result = mergeSectionItems<Education>({
    items: input.education,
    evidence: input.evidence,
    evidenceItemType: "education",
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (e) => !!(e.institution?.trim() || e.area?.trim()),
    mergeFields: (primary, absorbed) => {
      const range = mergeDateRange([primary, ...absorbed]);
      return {
        ...primary,
        institution: fillIfEmpty(primary.institution, absorbed.map((a) => a.institution)),
        area: fillIfEmpty(primary.area, absorbed.map((a) => a.area)),
        studyType: fillIfEmpty(primary.studyType, absorbed.map((a) => a.studyType)),
        score: fillIfEmpty(primary.score, absorbed.map((a) => a.score)),
        url: fillIfEmpty(primary.url, absorbed.map((a) => a.url)),
        startDate: range.startDate,
        endDate: range.endDate,
        courses: mergeStringArrays(primary.courses, ...absorbed.map((a) => a.courses)),
      };
    },
  });
  return { education: result.items, evidence: result.evidence };
}

/** Merge two or more award entries. Title + awarder of primary win;
 *  summary concatenates if both have one; date prefers primary then
 *  any absorbed value. */
export function mergeAwards(input: {
  awards: Award[];
  evidence: SkillEvidence[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { awards: Award[]; evidence: SkillEvidence[] } {
  const result = mergeSectionItems<Award>({
    items: input.awards,
    evidence: input.evidence,
    evidenceItemType: "award",
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (a) => !!a.title?.trim(),
    mergeFields: (primary, absorbed) => {
      const summaries = [primary.summary, ...absorbed.map((a) => a.summary)]
        .map((s) => (s ?? "").trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i);
      return {
        ...primary,
        title: fillIfEmpty(primary.title, absorbed.map((a) => a.title)),
        awarder: fillIfEmpty(primary.awarder, absorbed.map((a) => a.awarder)),
        date: fillIfEmpty(primary.date, absorbed.map((a) => a.date)),
        summary: summaries.join("\n\n"),
      };
    },
  });
  return { awards: result.items, evidence: result.evidence };
}

/** Merge two or more publication entries. Primary's name + publisher
 *  win; summary concatenates. */
export function mergePublications(input: {
  publications: Publication[];
  evidence: SkillEvidence[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { publications: Publication[]; evidence: SkillEvidence[] } {
  const result = mergeSectionItems<Publication>({
    items: input.publications,
    evidence: input.evidence,
    evidenceItemType: "publication",
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (p) => !!p.name?.trim(),
    mergeFields: (primary, absorbed) => {
      const summaries = [primary.summary, ...absorbed.map((a) => a.summary)]
        .map((s) => (s ?? "").trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i);
      return {
        ...primary,
        name: fillIfEmpty(primary.name, absorbed.map((a) => a.name)),
        publisher: fillIfEmpty(primary.publisher, absorbed.map((a) => a.publisher)),
        releaseDate: fillIfEmpty(primary.releaseDate, absorbed.map((a) => a.releaseDate)),
        url: fillIfEmpty(primary.url, absorbed.map((a) => a.url)),
        summary: summaries.join("\n\n"),
      };
    },
  });
  return { publications: result.items, evidence: result.evidence };
}

// Interests / Languages / References — no evidence binding to remap.
// These return just the merged item array, matching the simpler shape.

/** Merge two or more interest entries. Keywords union — that's the
 *  whole point of merging interests with the same name. */
export function mergeInterests(input: {
  interests: Interest[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { interests: Interest[] } {
  const result = mergeSectionItems<Interest>({
    items: input.interests,
    evidence: [],
    evidenceItemType: "publication", // unused, no rebinds happen
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (i) => !!i.name?.trim(),
    mergeFields: (primary, absorbed) => ({
      ...primary,
      name: fillIfEmpty(primary.name, absorbed.map((a) => a.name)),
      keywords: mergeStringArrays(primary.keywords, ...absorbed.map((a) => a.keywords)),
    }),
  });
  return { interests: result.items };
}

/** Merge two or more language entries. Primary's fluency wins (the
 *  user picks which version is canonical). The merge is rare — usually
 *  the same language is just one row — but it's here for completeness. */
export function mergeLanguages(input: {
  languages: Language[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { languages: Language[] } {
  const result = mergeSectionItems<Language>({
    items: input.languages,
    evidence: [],
    evidenceItemType: "publication",
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (l) => !!l.language?.trim(),
    mergeFields: (primary, absorbed) => ({
      ...primary,
      language: fillIfEmpty(primary.language, absorbed.map((a) => a.language)),
      fluency: fillIfEmpty(primary.fluency, absorbed.map((a) => a.fluency)),
    }),
  });
  return { languages: result.items };
}

/** Merge two or more reference entries. Primary's name wins;
 *  reference text concatenates. */
export function mergeReferences(input: {
  references: Reference[];
  selectedIndexes: number[];
  primaryIndex?: number;
}): { references: Reference[] } {
  const result = mergeSectionItems<Reference>({
    items: input.references,
    evidence: [],
    evidenceItemType: "publication",
    selectedIndexes: input.selectedIndexes,
    primaryIndex: input.primaryIndex,
    hasIdentity: (r) => !!r.name?.trim(),
    mergeFields: (primary, absorbed) => {
      const refs = [primary.reference, ...absorbed.map((a) => a.reference)]
        .map((s) => (s ?? "").trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i);
      return {
        ...primary,
        name: fillIfEmpty(primary.name, absorbed.map((a) => a.name)),
        reference: refs.join("\n\n"),
      };
    },
  });
  return { references: result.items };
}

