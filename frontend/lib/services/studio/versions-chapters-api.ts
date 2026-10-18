// Project versions (gap #131), video chapters (gap #141) and the AI script
// rewriter (gap #144) — re-exported by studio-features-service.ts.
import { apiClient } from "../../api-client";
import type {
  ProjectVersionFull,
  ProjectVersionMeta,
  ScriptRewriteMode,
  ScriptRewritePersona,
  ScriptRewriteResult,
  ScriptRewriteTone,
  VideoChapter,
} from "./engagement-types";

// ─── Project Versions (gap #131) ────────────────────────────────────────────

export async function createProjectVersion(
  projectId: string,
  storyboard: unknown,
  opts: { label?: string; isAutosave?: boolean } = {},
): Promise<ProjectVersionMeta & { prunedCount: number }> {
  const res = await apiClient.post<ProjectVersionMeta & { prunedCount: number }>(
    `/api/studio/projects/${projectId}/versions`,
    { storyboard, label: opts.label, isAutosave: opts.isAutosave ?? true },
  );
  return res.data;
}

export async function listProjectVersions(projectId: string): Promise<ProjectVersionMeta[]> {
  const res = await apiClient.get<{ versions: ProjectVersionMeta[] }>(
    `/api/studio/projects/${projectId}/versions`,
  );
  return res.data.versions;
}

export async function getProjectVersion(projectId: string, versionId: string): Promise<ProjectVersionFull> {
  const res = await apiClient.get<ProjectVersionFull>(
    `/api/studio/projects/${projectId}/versions/${versionId}`,
  );
  return res.data;
}

export async function restoreProjectVersion(projectId: string, versionId: string): Promise<{
  restoredVersion: ProjectVersionMeta;
  storyboard: unknown;
}> {
  const res = await apiClient.post<{ restoredVersion: ProjectVersionMeta; storyboard: unknown }>(
    `/api/studio/projects/${projectId}/versions/${versionId}/restore`,
    {},
  );
  return res.data;
}

// ─── Video Chapters (gap #141) ──────────────────────────────────────────────

export async function getChapters(projectId: string): Promise<VideoChapter[]> {
  const res = await apiClient.get<{ chapters: VideoChapter[] }>(
    `/api/studio/projects/${projectId}/chapters`,
  );
  return res.data.chapters;
}

export async function saveChapters(
  projectId: string,
  chapters: Array<{ title: string; startSeconds: number; thumbnailUrl?: string }>,
): Promise<VideoChapter[]> {
  const res = await apiClient.post<{ chapters: VideoChapter[] }>(
    `/api/studio/projects/${projectId}/chapters`,
    { chapters, replace: true },
  );
  return res.data.chapters;
}

export async function updateChapter(
  id: string,
  patch: { title?: string; startSeconds?: number; thumbnailUrl?: string | null },
): Promise<VideoChapter> {
  const res = await apiClient.patch<VideoChapter>(`/api/studio/chapters/${id}`, patch);
  return res.data;
}

export async function deleteChapter(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/chapters/${id}`);
}

export async function getChaptersAsYoutubeText(projectId: string): Promise<{ text: string; count: number }> {
  const res = await apiClient.get<{ text: string; count: number }>(
    `/api/studio/projects/${projectId}/chapters/youtube`,
  );
  return res.data;
}

// ─── AI Script Rewriter (gap #144) ──────────────────────────────────────────

export async function rewriteScript(params: {
  projectId: string;
  storyboard: unknown;
  mode: ScriptRewriteMode;
  targetSeconds?: number;
  tone?: ScriptRewriteTone;
  persona?: ScriptRewritePersona;
  instructions?: string;
}): Promise<ScriptRewriteResult> {
  const { projectId, ...body } = params;
  const res = await apiClient.post<ScriptRewriteResult>(
    `/api/studio/projects/${projectId}/script/rewrite`,
    body,
  );
  return res.data;
}
