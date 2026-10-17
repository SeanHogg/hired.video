/**
 * Public playback engagement reads (#1586) — what a signed-out viewer of a
 * public studio project may see of its engagement widgets: ACTIVE forms
 * (only the fields needed to render + submit them), chapters and thumbnail
 * variants. Never review comments, form submissions, answer keys, owner
 * ids or storage keys.
 *
 * Also owns THE rule for "is this studio project publicly viewable?":
 * after the Save/Publish split (#665, #667) the project's own `is_public`
 * flag is authoritative for the in-platform watch page. `publicStudioProjectWhere`
 * is the single SQL predicate every public project read filters on
 * (GET /public?subjectKind=, /videos/featured, the sitemap, this module). The
 * watch payload (GET /public/:videoId) reads the same column off the row it
 * already loaded.
 */
import { and, eq, type SQL } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioProjects, studioVideoForms, studioChapters, studioThumbnails } = schema;

/** Bounded lists: a project's engagement assets are hand-authored, so a
 *  cap this high never truncates a real project but stops a pathological
 *  one from producing an unbounded payload. */
export const PUBLIC_ENGAGEMENT_LIST_LIMIT = 200;

/** The project is publicly viewable (watch page, public rails). */
export function publicStudioProjectWhere(): SQL {
  return eq(studioProjects.isPublic, true);
}

/** Active forms of one project — inactive forms never reach a viewer. */
export function activeProjectFormsWhere(projectId: string): SQL {
  return and(eq(studioVideoForms.projectId, projectId), eq(studioVideoForms.isActive, true)) as SQL;
}

const PUBLIC_FORM_COLUMNS = {
  id: studioVideoForms.id,
  projectId: studioVideoForms.projectId,
  title: studioVideoForms.title,
  description: studioVideoForms.description,
  positionSeconds: studioVideoForms.positionSeconds,
  fields: studioVideoForms.fields,
  requireToContinue: studioVideoForms.requireToContinue,
  submitButtonText: studioVideoForms.submitButtonText,
  redirectUrl: studioVideoForms.redirectUrl,
  formType: studioVideoForms.formType,
} as const;

const PUBLIC_CHAPTER_COLUMNS = {
  id: studioChapters.id,
  projectId: studioChapters.projectId,
  title: studioChapters.title,
  startSeconds: studioChapters.startSeconds,
  thumbnailUrl: studioChapters.thumbnailUrl,
  orderIndex: studioChapters.orderIndex,
} as const;

const PUBLIC_THUMBNAIL_COLUMNS = {
  id: studioThumbnails.id,
  projectId: studioThumbnails.projectId,
  imageUrl: studioThumbnails.imageUrl,
  sourceTimeSec: studioThumbnails.sourceTimeSec,
  headlineText: studioThumbnails.headlineText,
  isSelected: studioThumbnails.isSelected,
} as const;

export interface PublicVideoFormField {
  key: string;
  label: string;
  type: "email" | "text" | "tel" | "select";
  required: boolean;
  options?: string[];
}

export interface PublicVideoForm {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  positionSeconds: number;
  fields: PublicVideoFormField[];
  requireToContinue: boolean;
  submitButtonText: string;
  redirectUrl: string | null;
  formType: string;
}

export interface PublicVideoChapter {
  id: string;
  projectId: string;
  title: string;
  startSeconds: number;
  thumbnailUrl: string | null;
  orderIndex: number;
}

export interface PublicThumbnail {
  id: string;
  projectId: string;
  imageUrl: string;
  sourceTimeSec: number | null;
  headlineText: string | null;
  isSelected: boolean;
}

export interface PublicEngagementAssets {
  forms: PublicVideoForm[];
  chapters: PublicVideoChapter[];
  thumbnails: PublicThumbnail[];
}

/** ONE PK lookup: does this project exist AND is it public? Unknown and
 *  private ids answer the same `false`. */
export async function isPublicStudioProject(db: Db, projectId: string): Promise<boolean> {
  const rows = await db
    .select({ id: studioProjects.id })
    .from(studioProjects)
    .where(and(eq(studioProjects.id, projectId), publicStudioProjectWhere()))
    .limit(1);
  return rows.length > 0;
}

/** The viewer-safe engagement assets of one project — three indexed reads
 *  (project_id) issued together. Does NOT check visibility; callers gate on
 *  `isPublicStudioProject` first. */
export async function listPublicEngagementAssets(db: Db, projectId: string): Promise<PublicEngagementAssets> {
  const [forms, chapters, thumbnails] = await Promise.all([
    db
      .select(PUBLIC_FORM_COLUMNS)
      .from(studioVideoForms)
      .where(activeProjectFormsWhere(projectId))
      .orderBy(studioVideoForms.positionSeconds)
      .limit(PUBLIC_ENGAGEMENT_LIST_LIMIT),
    db
      .select(PUBLIC_CHAPTER_COLUMNS)
      .from(studioChapters)
      .where(eq(studioChapters.projectId, projectId))
      .orderBy(studioChapters.startSeconds)
      .limit(PUBLIC_ENGAGEMENT_LIST_LIMIT),
    db
      .select(PUBLIC_THUMBNAIL_COLUMNS)
      .from(studioThumbnails)
      .where(eq(studioThumbnails.projectId, projectId))
      .limit(PUBLIC_ENGAGEMENT_LIST_LIMIT),
  ]);
  return {
    forms: forms.map((f) => ({ ...f, fields: Array.isArray(f.fields) ? (f.fields as PublicVideoFormField[]) : [] })),
    chapters,
    thumbnails,
  };
}
