/**
 * Résumé templates — ONE concept across built-in presets and creator
 * templates.
 *
 * A résumé template is either a built-in preset descriptor (code, free) or a
 * studio template whose document kind is résumé (`mediaKind 'document'` +
 * `documentKind 'resume'`; mig 0520 folded the old `resume_templates` table
 * in). Both reduce to a DESIGN the career kit can wear:
 *
 *   { templateId }  a built-in preset — the kit's Design pick
 *   { layout }      a studio résumé page layout (content-stripped
 *                   DocumentState) — stored on the résumé as its layout
 *
 * …and to a renderable descriptor for previews and cards. Pure.
 */
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import { descriptorFromResumeDocument } from "@/lib/studio/document/resume-document-descriptor";
import { getTemplateById, type ResumeTemplateDescriptor } from "@/types/resume-template";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import { mediaKindIsDocument } from "@shared/media-kinds";

export type ResumeTemplateDesign = { kind: "preset"; templateId: string } | { kind: "layout"; layout: DocumentState };

type StudioTemplateFacts = Pick<StudioTemplate, "mediaKind" | "documentKind" | "videoScript">;

/** True when the studio template is a résumé template. */
export function isResumeStudioTemplate(template: Pick<StudioTemplate, "mediaKind" | "documentKind">): boolean {
  return mediaKindIsDocument(template.mediaKind) && template.documentKind === "resume";
}

/** The design a résumé studio template carries, or null when it is not a
 *  résumé template / carries nothing renderable. A payload with pages is a
 *  full layout; a legacy row with no pages that names a built-in design
 *  (`templateId`) falls back to that preset. */
export function resumeTemplateDesign(template: StudioTemplateFacts): ResumeTemplateDesign | null {
  if (!isResumeStudioTemplate(template)) return null;
  const payload = template.videoScript;
  if (!payload || typeof payload !== "object") return null;
  const state = payload as Partial<DocumentState>;
  if (Array.isArray(state.pages) && state.pages.length > 0) {
    return { kind: "layout", layout: { ...(payload as DocumentState), entityKind: "resume", entityId: null } };
  }
  const templateId = typeof state.templateId === "string" ? state.templateId : null;
  return templateId && getTemplateById(templateId) ? { kind: "preset", templateId } : null;
}

/** How a design renders (previews, cards). */
export function descriptorForDesign(design: ResumeTemplateDesign): ResumeTemplateDescriptor | null {
  if (design.kind === "layout") return descriptorFromResumeDocument(design.layout);
  return getTemplateById(design.templateId) ?? null;
}
