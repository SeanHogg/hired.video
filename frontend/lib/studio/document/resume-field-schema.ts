/**
 * Declarative field schema for resume sections — the single source the
 * document canvas drives inline editing from (#1916, "the canvas is the
 * form"). One record per editable section: which fields an item has, their
 * input type, and how to mint a blank item. The `<SectionEditor>` renders
 * inputs from this; render + edit + new-item all share this schema (DRY) so
 * a field added here lights up everywhere.
 *
 * Field keys mirror the canonical camelCase JSON-Resume content
 * (`shared/resume.ts` / `@/types/resume` `ResumeData`). Every item carries a
 * stable `id` (resume items are id-keyed for skill-evidence + metaData
 * binding — see [[project_skill_evidence]]); `newItem()` stamps one.
 */
import { newId } from "@/lib/studio/editor-v2/document-edit";

export type FieldType = "text" | "textarea" | "date" | "list";

export interface SectionFieldDef {
  key: string;
  label: string;
  type: FieldType;
}

export interface ResumeSectionSchema {
  /** Content array key (work / education / …). */
  sectionKey: string;
  /** Section heading default. */
  label: string;
  /** Singular noun for the "Add <item>" button. */
  itemNoun: string;
  fields: SectionFieldDef[];
  /** Mint a blank item with a stable id + empty fields. */
  newItem: () => Record<string, unknown>;
}

function blank(fields: SectionFieldDef[]): Record<string, unknown> {
  const item: Record<string, unknown> = { id: newId("item") };
  for (const f of fields) item[f.key] = f.type === "list" ? [] : "";
  return item;
}

function schema(
  sectionKey: string,
  label: string,
  itemNoun: string,
  fields: SectionFieldDef[],
): ResumeSectionSchema {
  return { sectionKey, label, itemNoun, fields, newItem: () => blank(fields) };
}

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

/** Per-section schemas, keyed by content section key. The document canvas
 *  offers inline editing only for sections present here; others fall back to
 *  the read-only summary. */
export const RESUME_SECTION_SCHEMAS: Record<string, ResumeSectionSchema> = {
  work: schema("work", "Work Experience", "role", WORK_FIELDS),
  education: schema("education", "Education", "school", EDUCATION_FIELDS),
  volunteer: schema("volunteer", "Volunteer", "role", [
    { key: "organization", label: "Organization", type: "text" },
    { key: "position", label: "Role", type: "text" },
    { key: "startDate", label: "Start", type: "date" },
    { key: "endDate", label: "End", type: "date" },
    { key: "summary", label: "Summary", type: "textarea" },
    { key: "highlights", label: "Highlights", type: "list" },
  ]),
  projects: schema("projects", "Projects", "project", [
    { key: "name", label: "Name", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "url", label: "URL", type: "text" },
    { key: "highlights", label: "Highlights", type: "list" },
  ]),
  skills: schema("skills", "Skills", "skill", [
    { key: "name", label: "Skill", type: "text" },
    { key: "level", label: "Level", type: "text" },
    { key: "keywords", label: "Keywords", type: "list" },
  ]),
  awards: schema("awards", "Awards", "award", [
    { key: "title", label: "Title", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "awarder", label: "Awarder", type: "text" },
    { key: "summary", label: "Summary", type: "textarea" },
  ]),
  certificates: schema("certificates", "Certificates", "certificate", [
    { key: "name", label: "Name", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "issuer", label: "Issuer", type: "text" },
    { key: "url", label: "URL", type: "text" },
  ]),
  publications: schema("publications", "Publications", "publication", [
    { key: "name", label: "Title", type: "text" },
    { key: "publisher", label: "Publisher", type: "text" },
    { key: "releaseDate", label: "Date", type: "date" },
    { key: "url", label: "URL", type: "text" },
    { key: "summary", label: "Summary", type: "textarea" },
  ]),
  languages: schema("languages", "Languages", "language", [
    { key: "language", label: "Language", type: "text" },
    { key: "fluency", label: "Fluency", type: "text" },
  ]),
  interests: schema("interests", "Interests", "interest", [
    { key: "name", label: "Interest", type: "text" },
    { key: "keywords", label: "Keywords", type: "list" },
  ]),
  references: schema("references", "References", "reference", [
    { key: "name", label: "Name", type: "text" },
    { key: "reference", label: "Reference", type: "textarea" },
  ]),
};

export function resumeSectionSchema(sectionKey: string | undefined): ResumeSectionSchema | null {
  if (!sectionKey) return null;
  return RESUME_SECTION_SCHEMAS[sectionKey] ?? null;
}
