// Unified template contract — the single shape every UI surface consumes.
//
// Three concrete origins hydrate this interface:
//   "resume"          — frontend ResumeTemplateDescriptor presets (built-in résumé layouts)
//   "studio-builtin"  — frontend ContentTemplate catalog (Studio wizard recipes)
//   "studio-creator"  — backend StudioTemplate rows (creator-published: video,
//                       podcast… and résumé templates, documentKind 'resume')
//
// The origin says where a template comes from; WHAT it makes is separate. A
// résumé template — preset or creator-published — carries `resumeDescriptor`,
// and surfaces ask `isResumeTemplate(meta)`, never the origin.
//
// Anything that renders a template card, info button, details panel, or
// "Use template" CTA reads TemplateMeta. Origin-specific data is reachable
// through the discriminated `origin` field when a callsite genuinely needs
// kind-specific behavior — but the default surface is fully generic.

import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import type { TemplateDef as StudioBuiltinDef } from "@/lib/studio/templates/catalog";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";

export type TemplateKind = "resume" | "studio-builtin" | "studio-creator";

export interface TemplateMeta {
  /** URL-safe identifier, unique across all kinds. Drives routing
   *  (/marketplace/templates/:slug) and registry lookups. */
  slug: string;
  kind: TemplateKind;
  name: string;
  /** Short marketing copy for cards + search. Required so consumers don't
   *  branch on kind to decide whether to render a description. */
  blurb: string;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  /** 0 = free, >0 = paid. Drives cart vs. instant-apply branching inside
   *  useApplyTemplate; UI never compares against kind for this. */
  priceCents: number;
  /** Free-form display label (e.g. "Finance / Payroll") — surfaces under the
   *  template name on cards. Optional because not every kind has one. */
  industry?: string;
  tags: string[];
  /** Set when the template makes a résumé (a built-in preset, or a creator
   *  studio template with documentKind 'resume'): how it renders in
   *  previews and cards. Absent for video/podcast/… templates. */
  resumeDescriptor?: ResumeTemplateDescriptor;
  /** Discriminated pointer to the underlying source object — used by the
   *  preview renderer + apply hook to do the kind-specific thing. */
  origin:
    | { kind: "resume"; descriptor: ResumeTemplateDescriptor }
    | { kind: "studio-builtin"; def: StudioBuiltinDef }
    | { kind: "studio-creator"; template: StudioTemplate };
}

export interface TemplateFilter {
  /** Restrict to a single kind. Omit to merge all kinds. */
  kind?: TemplateKind;
  /** Substring match against name/blurb/tags. */
  query?: string;
}

/** True when the template makes a résumé — whichever origin it comes from. */
export function isResumeTemplate(meta: Pick<TemplateMeta, "resumeDescriptor">): boolean {
  return meta.resumeDescriptor != null;
}

/** What a template makes, as the (mediaKind, documentKind) pair the shared
 *  `templateKindLabelKey` (@shared/template-kinds) labels — whichever origin
 *  it comes from. Built-in résumé presets are résumé documents; studio
 *  built-ins carry their catalog kind; creator rows carry their columns. */
export function templateMetaKind(meta: Pick<TemplateMeta, "origin">): {
  mediaKind: string;
  documentKind: string | null;
} {
  switch (meta.origin.kind) {
    case "resume":
      return { mediaKind: "document", documentKind: "resume" };
    case "studio-builtin":
      return {
        mediaKind: meta.origin.def.mediaKind,
        documentKind: meta.origin.def.documentEntityKind ?? null,
      };
    case "studio-creator":
      return {
        mediaKind: meta.origin.template.mediaKind,
        documentKind: meta.origin.template.documentKind ?? null,
      };
  }
}
