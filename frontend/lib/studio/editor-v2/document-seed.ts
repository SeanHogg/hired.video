/**
 * Document seeds — the default flow blocks a fresh document of each entity
 * kind opens with, and the factories that build a blank draft or a draft
 * bound to an existing entity row. Split from document-state.ts (which
 * re-exports these) so the state model and the per-entity seed tables are
 * separate modules.
 */
import {
  DEFAULT_DOCUMENT_THEME,
  DOCUMENT_STATE_VERSION,
  type DocumentBlock,
  type DocumentEntityKind,
  type DocumentState,
} from "./document-state";

// Canonical resume section order + per-section title/layout — the single
// source the document seed uses for which blocks a resume opens with.
const RESUME_SECTION_META: ReadonlyArray<{ key: string; title: string; layout: string }> = [
  { key: "work", title: "Work Experience", layout: "timeline" },
  { key: "education", title: "Education", layout: "timeline" },
  { key: "skills", title: "Skills", layout: "grid" },
  { key: "projects", title: "Projects", layout: "cards" },
  { key: "volunteer", title: "Volunteer", layout: "timeline" },
  { key: "certificates", title: "Certificates", layout: "list" },
  { key: "awards", title: "Awards", layout: "list" },
  { key: "publications", title: "Publications", layout: "list" },
  { key: "languages", title: "Languages", layout: "compact" },
  { key: "interests", title: "Interests", layout: "compact" },
  { key: "references", title: "References", layout: "list" },
];

/** Core sections a NEW resume opens with so "create resume" lands ready-to-fill. */
const RESUME_CORE_SECTIONS: ReadonlySet<string> = new Set([
  "work",
  "education",
  "skills",
  "projects",
]);

/** Build the resume's flow blocks: a Header (basics) block + a section block
 *  for each key in `includeKeys`, in canonical order. */
function resumeBlocks(
  idFactory: () => string,
  includeKeys: ReadonlySet<string>,
): DocumentBlock[] {
  const mk = (sectionKey: string, title: string, layout: string): DocumentBlock => ({
    id: idFactory(),
    kind: "section",
    sectionKey,
    title,
    layout,
    mode: "flow",
  });
  return [
    mk("basics", "Header", "compact"),
    ...RESUME_SECTION_META.filter((m) => includeKeys.has(m.key)).map((m) =>
      mk(m.key, m.title, m.layout),
    ),
  ];
}

// Canonical job-posting section order + heading — the single source the job
// document seed uses for which blocks a job opens with. Keys match the job
// section schemas in `job-field-schema.ts`.
const JOB_SECTION_META: ReadonlyArray<{ key: string; title: string; layout: string }> = [
  { key: "overview", title: "Overview", layout: "prose" },
  { key: "responsibilities", title: "What you'll do", layout: "list" },
  { key: "requirements", title: "Requirements", layout: "list" },
  { key: "compensation", title: "Compensation", layout: "compact" },
  { key: "details", title: "Role details", layout: "compact" },
  { key: "publishing", title: "Publishing & apply", layout: "compact" },
];

/** Build the job's flow blocks: one section block per JOB_SECTION_META entry. */
function jobBlocks(idFactory: () => string): DocumentBlock[] {
  return sectionBlocks(JOB_SECTION_META, idFactory);
}

// Canonical company-page section order (#1915) — keys match the company
// section schemas in `company-field-schema.ts`.
const COMPANY_SECTION_META: ReadonlyArray<{ key: string; title: string; layout: string }> = [
  { key: "overview", title: "About the company", layout: "prose" },
  { key: "culture", title: "Culture & stack", layout: "list" },
  { key: "benefits", title: "Benefits", layout: "compact" },
  { key: "mission", title: "Mission & values", layout: "prose" },
  { key: "contact", title: "Contact", layout: "compact" },
  { key: "headquarters", title: "Headquarters", layout: "compact" },
];

