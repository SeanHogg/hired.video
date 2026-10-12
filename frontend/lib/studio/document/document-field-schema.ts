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
 * (`JobDocumentContent` in `job-content.ts`, schemas in `job-field-schema.ts`);
 * company keys mirror `CompanyDocumentContent` (`company-content.ts`, schemas
 * in `company-field-schema.ts`). The shared types + builders live in
 * `field-schema-core.ts` and are re-exported here (one import path). Array
 * items carry a stable `id` (resume items are id-keyed for skill-evidence +
 * metaData binding — see [[project_skill_evidence]]); `newItem()` stamps one.
 */
import type { DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import { EMPLOYMENT_TYPE_LABELS } from "@shared/employment-types";
import { WORK_SETTING_LABELS } from "@shared/work-settings";
import {
  arraySchema,
  objectSchema,
  type DocumentSectionSchema,
  type FieldOption,
  type SectionFieldDef,
} from "./field-schema-core";
import { JOB_SECTION_SCHEMAS } from "./job-field-schema";
import { COMPANY_SECTION_SCHEMAS } from "./company-field-schema";

export * from "./field-schema-core";

// ── Resume ───────────────────────────────────────────────────────────────────

/** `basics` is an OBJECT (name / title / contact / summary) nested under
 *  `content.basics` — the header block. */
export const BASICS_FIELDS: SectionFieldDef[] = [
  { key: "name", label: "Full name", labelKey: "studioFields.fullName", type: "text", validate: { publishRequired: true } },
  { key: "label", label: "Title", labelKey: "studioFields.title", type: "text", validate: { publishRequired: true } },
  { key: "email", label: "Email", labelKey: "studioFields.email", type: "text", validate: { format: "email" } },
  { key: "phone", label: "Phone", labelKey: "studioFields.phone", type: "text" },
  { key: "url", label: "Website", labelKey: "studioFields.website", type: "text", validate: { format: "url" } },
  { key: "summary", label: "Summary", labelKey: "studioFields.summary", type: "textarea" },
];

/** Resume work-entry selects — canonical string values (kebab), stored on the
 *  `Work` entry as `locationType` / `employmentType`. A leading "Not specified"
 *  clears the field (stored as ""). Labels reuse the shared SSoT so the editor,
 *  templates, and job forms all read one vocabulary. Location offers every work
 *  setting; employment is the job-seeker-facing subset (full/part-time, contract
 *  — "Contractor" folds to "contract" via the shared normalizer). */
const RESUME_LOCATION_TYPE_OPTIONS: FieldOption[] = [
  { value: "", label: "Not specified", labelKey: "studioFields.notSpecified" },
  { value: "remote", label: WORK_SETTING_LABELS.remote, labelKey: "studioFields.option.remote" },
  { value: "onsite", label: WORK_SETTING_LABELS.onsite, labelKey: "studioFields.option.onsite" },
  { value: "hybrid", label: WORK_SETTING_LABELS.hybrid, labelKey: "studioFields.option.hybrid" },
];
const RESUME_EMPLOYMENT_TYPE_OPTIONS: FieldOption[] = [
  { value: "", label: "Not specified", labelKey: "studioFields.notSpecified" },
  { value: "full-time", label: EMPLOYMENT_TYPE_LABELS["full-time"], labelKey: "studioFields.option.fullTime" },
  { value: "part-time", label: EMPLOYMENT_TYPE_LABELS["part-time"], labelKey: "studioFields.option.partTime" },
  { value: "contract", label: EMPLOYMENT_TYPE_LABELS.contract, labelKey: "studioFields.option.contract" },
];

const WORK_FIELDS: SectionFieldDef[] = [
  { key: "position", label: "Title", labelKey: "studioFields.title", type: "text" },
  { key: "name", label: "Company", labelKey: "studioFields.company", type: "text" },
  { key: "startDate", label: "Start", labelKey: "studioFields.start", type: "date" },
  { key: "endDate", label: "End", labelKey: "studioFields.end", type: "date" },
  { key: "employmentType", label: "Employment", labelKey: "studioFields.employment", type: "select", options: RESUME_EMPLOYMENT_TYPE_OPTIONS },
  { key: "locationType", label: "Location", labelKey: "studioFields.location", type: "select", options: RESUME_LOCATION_TYPE_OPTIONS },
  { key: "summary", label: "Summary", labelKey: "studioFields.summary", type: "textarea" },
  { key: "highlights", label: "Highlights", labelKey: "studioFields.highlights", type: "list" },
];

const EDUCATION_FIELDS: SectionFieldDef[] = [
  { key: "institution", label: "Institution", labelKey: "studioFields.institution", type: "text" },
  { key: "area", label: "Area", labelKey: "studioFields.area", type: "text" },
  { key: "studyType", label: "Degree", labelKey: "studioFields.degree", type: "text" },
  { key: "startDate", label: "Start", labelKey: "studioFields.start", type: "date" },
  { key: "endDate", label: "End", labelKey: "studioFields.end", type: "date" },
  { key: "score", label: "Score", labelKey: "studioFields.score", type: "text" },
];

const DATE_RANGE = { start: "startDate", end: "endDate" } as const;

/** Résumé section headings reuse the résumé editor's `tabs.<section>` keys. */
function withTabLabelKeys(
  schemas: Record<string, DocumentSectionSchema>,
): Record<string, DocumentSectionSchema> {
  return Object.fromEntries(
    Object.entries(schemas).map(([key, schema]) => [key, { ...schema, labelKey: `tabs.${key}` }]),
  );
}

const RESUME_SECTION_SCHEMAS: Record<string, DocumentSectionSchema> = withTabLabelKeys({
  basics: objectSchema("basics", "Basics", BASICS_FIELDS, "basics"),
  work: arraySchema("work", "Work Experience", WORK_FIELDS, DATE_RANGE),
  education: arraySchema("education", "Education", EDUCATION_FIELDS, DATE_RANGE),
  volunteer: arraySchema("volunteer", "Volunteer", [
    { key: "organization", label: "Organization", labelKey: "studioFields.organization", type: "text" },
    { key: "position", label: "Role", labelKey: "studioFields.role", type: "text" },
    { key: "startDate", label: "Start", labelKey: "studioFields.start", type: "date" },
    { key: "endDate", label: "End", labelKey: "studioFields.end", type: "date" },
    { key: "summary", label: "Summary", labelKey: "studioFields.summary", type: "textarea" },
    { key: "highlights", label: "Highlights", labelKey: "studioFields.highlights", type: "list" },
  ], DATE_RANGE),
  projects: arraySchema("projects", "Projects", [
    { key: "name", label: "Name", labelKey: "studioFields.name", type: "text" },
    { key: "description", label: "Description", labelKey: "studioFields.description", type: "textarea" },
    { key: "url", label: "URL", labelKey: "studioFields.url", type: "text", validate: { format: "url" } },
    { key: "highlights", label: "Highlights", labelKey: "studioFields.highlights", type: "list" },
  ]),
  skills: arraySchema("skills", "Skills", [
    { key: "name", label: "Skill", labelKey: "studioFields.skill", type: "text" },
    { key: "level", label: "Level", labelKey: "studioFields.level", type: "text" },
    { key: "keywords", label: "Keywords", labelKey: "studioFields.keywords", type: "list" },
  ]),
  awards: arraySchema("awards", "Awards", [
    { key: "title", label: "Title", labelKey: "studioFields.title", type: "text" },
    { key: "date", label: "Date", labelKey: "studioFields.date", type: "date" },
    { key: "awarder", label: "Awarder", labelKey: "studioFields.awarder", type: "text" },
    { key: "summary", label: "Summary", labelKey: "studioFields.summary", type: "textarea" },
  ]),
  certificates: arraySchema("certificates", "Certificates", [
    { key: "name", label: "Name", labelKey: "studioFields.name", type: "text" },
    { key: "date", label: "Date", labelKey: "studioFields.date", type: "date" },
    { key: "issuer", label: "Issuer", labelKey: "studioFields.issuer", type: "text" },
    { key: "url", label: "URL", labelKey: "studioFields.url", type: "text", validate: { format: "url" } },
  ]),
  publications: arraySchema("publications", "Publications", [
    { key: "name", label: "Title", labelKey: "studioFields.title", type: "text" },
    { key: "publisher", label: "Publisher", labelKey: "studioFields.publisher", type: "text" },
    { key: "releaseDate", label: "Date", labelKey: "studioFields.date", type: "date" },
    { key: "url", label: "URL", labelKey: "studioFields.url", type: "text", validate: { format: "url" } },
    { key: "summary", label: "Summary", labelKey: "studioFields.summary", type: "textarea" },
  ]),
  languages: arraySchema("languages", "Languages", [
    { key: "language", label: "Language", labelKey: "studioFields.language", type: "text" },
    { key: "fluency", label: "Fluency", labelKey: "studioFields.fluency", type: "text" },
  ]),
  interests: arraySchema("interests", "Interests", [
    { key: "name", label: "Interest", labelKey: "studioFields.interest", type: "text" },
    { key: "keywords", label: "Keywords", labelKey: "studioFields.keywords", type: "list" },
  ]),
  references: arraySchema("references", "References", [
    { key: "name", label: "Name", labelKey: "studioFields.name", type: "text" },
    { key: "reference", label: "Reference", labelKey: "studioFields.reference", type: "textarea" },
  ]),
});

// ── Registry ─────────────────────────────────────────────────────────────────

const DOCUMENT_SECTION_SCHEMAS: Record<
  DocumentEntityKind,
  Record<string, DocumentSectionSchema>
> = {
  resume: RESUME_SECTION_SCHEMAS,
  job: JOB_SECTION_SCHEMAS,
  company: COMPANY_SECTION_SCHEMAS,
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

/** Every field-editable section schema for an entity — used to validate the
 *  whole content blob on save (#1916). */
export function documentSectionSchemasFor(
  entityKind: DocumentEntityKind,
): DocumentSectionSchema[] {
  return Object.values(DOCUMENT_SECTION_SCHEMAS[entityKind] ?? {});
}
