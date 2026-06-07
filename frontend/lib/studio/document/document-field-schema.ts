/**
 * Declarative field schema for document sections — the single source the
 * document canvas drives inline editing from (#1916, "the canvas is the
 * form"), now entity-aware (#1914). One record per editable section per
 * entity: which fields an item has, their input type, and (for repeating
 * sections) how to mint a blank item. The `<SectionEditor>` renders inputs
 * from this; render + edit + new-item all share this schema (DRY) so a field
 * added here lights up everywhere.
 *
 * Two section shapes:
 *   • "array"  — the content key is a list of items, each with the schema's
 *     fields (resume work / education / skills …). The editor shows an
 *     add/remove item list.
 *   • "object" — the fields live on ONE object: either a nested key
 *     (`objectPath`, e.g. the resume `basics` header) or — when `objectPath`
 *     is omitted — the content ROOT itself. Jobs are a flat record, so their
 *     sections are object sections writing distinct keys of the same root.
 *
 * Resume field keys mirror the canonical camelCase JSON-Resume content
 * (`@/types/resume` `ResumeData`); job field keys mirror the job edit payload
 * (`JobDocumentContent` in `job-content.ts`). Array items carry a stable `id`
 * (resume items are id-keyed for skill-evidence + metaData binding — see
 * [[project_skill_evidence]]); `newItem()` stamps one.
 */
import { newId } from "@/lib/studio/editor-v2/document-edit";
import type { DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import {
  DISPLAY_PRIVACY_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  JOB_STATUS_OPTIONS,
  WORK_SETTING_OPTIONS,
} from "@/lib/constants/enums";

export type FieldType =
  | "text"
  | "textarea"
  // Month-precision text (resume dates are "YYYY-MM").
  | "date"
  // Full-date picker (`<input type="date">`, "YYYY-MM-DD") — job go-live / expiry.
  | "day"
  // One value per line ⇄ string[] (resume highlights).
  | "list"
  // Free-text tag pills ⇄ string[] (tags / keywords) — type-and-enter.
  | "chips"
  | "number"
  | "select"
  // Multiple enum values → number[] (job employment types).
  | "multiselect"
  | "image";

export interface FieldOption {
  value: string;
  label: string;
}

/** Adapt a canonical numeric `*_OPTIONS` enum list (the single source in
 *  `constants/enums.ts`) to the string-valued `FieldOption` the schema uses;
 *  fields flag `numeric` so the editor coerces the value back to a number. */
function enumFieldOptions(
  opts: readonly { value: number; label: string }[],
): FieldOption[] {
  return opts.map((o) => ({ value: String(o.value), label: o.label }));
}

export interface SectionFieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Choices for `type === "select"`. */
  options?: FieldOption[];
  /** Store the value as a number, not a string — for `number` fields and
   *  enum `select`s backed by numeric columns (job workSetting / status). */
  numeric?: boolean;
}

/** Whether a section maps onto a repeating list or a single object. */
export type SectionShape = "array" | "object";

export interface DocumentSectionSchema {
  /** Content key (array sections) or the object key (object sections with an
   *  `objectPath`). For root object sections (jobs) it's just the block id. */
  sectionKey: string;
  /** Section heading default. */
  label: string;
  /** Singular noun for the "Add <item>" button (array sections). */
  itemNoun: string;
  shape: SectionShape;
  /** Object sections: the content key the object lives under. Undefined = the
   *  content root object itself (the flat job record). Ignored for arrays. */
  objectPath?: string;
  fields: SectionFieldDef[];
  /** Mint a blank array item with a stable id + empty fields. */
  newItem: () => Record<string, unknown>;
}

function blank(fields: SectionFieldDef[]): Record<string, unknown> {
  const item: Record<string, unknown> = { id: newId("item") };
  for (const f of fields) item[f.key] = f.type === "list" ? [] : "";
  return item;
}

function arraySchema(
  sectionKey: string,
  label: string,
  itemNoun: string,
  fields: SectionFieldDef[],
): DocumentSectionSchema {
  return { sectionKey, label, itemNoun, shape: "array", fields, newItem: () => blank(fields) };
}

function objectSchema(
  sectionKey: string,
  label: string,
  fields: SectionFieldDef[],
  objectPath?: string,
): DocumentSectionSchema {
  return {
    sectionKey,
    label,
    itemNoun: "field",
    shape: "object",
    objectPath,
    fields,
    newItem: () => blank(fields),
  };
}

// ── Resume ───────────────────────────────────────────────────────────────────

/** `basics` is an OBJECT (name / title / contact / summary) nested under
 *  `content.basics` — the header block. */
export const BASICS_FIELDS: SectionFieldDef[] = [
  { key: "name", label: "Full name", type: "text" },
  { key: "label", label: "Title", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "url", label: "Website", type: "text" },
  { key: "summary", label: "Summary", type: "textarea" },
];

const WORK_FIELDS: SectionFieldDef[] = [
  { key: "position", label: "Title", type: "text" },
  { key: "name", label: "Company", type: "text" },
  { key: "startDate", label: "Start", type: "date" },
  { key: "endDate", label: "End", type: "date" },
  { key: "summary", label: "Summary", type: "textarea" },
  { key: "highlights", label: "Highlights", type: "list" },
];

const EDUCATION_FIELDS: SectionFieldDef[] = [
  { key: "institution", label: "Institution", type: "text" },
  { key: "area", label: "Area", type: "text" },
  { key: "studyType", label: "Degree", type: "text" },
  { key: "startDate", label: "Start", type: "date" },
  { key: "endDate", label: "End", type: "date" },
  { key: "score", label: "Score", type: "text" },
];