/** One flow section block per entry of a flat-record entity's section table. */
function sectionBlocks(
  meta: ReadonlyArray<{ key: string; title: string; layout: string }>,
  idFactory: () => string,
): DocumentBlock[] {
  // No `title`: the heading is the section schema's localized label (#1915).
  return meta.map((m) => ({
    id: idFactory(),
    kind: "section",
    sectionKey: m.key,
    layout: m.layout,
    mode: "flow",
  }));
}

/** Default flow blocks a fresh document of `entityKind` opens with. Resume
 *  starts with its core sections; job opens with its posting sections; article
 *  / blog start with free-content blocks until their section models land. */
function defaultBlocksFor(
  entityKind: DocumentEntityKind,
  idFactory: () => string,
): DocumentBlock[] {
  if (entityKind === "resume") return resumeBlocks(idFactory, RESUME_CORE_SECTIONS);
  if (entityKind === "job") return jobBlocks(idFactory);
  if (entityKind === "company") return sectionBlocks(COMPANY_SECTION_META, idFactory);
  if (entityKind === "article" || entityKind === "blog") {
    // Article / blog (#1914) author free-content blocks (no section model yet).
    // Seed a title + body text block so a new doc opens ready-to-write.
    return [
      { id: idFactory(), kind: "text", title: "Title", text: "Title", mode: "flow" },
      { id: idFactory(), kind: "text", title: "Body", text: "Start writing…", mode: "flow" },
    ];
  }
  return [];
}

/** Blank single-page document seeded for a fresh draft of the given entity. */
export function createBlankDocumentState(
  entityKind: DocumentEntityKind,
  idFactory: () => string,
): DocumentState {
  return {
    schemaVersion: DOCUMENT_STATE_VERSION,
    pageSize: "letter",
    orientation: "portrait",
    columns: 12,
    theme: { ...DEFAULT_DOCUMENT_THEME },
    pages: [{ id: idFactory(), blocks: defaultBlocksFor(entityKind, idFactory), overlays: [] }],
    entityKind,
    entityId: null,
  };
}

/**
 * Document seeded to EDIT an existing resume on the canvas (#1915). Binds
 * `entityId` (so the editor fetches + writes back that resume's content) and
 * seeds blocks for the core sections PLUS every section that already has
 * content (`populatedSectionKeys`) — so nothing in the resume is hidden.
 * Content itself is NOT copied in (it stays in the resume row, loaded via
 * `entityId`); this is layout only.
 */
export function createResumeDocumentState(
  entityId: string,
  populatedSectionKeys: readonly string[],
  idFactory: () => string,
): DocumentState {
  const include = new Set<string>(RESUME_CORE_SECTIONS);
  for (const k of populatedSectionKeys) include.add(k);
  return {
    schemaVersion: DOCUMENT_STATE_VERSION,
    pageSize: "letter",
    orientation: "portrait",
    columns: 12,
    theme: { ...DEFAULT_DOCUMENT_THEME },
    pages: [{ id: idFactory(), blocks: resumeBlocks(idFactory, include), overlays: [] }],
    entityKind: "resume",
    entityId,
  };
}

/**
 * Document seeded to EDIT an existing job posting on the canvas (#1914). Binds
 * `entityId` (so the editor fetches + writes back that job's content) and seeds
 * the standard posting sections. Content itself is NOT copied in (it lives in
 * the job row, loaded via `entityId`); this is layout only. Jobs are always
 * Letter portrait (`DOCUMENT_ENTITY_CAPABILITIES`).
 */
export function createJobDocumentState(
  entityId: string,
  idFactory: () => string,
): DocumentState {
  return createBoundDocumentState("job", entityId, idFactory);
}

/**
 * Document seeded to EDIT an existing flat-record entity (job, company) on
 * the canvas: the entity's default sections, bound to `entityId` so the editor
 * fetches + writes back that row's content (layout only — the content stays
 * in the row).
 */
export function createBoundDocumentState(
  entityKind: DocumentEntityKind,
  entityId: string,
  idFactory: () => string,
): DocumentState {
  return { ...createBlankDocumentState(entityKind, idFactory), entityId };
}
