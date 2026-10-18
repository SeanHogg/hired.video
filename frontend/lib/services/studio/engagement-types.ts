// Studio engagement + asset DTO types (stock media, versions, chapters,
// script rewrite, lead forms, review, thumbnails, hook optimizer) — split
// out of studio-features-service.ts, which re-exports everything here.

// ─── Stock Media (gap #128) ─────────────────────────────────────────────────

export type StockProvider = "unsplash" | "pexels" | "pixabay";
export type StockMediaType = "image" | "video" | "audio";

export interface StockSearchResult {
  provider: StockProvider;
  providerAssetId: string;
  mediaType: StockMediaType;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  width?: number;
  height?: number;
  durationMs?: number;
  title?: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  licence: string;
  tags?: string[];
}

export interface StockSearchResponse {
  results: StockSearchResult[];
  page: number;
  perPage: number;
}

export interface StockPickResult {
  hash: string;
  cdnUrl: string | null;
  storageKey: string;
  mediaType: StockMediaType;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  attribution: {
    provider: string;
    author: string | null;
    authorUrl: string | null;
    licence: string;
    sourceUrl: string;
  };
  /** "fresh" = first user to pick this asset; "provider-id" or "hash" = R2 hit avoided. */
  dedup: "provider-id" | "hash" | "fresh";
  storageBytesSaved: number;
}

export interface StockRecentItem {
  hash: string;
  cdnUrl: string | null;
  mediaType: StockMediaType;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  title: string | null;
  author: string | null;
  licence: string | null;
  addedAt: string;
}

// ─── Project Versions (gap #131) ────────────────────────────────────────────

export interface ProjectVersionMeta {
  id: string;
  versionNumber: number;
  label: string | null;
  isAutosave: boolean;
  createdAt: string;
}

export interface ProjectVersionFull extends ProjectVersionMeta {
  storyboard: unknown;
}

// ─── Video Chapters (gap #141) ──────────────────────────────────────────────

export interface VideoChapter {
  id: string;
  projectId: string;
  title: string;
  startSeconds: number;
  thumbnailUrl: string | null;
  orderIndex: number;
}

// ─── AI Script Rewriter (gap #144) ──────────────────────────────────────────

export type ScriptRewriteMode = "shorten" | "lengthen" | "tone" | "persona";
export type ScriptRewriteTone = "professional" | "conversational" | "enthusiastic" | "executive";
export type ScriptRewritePersona = "job-seeker" | "recruiter" | "company-promo" | "personal-brand";

export interface ScriptRewriteResult {
  mode: ScriptRewriteMode;
  sceneCount: number;
  storyboard: { scenes: Array<Record<string, unknown>> };
}

// ─── In-Video Lead Forms (gap #140) ─────────────────────────────────────────

export type VideoFormFieldType = "email" | "text" | "tel" | "select";
export interface VideoFormField {
  key: string;
  label: string;
  type: VideoFormFieldType;
  required: boolean;
  options?: string[];
}

export type VideoFormType = "lead_capture" | "knowledge_check";

/** #1505 — per-field answer entry on a knowledge-check form. Keyed by
 *  the field's `key` in the parent `VideoForm.fields[]`. */
export interface VideoFormAnswerEntry {
  correctAnswer: string;
  points: number;
  rationale?: string;
}

export type VideoFormAnswerKey = Record<string, VideoFormAnswerEntry>;

export interface VideoForm {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  positionSeconds: number;
  fields: VideoFormField[];
  requireToContinue: boolean;
  redirectUrl: string | null;
  submitButtonText: string;
  isActive: boolean;
  /** #1505 — discriminator. Null on legacy rows (treated as lead_capture). */
  formType?: VideoFormType;
  answerKey?: VideoFormAnswerKey | null;
  passingScorePct?: number | null;
  maxAttempts?: number | null;
  remediationJumpToSceneId?: string | null;
  courseLessonId?: string | null;
}

/** What a viewer of a PUBLIC project sees of a form (#1586): enough to
 *  render and submit it — never the answer key or submissions. `isActive`
 *  is only present on owner rows (the public read serves active forms only). */
export type PublicVideoForm = Partial<Pick<VideoForm, "isActive">> & Pick<
  VideoForm,
  | "id"
  | "projectId"
  | "title"
  | "description"
  | "positionSeconds"
  | "fields"
  | "requireToContinue"
  | "redirectUrl"
  | "submitButtonText"
  | "formType"
>;

// ─── Review Comments + Share Links (gap #145) ───────────────────────────────

export interface ReviewComment {
  id: string;
  projectId: string;
  parentId: string | null;
  authorUserId: string | null;
  authorName: string;
  authorEmail: string | null;
  body: string;
  timestampSec: number | null;
  resolved: boolean;
  createdAt: string;
}

export interface ReviewLink {
  id: string;
  projectId: string;
  shareToken: string;
  name: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

// ─── AI Thumbnails (gap #142) ───────────────────────────────────────────────

export interface ThumbnailCandidate {
  id: string;
  projectId: string;
  imageUrl: string;
  storageKey: string | null;
  sourceTimeSec: number | null;
  headlineText: string | null;
  score: number | null;
  isSelected: boolean;
  createdAt: string;
}

/** What a viewer of a PUBLIC project sees of a thumbnail variant (#1586). */
export type PublicThumbnail = Pick<
  ThumbnailCandidate,
  "id" | "projectId" | "imageUrl" | "sourceTimeSec" | "headlineText" | "isSelected"
>;

/** A public project's playback engagement assets — ONE read for every kind.
 *  Review comments are never public. */
export interface PublicEngagementAssets {
  forms: PublicVideoForm[];
  chapters: VideoChapter[];
  thumbnails: PublicThumbnail[];
}

// ─── AI Hook Optimizer (gap #143) ───────────────────────────────────────────

export interface HookVariant {
  label: string;
  title?: string;
  subtitle?: string;
  text?: string;
  rationale: string;
}

export interface HookOptimizerResult {
  projectId: string;
  diagnosis: string;
  variants: HookVariant[];
  retention: {
    earlyDropPct: number | null;
    topDropOffSecond: number | null;
    sampleSize: number;
  };
}
