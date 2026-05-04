/**
 * NLE API client. Wraps `/api/nle/*` so the editor calls typed methods
 * instead of stringifying URLs at every call site (one API client, one
 * place for auth/error handling, per the DRY rule).
 *
 * Goes through the shared apiClient so requests hit api.hired.video
 * (not the frontend Pages host) and carry the Bearer token from
 * localStorage. The Worker is bound to api.hired.video/* only — relative
 * fetches against hired.video/api/* return 405 because no Pages function
 * handles them.
 *
 * The Timeline JSON shape is defined in shared/timeline.ts. This client
 * does no validation — that's the editor's job. Server trusts the
 * client to send a valid Timeline; ownership is the only thing the
 * server enforces.
 */

import type { MediaSource, Timeline } from "../../../shared/timeline";
import { apiClient } from "../api-client";

export interface NleProjectMeta {
  id: string;
  title: string;
  status: string;
  videoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NleProject extends NleProjectMeta {
  kind: "nle";
  timelineSpec: Timeline;
}

export interface CreateProjectInput {
  title?: string;
  fps?: number;
  width?: number;
  height?: number;
  timelineSpec?: Timeline;
  workspace?: { kind: "personal" } | { kind: "company"; companyId: string } | { kind: "delegated"; subjectUserId: string };
}

export interface UploadedSourceMeta {
  durationFrames: number;
  fps: number;
  width?: number | null;
  height?: number | null;
  kind: "video" | "audio" | "image";
}

export const nleApi = {
  async list(): Promise<{ projects: NleProjectMeta[] }> {
    const res = await apiClient.get<{ projects: NleProjectMeta[] }>("/api/nle/projects");
    return res.data;
  },
  async load(id: string): Promise<NleProject> {
    const res = await apiClient.get<NleProject>(`/api/nle/projects/${id}`);
    return res.data;
  },
  async create(input: CreateProjectInput): Promise<NleProject> {
    const res = await apiClient.post<NleProject>("/api/nle/projects", input);
    return res.data;
  },
  async save(
    id: string,
    timelineSpec: Timeline,
    title?: string,
  ): Promise<{ id: string; title: string; timelineSpec: Timeline; updatedAt: string }> {
    const res = await apiClient.patch<{
      id: string;
      title: string;
      timelineSpec: Timeline;
      updatedAt: string;
    }>(`/api/nle/projects/${id}`, { timelineSpec, title });
    return res.data;
  },
  async delete(id: string): Promise<{ id: string }> {
    const res = await apiClient.delete<{ id: string }>(`/api/nle/projects/${id}`);
    return res.data;
  },
  async listSources(): Promise<{ sources: MediaSource[] }> {
    const res = await apiClient.get<{ sources: MediaSource[] }>("/api/nle/sources");
    return res.data;
  },
  /**
   * Upload a probed file to /api/nle/sources. The caller probes
   * client-side first (via lib/timeline/source-probe.ts) and passes the
   * metadata fields in the multipart form so the server doesn't need
   * ffprobe on the Worker side. apiClient.post detects FormData and
   * lets the browser set the multipart Content-Type with boundary.
   */
  async uploadSource(
    file: File,
    meta: UploadedSourceMeta,
  ): Promise<{ source: MediaSource; deduped: boolean }> {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", meta.kind);
    form.append("durationFrames", String(meta.durationFrames));
    form.append("fps", String(meta.fps));
    if (meta.width != null) form.append("width", String(meta.width));
    if (meta.height != null) form.append("height", String(meta.height));
    const res = await apiClient.post<{ source: MediaSource; deduped: boolean }>(
      "/api/nle/sources",
      form,
    );
    return res.data;
  },
  async deleteSource(id: string): Promise<{ id: string }> {
    const res = await apiClient.delete<{ id: string }>(`/api/nle/sources/${id}`);
    return res.data;
  },
};
