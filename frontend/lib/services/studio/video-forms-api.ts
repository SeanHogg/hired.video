// In-video lead / knowledge-check forms (gap #140) — re-exported by
// studio-features-service.ts.
import { apiClient } from "../../api-client";
import type { VideoForm } from "./engagement-types";

export async function listVideoForms(projectId: string): Promise<VideoForm[]> {
  const res = await apiClient.get<{ forms: VideoForm[] }>(`/api/studio/projects/${projectId}/forms`);
  return res.data.forms;
}

export async function createVideoForm(projectId: string, form: Omit<VideoForm, "id" | "projectId" | "isActive">): Promise<VideoForm> {
  const res = await apiClient.post<VideoForm>(`/api/studio/projects/${projectId}/forms`, form);
  return res.data;
}

/** GET /api/studio/forms/:id — owner read, answer key included. */
export async function getVideoForm(id: string): Promise<VideoForm> {
  const res = await apiClient.get<VideoForm>(`/api/studio/forms/${id}`);
  return res.data;
}

export async function updateVideoForm(id: string, patch: Partial<Omit<VideoForm, "id" | "projectId" | "fields">>): Promise<VideoForm> {
  const res = await apiClient.patch<VideoForm>(`/api/studio/forms/${id}`, patch);
  return res.data;
}

export async function deleteVideoForm(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/forms/${id}`);
}

export async function submitVideoForm(formId: string, params: {
  answers: Record<string, string>;
  timestampSec?: number;
  videoId?: string;
}): Promise<{ id: string; redirectUrl: string | null }> {
  const res = await apiClient.post<{ id: string; redirectUrl: string | null }>(
    `/api/studio/forms/${formId}/submit`,
    params,
  );
  return res.data;
}

export async function getVideoFormSubmissions(formId: string): Promise<{
  submissions: Array<{
    id: string;
    viewerEmail: string | null;
    viewerName: string | null;
    answers: Record<string, string>;
    timestampSec: number | null;
    createdAt: string;
  }>;
  total: number;
}> {
  const res = await apiClient.get<{
    submissions: Array<{
      id: string;
      viewerEmail: string | null;
      viewerName: string | null;
      answers: Record<string, string>;
      timestampSec: number | null;
      createdAt: string;
    }>;
    total: number;
  }>(`/api/studio/forms/${formId}/submissions`);
  return res.data;
}
