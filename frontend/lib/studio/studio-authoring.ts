/**
 * studio-authoring — the single source for "open entity X in the Studio"
 * (#1955 T0.3). Centralises the deep-link querystring convention so every
 * "+ New"/"Edit" entry point and the `StudioLanding` deep-link handlers agree
 * on one rule instead of hand-writing `?editResume=`/`?editJob=` strings in N
 * places (DRY). Adding a new Studio-authored entity = one entry here.
 *
 * Edit opens an EXISTING row on the canvas (`/studio?edit<Kind>=<id>`); create
 * mints a fresh draft from a template (`/studio?contentTemplate=<id>`).
 */
import type { StudioSubjectKind } from "@shared/studio-subject";

/** Document-canvas entities reachable via an `edit*` deep-link today. */
export const DOCUMENT_AUTHORING_KINDS = ["resume", "job", "article"] as const;
export type DocumentAuthoringKind = (typeof DOCUMENT_AUTHORING_KINDS)[number];

/** The querystring param each kind's edit deep-link uses. Also the SSoT the
 *  `StudioLanding` deep-link handler iterates. `subjectKind` is the
 *  `StudioSubject` link minted on the studio project. */
export const DOCUMENT_AUTHORING: Record<
  DocumentAuthoringKind,
  { editParam: string; subjectKind: StudioSubjectKind }
> = {
  resume: { editParam: "editResume", subjectKind: "resume" },
  job: { editParam: "editJob", subjectKind: "job" },
  article: { editParam: "editArticle", subjectKind: "article" },
};

/** Studio URL that opens an existing entity for editing on the canvas. */
export function studioEditHref(kind: DocumentAuthoringKind, id: string): string {
  return `/studio?${DOCUMENT_AUTHORING[kind].editParam}=${encodeURIComponent(id)}`;
}

/** Studio URL that starts a new entity from its content template. */
export function studioCreateHref(contentTemplateId: string): string {
  return `/studio?contentTemplate=${encodeURIComponent(contentTemplateId)}`;
}

/** The set of edit-param names — used by the landing page's `redirecting`
 *  guard + deep-link dispatch so they never drift from the registry. */
export const STUDIO_EDIT_PARAMS: string[] = Object.values(DOCUMENT_AUTHORING).map(
  (d) => d.editParam,
);
