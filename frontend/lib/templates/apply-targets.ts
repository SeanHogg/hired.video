// Pure decisions behind the "Use template" CTA (useApplyTemplate): which
// action the visitor takes next, the license key a template is owned under,
// its cart line, and where "use" lands. No React — unit-tested on its own.

import { resumeTemplateHref } from "@/lib/studio/resume-editor-link";
import { isResumeTemplate, type TemplateMeta } from "./types";

export type ApplyAction = "use" | "buy" | "claim" | "sign-in";

/** Compute the action verb that should appear on the CTA. Pure — no React
 *  calls — so it can be reused for tests + headless contexts. */
export function nextAction(meta: TemplateMeta, opts: { isAuthed: boolean; isOwned: boolean }): ApplyAction {
  if (opts.isOwned) return "use";
  if (meta.priceCents > 0) return "buy";
  // Free creator templates need a server-side claim so the license appears
  // in the user's ledger; built-ins (studio catalog + résumé presets) can be
  // used directly. Anonymous users get "sign-in" so we never silently send
  // them through a flow that needs auth.
  if (meta.kind === "studio-creator") {
    return opts.isAuthed ? "claim" : "sign-in";
  }
  return "use";
}

/** The license ledger key for a template: creator templates are granted by
 *  studio_templates id under 'studio' (résumé ones included); built-in
 *  studio recipes share 'studio'; résumé presets keep their legacy key. */
export function unlockKeyFor(meta: TemplateMeta): { id: string; kind: "resume" | "studio" } {
  if (meta.origin.kind === "studio-creator") return { id: meta.origin.template.id, kind: "studio" };
  return { id: meta.slug, kind: meta.origin.kind === "resume" ? "resume" : "studio" };
}

/** Cart line id for a paid template — `template:<kind>:<id>`, the shape
 *  Checkout parses into the license it records. Only creator templates are
 *  ever paid. */
export function cartIdFor(meta: TemplateMeta): string {
  const { id, kind } = unlockKeyFor(meta);
  return `template:${kind}:${id}`;
}

/** Where "Use this template" lands. Résumé templates (any origin) open the
 *  career kit wearing them — on the master résumé when there is one; studio
 *  kinds return to the marketplace page, where the now-signed-in visitor
 *  presses Use again and the draft is minted server-side. Also the
 *  post-sign-in `next=` for anonymous visitors. */
export function applyHrefFor(meta: TemplateMeta, masterResumeId?: string | null): string {
  if (isResumeTemplate(meta)) return resumeTemplateHref(meta.slug, masterResumeId);
  return templatePageHref(meta.slug);
}

/** A template's own page — by listing slug, or by id for one not listed
 *  (a private draft opens there for its creator). */
export function templatePageHref(slugOrId: string): string {
  return `/marketplace/templates/${encodeURIComponent(slugOrId)}`;
}
