/**
 * Paged WYSIWYG document runtime — the authoring format for the Studio
 * `document` mediaKind.
 *
 * A `DocumentState` models a printable, multi-page document. Resume is the
 * first entity it backs; article / job / blog generalize onto the same shape
 * (see `DocumentEntityKind`). It is the document kind's canvas runtime the
 * way `CanvasState` backs the time-based kinds and `ImageState` backs `image`
 * (see `shared/media-kinds.ts`). Like `CanvasState`, it lives frontend-side
 * (it composes the frontend-only `Widget` overlay system + theme registry)
 * and persists as JSONB the API stores opaquely — the same arrangement the
 * video canvas uses (`CanvasState` → Timeline JSON on save).
 *
 * ── Same studio canvas, fixed page frame ────────────────────────────────────
 * The document canvas is NOT a stripped-down doc editor — it is the SAME
 * studio canvas (layers, zoom, drag-and-drop, the `<FloatingLayersPanel>`,
 * the properties panel, undo/redo) with two differences:
 *   1. the frame is a fixed print sheet (Letter / Legal / A4 × orientation),
 *      not a 1920×1080 video frame; and
 *   2. the BASE layer is a data-bound, reflowing document (the resume
 *      sections) instead of a solid colour.
 * Everything stacked above that base — images the user made in the
 * `image`/`drawing` studio, video, linked-content cards — are stock studio
 * `Widget`s (reused verbatim from `canvas-state.ts`), dragged on as overlay
 * LAYERS that render over the canvas as an interactive experience.
 *
 * ── Two planes ──────────────────────────────────────────────────────────────
 *   • FLOW plane  — `DocumentPage.blocks`: the printable, reflowing document
 *     body (sections / components / authored text). Top-to-bottom WYSIWYG by
 *     default; any block can detach to an absolute bounding box and snap into
 *     a column (so two sections sit side by side).
 *   • OVERLAY plane — `DocumentPage.overlays`: stock studio `Widget`s
 *     (image / video / linked-content / text / shape / avatar …) positioned
 *     absolutely with the SAME `WidgetPosition` (0..1 fractions + z + rotation)
 *     the video canvas uses, so the drag / resize / snap / zoom / layers math
 *     is shared, not reimplemented.
 * Both planes are one z-ordered LAYER STACK in `<FloatingLayersPanel>`.
 *
 * ── Structure vs content (templates) ────────────────────────────────────────
 * Mirrors the declarative-resume model (`frontend/types/resume-template.ts`),
 * made literal so "save as template" is trivial:
 *   • STRUCTURE (the template) = page setup + theme + block/overlay layout.
 *     Persisted on its own to `resume_templates` → `template_licenses`.
 *   • CONTENT (the data) = the ENTITY row (`resume_information.content`, …).
 *     Blocks REFERENCE content by key/id; they don't embed it. Strip content
 *     from a DocumentState and you have the template.
 *
 * ── Interactivity must NOT be lost (content.metaData / skillEvidence) ────────
 * Resumes are interactive: section items carry attached media via
 * `content.metaData[]` (`ResumeSectionMeta`, bound to an item by `referenceId`)
 * and skills carry `content.skillEvidence[]` (UUID-bound). THAT DATA STAYS IN
 * THE ENTITY CONTENT — never copied into the DocumentState. An overlay image
 * widget can carry a `mediaBinding` (the canvas-side handle that WRITES BACK a
 * `metaData` row for the bound section item); the renderer keeps driving
 * interactive playback off `content.metaData` (`ItemMediaStrip`) and
 * `enrichSkillsWithEvidence` exactly as today. Binding is by stable item `id`
 * (not array index) so a dragged-on image survives section reordering — which
 * is precisely why the studio's drag-and-drop is the right authoring surface.
 *
 * Preview === render: the renderer (a generalized `DeclarativeResumeRenderer`)
 * is the SAME component the editor mounts in edit mode and the viewer / PDF
 * path mounts read-only. What the user arranges is exactly what prints.
 */

import type { Widget } from "./canvas-state";
import type {
  Density,
  FontFamilyKey,
  HeadingStyle,
  ThemeKey,
} from "@/lib/resume-template-themes";
import type { CardStyle } from "@/types/resume-template";

export const DOCUMENT_STATE_VERSION = 1;

// ── Page geometry ────────────────────────────────────────────────────────────

export const PAGE_SIZES = ["letter", "legal", "a4", "tabloid"] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type PageOrientation = "portrait" | "landscape";

/**
 * Portrait page dimensions in CSS pixels at 96dpi — the unit the DOM renderer
 * and the browser print / PDF path both use, so the editor preview matches the
 * printed sheet 1:1. `pageDimensions()` swaps width/height for landscape.
 */
