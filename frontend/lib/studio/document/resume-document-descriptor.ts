/**
 * Bridge: a resume `DocumentState` → a `ResumeTemplateDescriptor`.
 *
 * Resume documents authored on the studio canvas must render through the SAME
 * declarative engine (`DeclarativeResumeRenderer`) that `/resumes/:id` uses —
 * two-column sidebar/main layout, themes, per-section layout, hero — instead of
 * `DocumentView`'s generic single-column block render. The two never matched
 * (different fonts, no columns) which is the "preview doesn't look like the
 * viewer" bug.
 *
 * The canvas only models a flat list of flow blocks + a flat theme. The
 * structural layout that makes the declarative templates look right —
 * `layout.columns`/`sidebar`, `hero`, `documentMode`, `sectionTitleSize` — was
 * dropped when `applyDocumentTemplate` normalised a descriptor down to a
 * `DocumentTemplateOption`. We recover it here from the ORIGINAL declarative
 * template via `state.templateId`, then overlay the canvas's live theme + its
 * section order/visibility so the user's edits on the canvas still drive the
 * render. This keeps every user-authored declarative template working for
 * canvas-authored resumes.
 */
import {
  DEFAULT_DESCRIPTOR,
  getTemplateById,
  type ComponentKey,
  type ResumeBlock,
  type ResumeSectionKey,
  type ResumeTemplateDescriptor,
  type SectionLayout,
  type SortOrder,
} from "@/types/resume-template";
import type {
  DocumentBlock,
  DocumentState,
} from "@/lib/studio/editor-v2/document-state";

// The 11 data-backed section keys the declarative renderer knows how to draw.
// `basics` is intentionally absent — it's the hero header, owned by
// `descriptor.hero`, not a body section.
const RESUME_SECTION_KEYS: ReadonlySet<string> = new Set([
  "work",
  "education",
  "volunteer",
  "skills",
  "languages",
  "projects",
  "awards",
  "certificates",
  "publications",
  "interests",
  "references",
]);

/** Map one canvas flow block to a declarative section/component block, or null
 *  for blocks the template engine doesn't model (the `basics` header, and the
 *  free `text`/`image`/`divider`/`spacer` primitives). */
function blockToDescriptorBlock(b: DocumentBlock): ResumeBlock | null {
  if (b.kind === "component") {
    // Only whitelisted components survive into the descriptor (career-timeline
    // is the sole one today; unknown ones are dropped, matching the renderer's
    // COMPONENT_REGISTRY gate).
    if (b.component !== "career-timeline") return null;
    return {
      kind: "component",
      component: b.component as ComponentKey,
      enabled: true,
      ...(b.title ? { title: b.title } : {}),
    };
  }
  const key = b.sectionKey;
  if (!key || !RESUME_SECTION_KEYS.has(key)) return null;
  return {
    kind: "section",
    key: key as ResumeSectionKey,
    enabled: true,
    ...(b.title ? { title: b.title } : {}),
    layout: (b.layout as SectionLayout | undefined) ?? "list",
    ...(b.columns ? { columns: b.columns } : {}),
    ...(b.showHighlights ? { showHighlights: b.showHighlights } : {}),
    ...(b.showMedia ? { showMedia: b.showMedia } : {}),
    ...(b.sortBy ? { sortBy: b.sortBy as SortOrder } : {}),
  };
}

export function descriptorFromResumeDocument(
  state: DocumentState,
): ResumeTemplateDescriptor {
  const base = getTemplateById(state.templateId) ?? DEFAULT_DESCRIPTOR;

  const flowBlocks = (state.pages[0]?.blocks ?? []).filter((b) => b.mode === "flow");

  const sections = flowBlocks
    .map(blockToDescriptorBlock)
    .filter((b): b is ResumeBlock => b !== null);

  // The hero (name / title / contact / summary) is owned by `descriptor.hero`,
  // not a body section — but it must still track the canvas. The `basics`
  // section block IS the header on the editing canvas, so the rendered preview
  // shows the hero only when that block is present (added + not removed). Without
  // this, removing the Header block on the canvas left the hero stranded in the
  // preview/PDF — "the template doesn't match the visible sections". A bare stub
  // (no mappable section blocks at all) keeps the template's own hero so a
  // freshly-opened resume still renders its header.
  const hasBasicsBlock = flowBlocks.some((b) => b.sectionKey === "basics");
  const hero =
    sections.length > 0 ? { ...base.hero, enabled: hasBasicsBlock } : base.hero;

  return {
    ...base,
    // Overlay the canvas's live theme (font / heading / density / palette the
    // user can tweak in the editor) onto the template, keeping the template's
    // `sectionTitleSize` since the canvas theme doesn't carry it.
    theme: {
      ...base.theme,
      themeKey: state.theme.themeKey,
      fontFamily: state.theme.fontFamily,
      headingStyle: state.theme.headingStyle,
      density: state.theme.density,
      ...(state.theme.cardStyle ? { cardStyle: state.theme.cardStyle } : {}),
    },
    // Hero visibility follows the canvas's `basics` block (above); structural
    // layout (columns/sidebar) + documentMode stay from the template — the
    // canvas doesn't model them.
    hero,
    // Sections come from the canvas so add/remove/reorder is honoured; fall back
    // to the template's section set when the canvas has no mappable section
    // blocks (e.g. a bare stub).
    sections: sections.length > 0 ? sections : base.sections,
  };
}
