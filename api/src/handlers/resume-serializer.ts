/**
 * Resume serializers — pure row → wire-shape transforms.
 *
 * This file is now strictly pure:
 *   • `rowToResume` / `rowToResumeSummary` map DB rows to the API shape.
 *   • `PRIVACY_TO_LEVEL` / `LEVEL_TO_PRIVACY` translate between the
 *     column int and the wire string.
 *   • `EMPTY_VIEWER_EXTRAS` — small shared constant.
 *
 * Everything that used to live here and talked to Drizzle has moved:
 *   • `computeViewerExtras` / `computeViewerExtrasBatch` / `recordResumeView`
 *     → read through `ResumeRepository` from a service helper.
 *   • `refreshDiffPercentFor` / `persistSentimentScore`
 *     → `services/resume-diff-service.ts`, which calls the repository.
 *   • `normalizeContent` / `healAndValidateContent` / `preserveMetaData`
 *     → `services/resume-content-service.ts`.
 *
 * The layering rule: routes call services, services call the repository.
 * Nothing in this file should ever call a DB client.
 */

import type {
  Resume,
  ResumeSummary,
  ResumePrivacy,
} from "../../../shared/resume.js";
import { readCoverLetter } from "../../../shared/cover-letter.js";
import { schema } from "../db/index.js";
import { normalizeContent } from "../services/resume/content.js";

const { resumeInformation: resumes } = schema;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Privacy string → stored int. Ordered by increasing restriction. */
export const PRIVACY_TO_LEVEL: Record<string, number> = {
  public: 0,
  recruiter_only: 1,
  connections: 2,
  private: 10,
  draft: 10,
};

/** Reverse map used by the serializer to project stored ints back to the
 *  canonical string. Keep in lockstep with PRIVACY_TO_LEVEL — any row
 *  whose privacyLevel isn't in this map serializes as "private" (the
 *  safest default). */
export const LEVEL_TO_PRIVACY: Record<number, string> = {
  0: "public",
  1: "recruiter_only",
  2: "connections",
  10: "private",
};

// ---------------------------------------------------------------------------
// Viewer extras — what the serializer can't compute on its own
// ---------------------------------------------------------------------------

/** Per-viewer context that the serializer needs but can't compute on its
 *  own. Produced by services that call `ResumeRepository.watchedIdsForViewer`
 *  + `.countViewsBulk`. */
export interface ResumeViewerExtras {
  isOwner: boolean;
  isWatched: boolean;
  viewCount: number;
}

export const EMPTY_VIEWER_EXTRAS: ResumeViewerExtras = {
  isOwner: false,
  isWatched: false,
  viewCount: 0,
};

/** For a resume the caller just created: owner by construction, no
 *  watches or views yet. Avoids a round-trip to the repository on
 *  insert paths. */
export function freshOwnerExtras(): ResumeViewerExtras {
  return { isOwner: true, isWatched: false, viewCount: 0 };
}

// ---------------------------------------------------------------------------
// Serializers — pure, no DB, no env
// ---------------------------------------------------------------------------

/** Public-safe summary row used by `/api/users/:id/resumes`. Strict
 *  superset of the legacy projection: keeps `id/title/status/createdAt/
 *  updatedAt/privacyLevel` (do not remove — older clients still read
 *  them) AND adds `slug/privacy/isMaster/isActive/parentId` so the
 *  profile view can locate the master resume.
 *
 *  Returned shape is the contract; the unit tests pin every field. */
export interface PublicResumeSummary {
  id: string;
  title: string;
  /** Falls back to id when no slug is set, so consumers can always build
   *  a /resumes/:slug URL without a separate null-check. */
  slug: string;
  status: string;
  privacyLevel: number;
  /** Canonical wire form ("public" | "recruiter_only" | ...). */
  privacy: string;
  isMaster: boolean;
  isActive: boolean;
  parentId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Project a single resume row to the public-safe summary shape used by
 *  `/api/users/:id/resumes`. Drops `content`, but exposes everything
 *  the profile UI needs to find and link to the master resume. */
export function rowToPublicResumeSummary(
  row: typeof resumes.$inferSelect,
): PublicResumeSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? row.id,
    status: row.status,
    privacyLevel: row.privacyLevel,
    privacy: LEVEL_TO_PRIVACY[row.privacyLevel] ?? "private",
    isMaster: !!row.isMaster,
    isActive: !!row.isActive,
    parentId: row.parentId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Filter+project a resume list for the `/api/users/:id/resumes`
 *  endpoint. Owners see everything; visitors see only public resumes
 *  (privacyLevel === 0). All output rows include the fields needed by
 *  the profile page to find and load the master resume. */
export function projectUserResumes(
  rows: Array<typeof resumes.$inferSelect>,
  opts: { isOwner: boolean },
): PublicResumeSummary[] {
  const visible = opts.isOwner ? rows : rows.filter((r) => r.privacyLevel <= 0);
  return visible.map(rowToPublicResumeSummary);
}

/** Map `resume_information` row + viewer extras → canonical Resume wire
 *  shape. This is the function whose output must parse against
 *  `ResumeSchema` in shared/resume.ts (resume-contract.test.ts enforces). */
export function rowToResume(
  row: typeof resumes.$inferSelect,
  extras: ResumeViewerExtras,
): Resume {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    slug: row.slug ?? null,
    content: normalizeContent(row.content) as Resume["content"],
    status: (row.status as Resume["status"]) ?? "draft",
    privacy: (LEVEL_TO_PRIVACY[row.privacyLevel] ?? "private") as ResumePrivacy,
    isMaster: row.isMaster,
    isActive: row.isActive,
    parentId: row.parentId ?? null,
    diffPercent: row.diffPercent ?? null,
    templateId: row.templateId ?? null,
    metaResumeId: row.metaResumeId ?? null,
    sentimentScore: row.sentimentScore ?? null,
    scores: (row.scores as Resume["scores"]) ?? null,
    viewCount: extras.viewCount,
    isOwner: extras.isOwner,
    isWatched: extras.isWatched,
    archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/** Map `resume_information` row + viewer extras → ResumeSummary wire shape.
 *  The summary omits the full content blob and surfaces the two card-UI
 *  fields (`headline`, `summary`) so list endpoints stay cheap. */
export function rowToResumeSummary(
  row: typeof resumes.$inferSelect,
  extras: ResumeViewerExtras,
): ResumeSummary {
  const content = (row.content ?? {}) as Record<string, unknown>;
  // Tolerant of legacy PascalCase rows that the migration didn't rewrite.
  const basics = ((content.basics ?? content.Basics) ?? {}) as Record<string, unknown>;
  const headline = String(basics.label ?? (basics as any).Label ?? "");
  const summary = String(basics.summary ?? (basics as any).Summary ?? "");

  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    slug: row.slug ?? null,
    status: (row.status as ResumeSummary["status"]) ?? "draft",
    privacy: (LEVEL_TO_PRIVACY[row.privacyLevel] ?? "private") as ResumePrivacy,
    isMaster: row.isMaster,
    isActive: row.isActive,
    parentId: row.parentId ?? null,
    diffPercent: row.diffPercent ?? null,
    templateId: row.templateId ?? null,
    metaResumeId: row.metaResumeId ?? null,
    sentimentScore: row.sentimentScore ?? null,
    scores: (row.scores as Resume["scores"]) ?? null,
    viewCount: extras.viewCount,
    isOwner: extras.isOwner,
    isWatched: extras.isWatched,
    archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    headline,
    summary,
    hasCoverLetter: readCoverLetter(content as Resume["content"]) !== null,
  };
}
