// Review comments + share links (gap #145) — re-exported by
// studio-features-service.ts.
import { apiClient } from "../../api-client";
import type { ReviewComment, ReviewLink } from "./engagement-types";

export async function createReviewLink(projectId: string, opts: { name?: string; expiresInDays?: number } = {}): Promise<ReviewLink> {
  const res = await apiClient.post<ReviewLink>(`/api/studio/projects/${projectId}/review-links`, opts);
  return res.data;
}

export async function listReviewLinks(projectId: string): Promise<ReviewLink[]> {
  const res = await apiClient.get<{ links: ReviewLink[] }>(`/api/studio/projects/${projectId}/review-links`);
  return res.data.links;
}

export async function deleteReviewLink(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/review-links/${id}`);
}

export async function getProjectComments(projectId: string): Promise<ReviewComment[]> {
  const res = await apiClient.get<{ comments: ReviewComment[] }>(`/api/studio/projects/${projectId}/comments`);
  return res.data.comments;
}

export async function postProjectComment(projectId: string, params: {
  body: string;
  timestampSec?: number | null;
  parentId?: string | null;
}): Promise<ReviewComment> {
  const res = await apiClient.post<ReviewComment>(`/api/studio/projects/${projectId}/comments`, params);
  return res.data;
}

export async function resolveComment(id: string, resolved: boolean): Promise<ReviewComment> {
  const res = await apiClient.patch<ReviewComment>(`/api/studio/comments/${id}`, { resolved });
  return res.data;
}

export async function deleteComment(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/comments/${id}`);
}

export async function getPublicReview(shareToken: string): Promise<{
  projectId: string;
  project: { id: string; status: string; videoId: string | null } | null;
  comments: ReviewComment[];
  linkName: string | null;
}> {
  const res = await apiClient.get<{
    projectId: string;
    project: { id: string; status: string; videoId: string | null } | null;
    comments: ReviewComment[];
    linkName: string | null;
  }>(`/api/studio/review/${shareToken}`);
  return res.data;
}

export async function postPublicReviewComment(shareToken: string, params: {
  authorName: string;
  authorEmail?: string;
  body: string;
  timestampSec?: number | null;
  parentId?: string | null;
}): Promise<ReviewComment> {
  const res = await apiClient.post<ReviewComment>(`/api/studio/review/${shareToken}/comments`, params);
  return res.data;
}
