/**
 * Design-template bridge for the document canvas — the seam that lets the
 * Studio document editor surface the SAME resume / job design presets that the
 * marketing galleries show ([TemplateGallery] / [JobTemplateGallery]) and apply
 * one to the live `DocumentState`.
 *
 * Why this exists: the document runtime (#1912) seeds a BLANK page, so a user
 * authoring a resume/job in the studio never saw the dozen-odd designed
 * layouts that already ship as declarative descriptors
 * (`frontend/types/resume-template.ts`, `frontend/types/job-template.ts`).
 * This module normalizes both descriptor families to ONE entity-agnostic
 * `DocumentTemplateOption` (the common spine #1914c calls for) so the picker UI
 * and the applicator never branch on resume-vs-job, then maps a chosen option's
 * theme + enabled sections onto the document's flow plane.
 *
 * Structure-only: a template carries page/theme/section LAYOUT, never content
 * (per the structure-vs-content split in `document-state.ts`). Applying one
 * replaces the page's flow blocks + theme and leaves `entityId`, overlays, and
 * the bound entity content untouched.
 */

import {
  DEFAULT_DOCUMENT_THEME,
  DOCUMENT_ENTITY_KINDS,
  type DocumentBlock,
  type DocumentEntityKind,
  type DocumentState,
  type DocumentTheme,
  type PageOrientation,
  type PageSize,
} from "./document-state";
import {
  TEMPLATE_PRESETS,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";
import {
  JOB_TEMPLATE_PRESETS,
  type JobTemplateDescriptor,
} from "@/types/job-template";

/** A section/component block minus the per-instance fields the applicator
 *  stamps on (`id`, `mode`). Mirrors the renderable subset of `DocumentBlock`. */
export type DocumentBlockSpec = Omit<DocumentBlock, "id" | "mode">;

/**
 * Entity-agnostic, picker-ready view of a design template. Both the resume and
 * job descriptor families normalize to this so the picker + applicator stay
 * DRY (one card renderer, one apply path, no `if (kind === "resume")`).
 */
export interface DocumentTemplateOption {
  id: string;
  name: string;
  description?: string;
  industry?: string;
  /** The theme the document adopts when this option is applied. */
  theme: DocumentTheme;
  /** Ordered flow-block specs — the document body structure. */
  sections: DocumentBlockSpec[];
  /** Page geometry the option carries. Built-in descriptor presets leave
   *  these undefined (apply preserves the document's current page setup);
   *  user-saved / marketplace document templates set them so a "Legal
   *  landscape" or "A4" design round-trips its page mode on apply. */
  pageSize?: PageSize;
  orientation?: PageOrientation;
  columns?: number;
  /** Provenance — set for templates that came from the marketplace
   *  (a user's own saved variation or a purchased listing) rather than the
   *  built-in descriptor library. Lets the picker group + badge them and the
   *  card show ownership. Absent for built-in presets. */
  source?: "builtin" | "owned" | "purchased";
}

/** Shared theme shape between both descriptor families → `DocumentTheme`.
 *  Drops `sectionTitleSize` (not part of the document theme model yet). */
function themeFromDescriptor(theme: {
  themeKey: DocumentTheme["themeKey"];
  fontFamily: DocumentTheme["fontFamily"];
  headingStyle: DocumentTheme["headingStyle"];
  density: DocumentTheme["density"];
  cardStyle?: DocumentTheme["cardStyle"];
}): DocumentTheme {
  return {
    themeKey: theme.themeKey,
    fontFamily: theme.fontFamily,
    headingStyle: theme.headingStyle,
    density: theme.density,
    ...(theme.cardStyle ? { cardStyle: theme.cardStyle } : {}),
  };
}

function resumeToOption(d: ResumeTemplateDescriptor): DocumentTemplateOption {
  const sections: DocumentBlockSpec[] = d.sections
    .filter((b) => b.enabled)
    .map((b) =>
      b.kind === "component"
        ? { kind: "component", component: b.component, ...(b.title ? { title: b.title } : {}) }
        : {
            kind: "section",
            sectionKey: b.key,
            ...(b.title ? { title: b.title } : {}),
            layout: b.layout,
            ...(b.columns ? { columns: b.columns } : {}),
            ...(b.showHighlights ? { showHighlights: b.showHighlights } : {}),
            ...(b.showMedia ? { showMedia: b.showMedia } : {}),
            ...(b.sortBy ? { sortBy: b.sortBy } : {}),
          },
    );
  return {
    id: d.id,
    name: d.name,
    ...(d.description ? { description: d.description } : {}),
    ...(d.industry ? { industry: d.industry } : {}),
    theme: themeFromDescriptor(d.theme),
    sections,
  };
}

function jobToOption(d: JobTemplateDescriptor): DocumentTemplateOption {
  const sections: DocumentBlockSpec[] = d.sections
    .filter((b) => b.enabled)
    .map((b) => ({
      kind: "section" as const,
      sectionKey: b.key,
      ...(b.title ? { title: b.title } : {}),
      layout: b.layout,
      ...(b.columns ? { columns: b.columns } : {}),
      ...(b.sortBy ? { sortBy: b.sortBy } : {}),
    }));
  return {
    id: d.id,
    name: d.name,
    ...(d.description ? { description: d.description } : {}),
    ...(d.industry ? { industry: d.industry } : {}),
    theme: themeFromDescriptor(d.theme),
    sections,
  };
}

/**
 * Design templates offered for an entity kind. Resume + job have declarative
 * descriptor libraries today; article/blog have no descriptor model yet
 * (#1914) so they return none — the picker self-gates on an empty list.
 */
export function documentTemplatesForEntity(
  kind: DocumentEntityKind,
): DocumentTemplateOption[] {
  switch (kind) {
    case "resume":
      return TEMPLATE_PRESETS.map(resumeToOption);
    case "job":
      return JOB_TEMPLATE_PRESETS.map(jobToOption);
    case "article":
    case "blog":
      return [];
  }
}

/**
 * Resolve the design template a resume has selected (`content.meta.template`)
 * to its document option, or null when unset / unknown. Shared seam so the
 * studio-landing seed AND the editor's stub re-skin agree on how a resume's
 * stored template id maps to a `DocumentTemplateOption` (#1883 follow-up — the
 * canvas must render the SAME template/font the read-only /resumes/:id view
 * uses). The id is shared between the declarative descriptor and the document
 * option (both derive from TEMPLATE_PRESETS).
 */
export function resumeTemplateOption(
  templateId: string | null | undefined,
): DocumentTemplateOption | null {
  if (!templateId) return null;
  return documentTemplatesForEntity("resume").find((o) => o.id === templateId) ?? null;
}

/**
 * Apply a design template to a document: swap the page-0 flow blocks for the
 * template's sections (fresh ids via `idFactory`) and adopt its theme. Overlays,
 * `entityId`, `entityKind`, page geometry, and bound content are preserved —
 * a template is structure, not content.
 */
export function applyDocumentTemplate(
  state: DocumentState,
  option: DocumentTemplateOption,
  idFactory: () => string,
): DocumentState {
  const blocks: DocumentBlock[] = option.sections.map((spec) => ({
    id: idFactory(),
    mode: "flow",
    ...spec,
  }));

  // A template is structure, not content — so the resume Header (`basics`)
  // block, which carries the person's identity (name / title / contact /
  // summary) and drives the rendered hero, must survive a template swap.
  // Resume template options are built from `TEMPLATE_PRESETS`, whose
  // `sections` never include `basics` (the hero is `descriptor.hero`, not a
  // body section), so applying one would otherwise wipe the Header block and
  // strand the resume with no hero — `descriptorFromResumeDocument` disables
  // the hero when no `basics` block is present ("switching templates drops the
  // header"). Carry the existing Header over (keeping its id + bound content)
  // when the incoming template doesn't supply one. If the user had explicitly
  // removed the Header on the canvas, there is nothing to carry, so their
  // choice is respected.
  const existingBasics = state.pages[0]?.blocks.find(
    (b) => b.mode === "flow" && b.sectionKey === "basics",
  );
  const templateHasBasics = blocks.some((b) => b.sectionKey === "basics");
  const nextBlocks =
    existingBasics && !templateHasBasics ? [existingBasics, ...blocks] : blocks;

  return {
    ...state,
    theme: { ...option.theme },
    templateId: option.id,
    // Adopt the option's page geometry when it carries one (user-saved /
    // marketplace document templates do; built-in presets leave it
    // undefined and the document keeps its current page setup).
    ...(option.pageSize ? { pageSize: option.pageSize } : {}),
    ...(option.orientation ? { orientation: option.orientation } : {}),
    ...(typeof option.columns === "number" ? { columns: option.columns } : {}),
    pages: state.pages.map((p, i) => (i === 0 ? { ...p, blocks: nextBlocks } : p)),
  };
}

// ── Marketplace document templates (saved variations + purchased) ────────────
//
// A document studio-template's payload (`studio_templates.video_script` for a
// `media_kind === "document"` row) is a content-stripped `DocumentState`. These
// helpers bridge that stored payload to the same entity-agnostic
// `DocumentTemplateOption` the built-in presets use, so the picker + applicator
// stay DRY: one card renderer, one apply path, whether the template is a
// shipped preset, the user's own saved variation, or a purchased listing.

/** Read the entity kind a stored document-template payload targets, so the
 *  picker can show only the templates that fit the document being edited.
 *  Returns null for a malformed / non-document payload. */
export function documentTemplateEntityKind(
  payload: unknown,
): DocumentEntityKind | null {
  const kind = (payload as { entityKind?: unknown } | null)?.entityKind;
  return typeof kind === "string" && (DOCUMENT_ENTITY_KINDS as readonly string[]).includes(kind)
    ? (kind as DocumentEntityKind)
    : null;
}

/** Convert a stored content-stripped `DocumentState` payload (a marketplace
 *  document template) into a `DocumentTemplateOption`. Pulls page-0 flow
 *  blocks → section specs, theme, and page geometry. Returns null when the
 *  payload has no usable layout. */
export function documentStateToTemplateOption(
  payload: unknown,
  meta: { id: string; name: string; description?: string | null; source: "owned" | "purchased" },
): DocumentTemplateOption | null {
  const state = payload as Partial<DocumentState> | null;
  const firstPage = Array.isArray(state?.pages) ? state!.pages[0] : undefined;
  const rawBlocks = Array.isArray(firstPage?.blocks) ? firstPage!.blocks : [];
  if (rawBlocks.length === 0) return null;
  const sections: DocumentBlockSpec[] = rawBlocks.map((b) => {
    const { id: _id, mode: _mode, ...spec } = b as DocumentBlock;
    void _id;
    void _mode;
    return spec;
  });
  const theme: DocumentTheme = {
    ...DEFAULT_DOCUMENT_THEME,
    ...(state?.theme ?? {}),
  } as DocumentTheme;
  return {
    id: meta.id,
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    theme,
    sections,
    ...(state?.pageSize ? { pageSize: state.pageSize } : {}),
    ...(state?.orientation ? { orientation: state.orientation } : {}),
    ...(typeof state?.columns === "number" ? { columns: state.columns } : {}),
    source: meta.source,
  };
}

/**
 * Strip the per-document CONTENT binding from a live `DocumentState` so it can
 * be saved as a reusable template (private variation) or published to the
 * marketplace. Frontend mirror of the API's `sanitiseDocumentForTemplate` — the
 * editor passes the result as the publish payload so the row is captured at
 * click time (no extra save round-trip). Clears `entityId` and item-bound
 * overlay `mediaBinding`s; keeps page geometry, theme, columns, and layout.
 */
export function stripDocumentContent(state: DocumentState): DocumentState {
  return {
    ...state,
    entityId: null,
    pages: state.pages.map((p) => ({
      ...p,
      overlays: p.overlays.map(({ mediaBinding: _mb, ...rest }) => {
        void _mb;
        return rest;
      }),
    })),
  };
}
