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
  type DocumentBlock,
  type DocumentEntityKind,
  type DocumentState,
  type DocumentTheme,
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
  return {
    ...state,
    theme: { ...option.theme },
    templateId: option.id,
    pages: state.pages.map((p, i) => (i === 0 ? { ...p, blocks } : p)),
  };
}