export const PAGE_DIMENSIONS_PX: Record<PageSize, { width: number; height: number }> = {
  letter: { width: 816, height: 1056 }, // 8.5" × 11"
  legal: { width: 816, height: 1344 }, // 8.5" × 14"
  a4: { width: 794, height: 1123 }, // 210 × 297 mm
  tabloid: { width: 1056, height: 1632 }, // 11" × 17"
};

/** Oriented page dimensions in px — the canvas frame size the stage renders
 *  and the zoom math fits to (same role `CanvasState.width/height` plays for
 *  the video stage). */
export function pageDimensions(state: Pick<DocumentState, "pageSize" | "orientation">): {
  width: number;
  height: number;
} {
  const base = PAGE_DIMENSIONS_PX[state.pageSize];
  return state.orientation === "landscape"
    ? { width: base.height, height: base.width }
    : { ...base };
}

// ── Flow-plane blocks (the printable document body) ──────────────────────────

export type BlockLayoutMode = "flow" | "absolute";

/**
 * Bounding box for an `absolute` block — fractions (0..1) of the page CONTENT
 * area (inside the margins). Same convention as `WidgetPosition` so the
 * drag/resize/snap helpers are shared across both planes. Ignored for `flow`.
 */
export interface BlockBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Stacking order within the page's layer stack; higher draws on top. */
  z: number;
}

export type DocumentBlockKind =
  // A slice of the bound entity's content, keyed by `sectionKey`
  // (resume: "work" | "education" | "skills" | …). Rendered via the section
  // layout registry the declarative resume renderer already owns.
  | "section"
  // A whitelisted platform widget (e.g. "career-timeline") — the
  // `ComponentBlock` analogue from resume-template.ts.
  | "component"
  // Free authored content NOT bound to the entity — headers, taglines,
  // branding, and the article/blog flow where the body is authored inline.
  | "text"
  | "image"
  | "divider"
  | "spacer";

export interface DocumentBlock {
  id: string;
  kind: DocumentBlockKind;

  // ── Content binding (kind === "section" | "component") ──
  /** Entity content key when `kind === "section"`. Loose string here so the
   *  model stays entity-agnostic; the renderer narrows it to the entity's
   *  section enum (e.g. `ResumeSectionKey`). */
  sectionKey?: string;
  /** Whitelisted component id when `kind === "component"`. */
  component?: string;

  // ── Per-block render options (reuse the declarative SectionBlock fields) ──
  title?: string;
  /** Maps to the renderer's `SectionLayout`
   *  ("timeline" | "cards" | "grid" | "list" | "compact"). Loose here for the
   *  same entity-agnostic reason as `sectionKey`. */
  layout?: string;
  columns?: 1 | 2 | 3 | 4;
  showHighlights?: boolean;
  /** Surface per-item attachments from `content.metaData` inline (the
   *  interactive media strip). The data path is unchanged — this is the
   *  visibility flag the renderer already honours. */
  showMedia?: boolean;
  /** "date_desc" | "date_asc" | "manual". */
  sortBy?: string;

  // ── Free-content payloads (kind === "text" | "image") ──
  text?: string;
  imageUrl?: string;

  // ── Positioning ──
  mode: BlockLayoutMode;
  /** Required when `mode === "absolute"`. */
  box?: BlockBox;
}

// ── Overlay-plane widgets (interactive layers over the canvas) ───────────────

/**
 * Binds an overlay (or `image` block) to a section ITEM so dropping media on a
 * card writes back a `content.metaData` row (`ResumeSectionMeta`) and the
 * resume stays interactive. By stable item `id`, never array index — survives
 * reorder. Absent → the overlay is a free decorative/branding layer.
 */
export interface MediaBinding {
  /** The bound item's stable `id` (`ResumeSectionMeta.referenceId`). */
  referenceId: string;
  /** Section the item lives in ("work" | "project" | …); narrowed by the
   *  renderer to the entity's item-type enum. */
  itemType?: string;
}

/**
 * An interactive overlay layer = a stock studio `Widget` (reused verbatim, so
 * every widget kind / inspector / drag handle / motion the video canvas has
 * works here) plus an optional `mediaBinding`. Rendered over the document by
 * the same fractional-position math as the video stage.
 */
export interface DocumentOverlay {
  widget: Widget;
  mediaBinding?: MediaBinding;
}

// ── Theme ────────────────────────────────────────────────────────────────────

/** Same `theme` object shape as `ResumeTemplateDescriptor.theme` — reused so
 *  the existing 10 theme palettes + the renderer's resolver are shared. */
export interface DocumentTheme {
  themeKey: ThemeKey;
  fontFamily: FontFamilyKey;
  headingStyle: HeadingStyle;
  density: Density;
  cardStyle?: CardStyle;
}

export const DEFAULT_DOCUMENT_THEME: DocumentTheme = {
  themeKey: "hired-purple",
  fontFamily: "sans",
  headingStyle: "underlined",
  density: "comfortable",
  cardStyle: "flat",
};

