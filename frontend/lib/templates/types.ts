// Unified template contract — the single shape every UI surface consumes.
//
// Three concrete origins hydrate this interface:
//   "resume"          — frontend ResumeTemplateDescriptor presets (resume layout)
//   "studio-builtin"  — frontend ContentTemplate catalog (Studio wizard recipes)
//   "studio-creator"  — backend StudioTemplate rows (creator-published video scripts)
//
// Anything that renders a template card, info button, details panel, or
// "Use template" CTA reads TemplateMeta. Origin-specific data is reachable
// through the discriminated `origin` field when a callsite genuinely needs
// kind-specific behavior — but the default surface is fully generic.

import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import type { TemplateDef as StudioBuiltinDef } from "@/components/studio/templates/catalog";
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