const RESUME_SECTION_SCHEMAS: Record<string, DocumentSectionSchema> = {
  basics: objectSchema("basics", "Basics", BASICS_FIELDS, "basics"),
  work: arraySchema("work", "Work Experience", "role", WORK_FIELDS),
  education: arraySchema("education", "Education", "school", EDUCATION_FIELDS),
  volunteer: arraySchema("volunteer", "Volunteer", "role", [
    { key: "organization", label: "Organization", type: "text" },
    { key: "position", label: "Role", type: "text" },
    { key: "startDate", label: "Start", type: "date" },
    { key: "endDate", label: "End", type: "date" },
    { key: "summary", label: "Summary", type: "textarea" },
    { key: "highlights", label: "Highlights", type: "list" },
  ]),
  projects: arraySchema("projects", "Projects", "project", [
    { key: "name", label: "Name", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "url", label: "URL", type: "text" },
    { key: "highlights", label: "Highlights", type: "list" },
  ]),
  skills: arraySchema("skills", "Skills", "skill", [
    { key: "name", label: "Skill", type: "text" },
    { key: "level", label: "Level", type: "text" },
    { key: "keywords", label: "Keywords", type: "list" },
  ]),
  awards: arraySchema("awards", "Awards", "award", [
    { key: "title", label: "Title", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "awarder", label: "Awarder", type: "text" },
    { key: "summary", label: "Summary", type: "textarea" },
  ]),
  certificates: arraySchema("certificates", "Certificates", "certificate", [
    { key: "name", label: "Name", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "issuer", label: "Issuer", type: "text" },
    { key: "url", label: "URL", type: "text" },
  ]),
  publications: arraySchema("publications", "Publications", "publication", [
    { key: "name", label: "Title", type: "text" },
    { key: "publisher", label: "Publisher", type: "text" },
    { key: "releaseDate", label: "Date", type: "date" },
    { key: "url", label: "URL", type: "text" },
    { key: "summary", label: "Summary", type: "textarea" },
  ]),
  languages: arraySchema("languages", "Languages", "language", [
    { key: "language", label: "Language", type: "text" },
    { key: "fluency", label: "Fluency", type: "text" },
  ]),
  interests: arraySchema("interests", "Interests", "interest", [
    { key: "name", label: "Interest", type: "text" },
    { key: "keywords", label: "Keywords", type: "list" },
  ]),
  references: arraySchema("references", "References", "reference", [
    { key: "name", label: "Name", type: "text" },
    { key: "reference", label: "Reference", type: "textarea" },
  ]),
};

// ── Job posting ──────────────────────────────────────────────────────────────
//
// A job is a FLAT record (`JobDocumentContent`), so every section is an object
// section writing distinct keys of the content root (`objectPath` omitted). The
// enum selects/multiselects reuse the canonical `*_OPTIONS` lists from
// `constants/enums.ts` (single source) and store as numbers (`numeric`).
// `seniority` + `industry` are NOT exposed yet (their numeric taxonomy isn't a
// canonical option list — see gap #1953); they ride through as passthrough.

const JOB_SECTION_SCHEMAS: Record<string, DocumentSectionSchema> = {
  overview: objectSchema("overview", "Overview", [
    { key: "title", label: "Job title", type: "text" },
    { key: "heroImageUrl", label: "Hero image", type: "image" },
    { key: "description", label: "About this role", type: "textarea" },
  ]),
  responsibilities: objectSchema("responsibilities", "What you'll do", [
    { key: "responsibilities", label: "Responsibilities", type: "list" },
  ]),
  requirements: objectSchema("requirements", "Requirements", [
    { key: "requirements", label: "Requirements", type: "list" },
  ]),
  compensation: objectSchema("compensation", "Compensation", [
    { key: "salary", label: "Salary (annual)", type: "number" },
    { key: "bonus", label: "Bonus", type: "number" },
    { key: "equity", label: "Equity %", type: "number" },
  ]),
  details: objectSchema("details", "Role details", [
    { key: "employmentType", label: "Employment type", type: "multiselect", numeric: true, options: enumFieldOptions(EMPLOYMENT_TYPE_OPTIONS) },
    { key: "workSetting", label: "Work setting", type: "select", numeric: true, options: enumFieldOptions(WORK_SETTING_OPTIONS) },
    { key: "status", label: "Status", type: "select", numeric: true, options: enumFieldOptions(JOB_STATUS_OPTIONS) },
    { key: "hiringTarget", label: "Openings", type: "number" },
  ]),
  publishing: objectSchema("publishing", "Publishing & apply", [
    { key: "privacy_ShowJob", label: "Visibility", type: "select", numeric: true, options: enumFieldOptions(DISPLAY_PRIVACY_OPTIONS) },
    { key: "goLiveDate", label: "Go-live date", type: "day" },
    { key: "expirationDate", label: "Expires", type: "day" },
    { key: "atsApplyUrl", label: "Application URL", type: "text" },
  ]),
};

// ── Registry ─────────────────────────────────────────────────────────────────

const DOCUMENT_SECTION_SCHEMAS: Record<
  DocumentEntityKind,
  Record<string, DocumentSectionSchema>
> = {
  resume: RESUME_SECTION_SCHEMAS,
  job: JOB_SECTION_SCHEMAS,
  // Article / blog author free-content (text/image) blocks, not field-bound
  // sections (#1914) — no section schemas.
  article: {},
  blog: {},
};

/** The section schema for an entity's section key, or null when the section
 *  isn't field-editable (so the canvas falls back to the read-only summary). */
export function documentSectionSchema(
  entityKind: DocumentEntityKind,
  sectionKey: string | undefined,
): DocumentSectionSchema | null {
  if (!sectionKey) return null;
  return DOCUMENT_SECTION_SCHEMAS[entityKind]?.[sectionKey] ?? null;
}