// ── Document ─────────────────────────────────────────────────────────────────

export interface DocumentPage {
  id: string;
  /** FLOW plane — the printable, reflowing document body. */
  blocks: DocumentBlock[];
  /** OVERLAY plane — interactive widget layers over the canvas. */
  overlays: DocumentOverlay[];
}

/**
 * Which entity this document renders. Drives (1) how the renderer resolves
 * `section` block content, (2) which palette the editor shows, and (3) the
 * "Save as template" target. Mirrors the polymorphic `(entityKind, entityId)`
 * pattern already used by `shared/content-locations.ts`.
 */
export const DOCUMENT_ENTITY_KINDS = ["resume", "article", "job", "blog"] as const;
export type DocumentEntityKind = (typeof DOCUMENT_ENTITY_KINDS)[number];

/**
 * The bound entity's CONTENT the document renders + edits — a loose record so
 * the renderer/editor stay entity-agnostic (resume = JSON-Resume `ResumeData`;
 * job = the flat `JobDocumentContent`; article/blog author free blocks). Each
 * entity's typed shape is narrowed at its service boundary; on the canvas it's
 * driven declaratively by `document-field-schema.ts`. Never embedded in the
 * DocumentState — it lives in the entity row (see the structure-vs-content note
 * at the top of this file).
 */
export type DocumentEntityContent = Record<string, unknown>;

// ── Per-entity capabilities (single SSoT) ────────────────────────────────────
//
// Not every entity exposes every canvas affordance. This one record is the
// source of truth so the chrome self-gates (the bottom canvas-mode control
// returns null when `configurablePageMode` is false) instead of consumers
// hard-coding `entityKind === "resume"` checks — per the DRY rule. New
// per-entity affordances (e.g. multi-page) add a field here, not a branch
// at the call site.

export interface DocumentEntityCapabilities {
  /** Whether the user can change page size + orientation. Only the resume is
   *  a designed artefact with portrait/landscape freedom; jobs / articles /
   *  blogs are always Letter portrait (a reading document, not a layout). */
  configurablePageMode: boolean;
}

export const DOCUMENT_ENTITY_CAPABILITIES: Record<
  DocumentEntityKind,
  DocumentEntityCapabilities
> = {
  resume: { configurablePageMode: true },
  article: { configurablePageMode: false },
  job: { configurablePageMode: false },
  blog: { configurablePageMode: false },
};

/** Whether the canvas-mode (page size + orientation) control should render for
 *  this entity. The control self-gates on this; callers don't branch on kind. */
export function documentSupportsPageMode(kind: DocumentEntityKind): boolean {
  return DOCUMENT_ENTITY_CAPABILITIES[kind].configurablePageMode;
}

export interface DocumentState {
  schemaVersion: number;

  // ── Structure (the template) ──
  pageSize: PageSize;
  orientation: PageOrientation;
  /**
   * Snap grid — columns across the content area the absolute-block /
   * overlay drag math snaps to. 12 = Bootstrap-style (two half-width sections
   * side-by-side at 6+6); 1 = pure flow, no horizontal snapping.
   */
  columns: number;
  theme: DocumentTheme;
  /** Id of the design template last applied (`DocumentTemplateOption.id`), so
   *  the picker can mark the ACTIVE card unambiguously — themeKey alone is
   *  ambiguous (several templates share a palette). Undefined = bespoke /
   *  never-templated layout. */
  templateId?: string;
  pages: DocumentPage[];

  // ── Content binding ──
  entityKind: DocumentEntityKind;
  /** The saved entity whose content fills the section blocks. null for a
   *  brand-new draft not yet bound to (or saved as) an entity. */
  entityId: string | null;
}

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
// section schemas in `document-field-schema.ts`.
const JOB_SECTION_META: ReadonlyArray<{ key: string; title: string; layout: string }> = [
  { key: "overview", title: "Overview", layout: "prose" },
  { key: "responsibilities", title: "What you'll do", layout: "list" },
  { key: "requirements", title: "Requirements", layout: "list" },
  { key: "details", title: "Compensation & details", layout: "compact" },
];

/** Build the job's flow blocks: one section block per JOB_SECTION_META entry. */
function jobBlocks(idFactory: () => string): DocumentBlock[] {
  return JOB_SECTION_META.map((m) => ({
    id: idFactory(),
    kind: "section",
    sectionKey: m.key,
    title: m.title,
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
  return {
    schemaVersion: DOCUMENT_STATE_VERSION,
    pageSize: "letter",
    orientation: "portrait",
    columns: 12,
    theme: { ...DEFAULT_DOCUMENT_THEME },
    pages: [{ id: idFactory(), blocks: jobBlocks(idFactory), overlays: [] }],
    entityKind: "job",
    entityId,
  };
}
