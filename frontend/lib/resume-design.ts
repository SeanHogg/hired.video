/**
 * A résumé's DESIGN — which template it renders with and in what structure —
 * as stored on its row and resolved for display. The ONE rule every surface
 * renders with (the kit preview, /resumes/:id, its print/PDF route, the review
 * page), so they can never show the same résumé two different ways.
 *
 * Stored in `content.meta`:
 *   template        the design template id
 *   structure       chronological | hybrid | functional (section order)
 *   style           the look set by hand over the template — font, size,
 *                   spacing, colour, page (resume-style.ts)
 *   documentLayout  a studio résumé page layout: a résumé edited on the old
 *                   studio document canvas, or one wearing a creator's
 *                   résumé studio template (withDocumentLayout). When present
 *                   it wins (it carries the custom section order /
 *                   visibility). The kit keeps it until the user picks a new
 *                   design there, which replaces it (withDesign drops it).
 *
 * Pure.
 */
import type { ResumeContent } from "@shared/resume";
import { RESUME_STRUCTURES, analyzeResume, type ResumeStructure } from "@shared/resume-insights";
import {
  DEFAULT_DESCRIPTOR,
  getTemplateById,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import { descriptorFromResumeDocument } from "@/lib/studio/document/resume-document-descriptor";
import { applyResumeStructure } from "@/lib/build/resume-structure";
import { applyResumeStyle, compactStyle, isEmptyStyle, parseResumeStyle, resumeStyleKey, type ResumeStyle } from "@/lib/build/resume-style";

/** A design picked in the kit workspace. `structure: null` = the template's own order. */
export interface ResumeDesign {
  templateId: string;
  structure: ResumeStructure | null;
  /** The look over the template; absent / empty = the template's own. */
  style?: ResumeStyle;
}

type MaybeContent = { meta?: unknown } | null | undefined;

function metaOf(content: MaybeContent): Record<string, unknown> {
  const meta = content?.meta;
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

/** The legacy studio page layout, when the résumé has one. */
export function savedLayout(content: MaybeContent): DocumentState | null {
  const layout = metaOf(content).documentLayout;
  return layout && typeof layout === "object" ? (layout as DocumentState) : null;
}

/** The template the résumé renders with, when it is one we can render. */
export function savedTemplateId(content: MaybeContent): string | null {
  const id = savedLayout(content)?.templateId ?? metaOf(content).template;
  return typeof id === "string" && getTemplateById(id) ? id : null;
}

export function savedStructure(content: MaybeContent): ResumeStructure | null {
  const s = metaOf(content).structure;
  return typeof s === "string" && (RESUME_STRUCTURES as readonly string[]).includes(s)
    ? (s as ResumeStructure)
    : null;
}

/** The look stored over the template (empty when there is none). */
export function savedStyle(content: MaybeContent): ResumeStyle {
  return parseResumeStyle(metaOf(content).style);
}

/** Render a picked design against this content. */
export function designDescriptor(content: MaybeContent, design: ResumeDesign): ResumeTemplateDescriptor {
  const template = getTemplateById(design.templateId) ?? DEFAULT_DESCRIPTOR;
  const structured = design.structure
    ? applyResumeStructure(template, design.structure, {
        // Education-first belongs to the early-career HYBRID recommendation.
        educationFirst:
          design.structure === "hybrid" && analyzeResume((content ?? {}) as ResumeContent).educationFirst,
      })
    : template;
  return applyResumeStyle(structured, design.style);
}

/** How a stored résumé renders: legacy layout → template + structure → default,
 *  with its stored look over it. */
export function resolveResumeDescriptor(content: MaybeContent): ResumeTemplateDescriptor {
  const layout = savedLayout(content);
  if (layout) return applyResumeStyle(descriptorFromResumeDocument(layout), savedStyle(content));
  return designDescriptor(content, {
    templateId: savedTemplateId(content) ?? DEFAULT_DESCRIPTOR.id,
    structure: savedStructure(content),
    style: savedStyle(content),
  });
}

/** The content as stored with a newly picked design (replaces any legacy
 *  studio layout — the design picked in the kit workspace is now the source of truth). */
export function withDesign(content: ResumeContent, design: ResumeDesign): ResumeContent {
  const { documentLayout: _replaced, structure: _previous, style: _look, ...meta } = metaOf(content);
  return {
    ...content,
    meta: {
      ...meta,
      template: design.templateId,
      ...(design.structure ? { structure: design.structure } : {}),
      ...(isEmptyStyle(design.style) ? {} : { style: compactStyle(design.style as ResumeStyle) }),
    },
  };
}

/** The content wearing a studio résumé page layout (a creator's résumé
 *  template). Replaces any picked design and look — the layout carries its
 *  own — and binds the layout to no entity (it is structure, not content). */
export function withDocumentLayout(content: ResumeContent, layout: DocumentState): ResumeContent {
  const { documentLayout: _old, template: _template, structure: _structure, style: _look, ...meta } = metaOf(content);
  return {
    ...content,
    meta: { ...meta, documentLayout: { ...layout, entityKind: "resume", entityId: null } },
  };
}

/** Stable identity of a design, for "did it change" checks. */
export function designKey(design: ResumeDesign | null): string {
  return design ? `${design.templateId}|${design.structure ?? ""}|${resumeStyleKey(design.style)}` : "saved";
}
