/**
 * Video chapters + TOC (#141) use cases behind
 * routes/studio-features/chapters.ts. Callers authorise first (may the actor
 * act on the project?); every write here invalidates the project's public
 * engagement cache, which serves chapters to viewers.
 */
import { getDb } from "../../db/index.js";
import {
  createStudioChaptersRepository,
  type StudioChapterPatch,
  type StudioChapterRow,
} from "../../repositories/studioChaptersRepository.js";
import { invalidatePublicEngagement } from "./public-engagement.js";

export interface ChapterInput {
  title: string;
  startSeconds: number;
  thumbnailUrl?: string;
}

const repo = () => createStudioChaptersRepository(getDb());

export function listProjectChapters(projectId: string): Promise<StudioChapterRow[]> {
  return repo().listByProject(projectId);
}

/** Write a project's chapter list sorted by start time (orderIndex follows
 *  that order). With `replace`, the project's existing chapters — whoever
 *  created them — are removed first. Returns the inserted rows. */
export async function saveProjectChapters(
  userId: string,
  projectId: string,
  chapters: readonly ChapterInput[],
  replace: boolean,
): Promise<StudioChapterRow[]> {
  const r = repo();
  if (replace) await r.deleteByProject(projectId);
  const sorted = [...chapters].sort((a, b) => a.startSeconds - b.startSeconds);
  const inserted = await r.insertMany(
    sorted.map((ch, i) => ({
      projectId,
      userId,
      title: ch.title,
      startSeconds: ch.startSeconds,
      thumbnailUrl: ch.thumbnailUrl ?? null,
      orderIndex: i,
    })),
  );
  invalidatePublicEngagement(projectId);
  return inserted;
}

/** Edit one chapter of `projectId`; null when the row is gone. */
export async function updateChapter(
  projectId: string,
  id: string,
  body: { title?: string; startSeconds?: number; thumbnailUrl?: string | null },
): Promise<StudioChapterRow | null> {
  const patch: StudioChapterPatch = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.startSeconds !== undefined) patch.startSeconds = body.startSeconds;
  if (body.thumbnailUrl !== undefined) patch.thumbnailUrl = body.thumbnailUrl;
  const updated = await repo().update(id, patch);
  if (updated) invalidatePublicEngagement(projectId);
  return updated;
}

/** The deleted id, or null when the row is gone. */
export async function deleteChapter(projectId: string, id: string): Promise<string | null> {
  const deleted = await repo().deleteById(id);
  if (deleted) invalidatePublicEngagement(projectId);
  return deleted;
}

/** `m:ss` (or `h:mm:ss` past an hour) — the YouTube / LinkedIn chapter stamp. */
export function formatChapterTimestamp(startSeconds: number): string {
  const total = Math.floor(startSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** The project's chapters as paste-ready YouTube description lines. */
export async function projectChaptersYoutubeText(projectId: string): Promise<{ text: string; count: number }> {
  const chapters = await repo().listByProject(projectId);
  const lines = chapters.map((ch) => `${formatChapterTimestamp(ch.startSeconds)} ${ch.title}`);
  return { text: lines.join("\n"), count: chapters.length };
}
