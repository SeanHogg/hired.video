/**
 * studio-authoring — the single source for "open entity X in the Studio"
 * (#1955 T0.3). Centralises the deep-link querystring convention so every
 * "+ New"/"Edit" entry point and the `StudioLanding` deep-link handlers agree
 * on one rule instead of hand-writing `?editResume=`/`?editJob=` strings in N
 * places (DRY). Adding a new Studio-authored entity = one entry here.
 *
 * Edit opens an EXISTING row on the canvas (`/studio?edit<Kind>=<id>`); create
 * mints a fresh draft from the entity's input template
 * (`/studio?contentTemplate=<id>`).
 */
import type { StudioSubject, StudioSubjectKind } from "@shared/studio-subject";
import type { DocumentEntityKind } from "@shared/document-entity-kinds";
import type { ContentTemplate } from "@/lib/studio/templates/catalog";
import { studioCreatePath } from "@shared/studio-paths";

/** Document-canvas entities reachable via an `edit*` deep-link today. Résumés
 *  are NOT among them: they are edited in the kit workspace
 *  (resume-editor-link.ts); `?editResume=` only survives as a legacy redirect. */
export const DOCUMENT_AUTHORING_KINDS = ["job", "article", "company"] as const;
export type DocumentAuthoringKind = (typeof DOCUMENT_AUTHORING_KINDS)[number];

/** The querystring param each kind's edit deep-link uses. Also the SSoT the
 *  `StudioLanding` deep-link handler iterates. `subjectKind` is the
 *  `StudioSubject` link minted on the studio project; `createTemplate` is the
 *  catalog input template a NEW one starts from (#1915). */
export const DOCUMENT_AUTHORING: Record<
  DocumentAuthoringKind,
  { editParam: string; subjectKind: StudioSubjectKind; createTemplate: ContentTemplate }
> = {
  job: { editParam: "editJob", subjectKind: "job", createTemplate: "job_doc" },
  article: { editParam: "editArticle", subjectKind: "article", createTemplate: "article_doc" },
  company: { editParam: "editCompany", subjectKind: "company", createTemplate: "company_doc" },
};

export function isDocumentAuthoringKind(kind: string): kind is DocumentAuthoringKind {
  return (DOCUMENT_AUTHORING_KINDS as readonly string[]).includes(kind);
}

/** Studio URL that opens an existing entity on the document canvas. */
export function studioEditHref(kind: DocumentAuthoringKind, id: string): string {
  return `/studio?${DOCUMENT_AUTHORING[kind].editParam}=${encodeURIComponent(id)}`;
}

/** Studio URL that starts a new entity from its content template. */
export function studioCreateHref(contentTemplateId: string): string {
  return studioCreatePath(contentTemplateId);
}

/** Studio URL that starts a NEW entity of `kind` from its input template —
 *  what every "+ New job" / "Create company" entry point links to. */
export function studioNewEntityHref(kind: DocumentAuthoringKind): string {
  return studioCreateHref(DOCUMENT_AUTHORING[kind].createTemplate);
}

/** The subject a document bound to an entity row links its project to, so the
 *  entity's page and a later "Edit" find the same project (#1882, #274). Null
 *  for kinds that aren't studio-authored here (résumé, blog). */
export function documentEntitySubject(
  entityKind: DocumentEntityKind,
  entityId: string | null,
): StudioSubject | null {
  if (!entityId || !isDocumentAuthoringKind(entityKind)) return null;
  return { kind: DOCUMENT_AUTHORING[entityKind].subjectKind, id: entityId };
}

/** Old `/studio?editResume=<id>` links (emails, bookmarks) — the landing
 *  redirects them to the kit workspace. */
export const LEGACY_RESUME_EDIT_PARAM = "editResume";

/** The set of edit-param names — used by the landing page's `redirecting`
 *  guard + deep-link dispatch so they never drift from the registry. */
export const STUDIO_EDIT_PARAMS: string[] = [
  ...Object.values(DOCUMENT_AUTHORING).map((d) => d.editParam),
  LEGACY_RESUME_EDIT_PARAM,
];
