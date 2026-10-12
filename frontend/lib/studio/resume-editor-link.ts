/**
 * Where a résumé is edited — the SINGLE source for every "Edit resume" entry
 * point (résumé list, detail page, profile, upload sheet, the legacy
 * /resumes/edit/:id route and the studio's old `?editResume=` deep link).
 *
 * A résumé is edited in its career kit — the résumé, its cover letter and
 * its video in ONE workspace. These links go to the kit resolver, which
 * finds (or makes) the résumé's kit project and becomes /studio/<projectId>
 * (lib/workspace/workspace-route.ts, useKitProject):
 *
 *   /studio/resume/<id>                 open the résumé
 *   /studio/resume/<id>?section=<key>   …with that section's editor open
 *   /studio/resume/<id>?panel=design    …with Design open
 *   /studio/resume/<id>?merge=<other>   …merging another saved résumé into it
 *   /studio/resume/<id>?job=<jobId>[&intent=create]
 *                                       …tailored to a tracked job (or a new
 *                                       version created for it)
 *   /studio/resume/<id>?design=<ref>    …wearing a résumé template
 *   /studio/new?start=resume&design=<ref>
 *                                       a new kit wearing a résumé template
 *     (<ref> = a built-in preset id, or a résumé studio template's listing
 *      slug / id — see resumeTemplateHref)
 *
 * Synchronous, so its many callers stay links. A file / pasted job post
 * travels as router state instead (BuildEntryState).
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { kitResumePath } from "@/lib/workspace/workspace-route";

export const SECTION_PARAM = "section";
export const PANEL_PARAM = "panel";
export const DESIGN_PANEL = "design";
export const MERGE_PARAM = "merge";
export const JOB_PARAM = "job";
export const INTENT_PARAM = "intent";
export const CREATE_INTENT = "create";
/** A résumé template to wear: a built-in preset id, or a résumé studio
 *  template's listing slug / id. */
export const DESIGN_PARAM = "design";

export function resumeEditorPath(resumeId: string, section?: string): string {
  return kitResumePath(resumeId, section ? new URLSearchParams({ [SECTION_PARAM]: section }) : undefined);
}

/** Open the résumé with its Design tab (structure + template) showing. */
export function resumeDesignPath(resumeId: string): string {
  return kitResumePath(resumeId, new URLSearchParams({ [PANEL_PARAM]: DESIGN_PANEL }));
}

/** "Use this template" for ANY résumé template (built-in preset or creator
 *  studio template): the visitor's master résumé wearing it, or — without
 *  one — a new kit that wears it once the résumé exists. */
export function resumeTemplateHref(design: string, masterResumeId?: string | null): string {
  if (masterResumeId) return kitResumePath(masterResumeId, new URLSearchParams({ [DESIGN_PARAM]: design }));
  return `${NEW_KIT_PATH}?${new URLSearchParams({ start: "resume", [DESIGN_PARAM]: design }).toString()}`;
}

/** Open `targetId` with `sourceId` merging into it, reviewed on the page. */
export function resumeMergePath(targetId: string, sourceId: string): string {
  return kitResumePath(targetId, new URLSearchParams({ [MERGE_PARAM]: sourceId }));
}

/** Open `resumeId` tailored to a tracked job (`create`: a new version built
 *  for it from the master's evidence instead). */
export function resumeJobPath(resumeId: string, jobId: string, create = false): string {
  const params = new URLSearchParams({ [JOB_PARAM]: jobId });
  if (create) params.set(INTENT_PARAM, CREATE_INTENT);
  return kitResumePath(resumeId, params);
}

/**
 * Send a studio résumé document to its career kit — a saved one opens its
 * résumé, a blank one (a studio résumé template) starts a new kit.
 * Decided ONCE, when the document first loads (`entityKind` is null until
 * then): a document that is not a résumé never redirects, and nothing moves
 * the user mid-session (e.g. when a first save mints the résumé row).
 */
export function useRedirectResumeDocument(
  entityKind: string | null | undefined,
  entityId: string | null | undefined,
): void {
  const navigate = useNavigate();
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !entityKind) return;
    decided.current = true;
    if (entityKind !== "resume") return;
    navigate(entityId ? resumeEditorPath(entityId) : NEW_KIT_PATH, { replace: true });
  }, [entityKind, entityId, navigate]);
}
