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

/**
 * Server-shaped media source, with bin metadata. The Timeline JSON spec
 * (shared/timeline.ts) deliberately doesn't carry tags / folder — those
 * are editor-only concerns. The bin panel reads this shape; the render
 * facade operates on plain MediaSource.
 */
export interface NleMediaSourceWithBin extends MediaSource {
  binFolder: string | null;
  tags: string[];
}

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
  async listSources(): Promise<{ sources: NleMediaSourceWithBin[] }> {
    const res = await apiClient.get<{ sources: NleMediaSourceWithBin[] }>("/api/nle/sources");
    return res.data;
  },
  async listSourceTags(): Promise<{ tags: string[] }> {
    const res = await apiClient.get<{ tags: string[] }>("/api/nle/sources/tags");
    return res.data;
  },
  /**
   * Patch bin metadata on a source. Tags, when supplied, replace the
   * existing set atomically. Pass `url` to relink an offline source
   * (closes #346); pass `binFolder: null` to move it to root.
   */
  async patchSource(
    id: string,
    patch: { binFolder?: string | null; tags?: string[]; url?: string; filename?: string },
  ): Promise<{ source: NleMediaSourceWithBin }> {
    const res = await apiClient.patch<{ source: NleMediaSourceWithBin }>(
      `/api/nle/sources/${id}`,
      patch,
    );
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
  /**
   * Upload a proxy for an existing source. The caller produces the
   * downscaled mp4 via `frontend/lib/timeline/proxy-generator.ts` and
   * hands the bytes here; the server stores them and patches the
   * source's `proxyUrl`. Editor preview paths that opt into proxies
   * (RendererState.useProxies) pick the new URL up on next preload.
   */
  async uploadProxy(
    sourceId: string,
    proxy: Blob,
  ): Promise<{ source: NleMediaSourceWithBin }> {
    const form = new FormData();
    form.append("file", proxy, `${sourceId}-proxy.mp4`);
    const res = await apiClient.post<{ source: NleMediaSourceWithBin }>(
      `/api/nle/sources/${sourceId}/proxy`,
      form,
    );
    return res.data;
  },
  /**
   * Rename / move a bin folder (#358). Bulk-updates every source whose
   * `binFolder` equals `from` or starts with `from/`. Pass `to=""` to
   * flatten the subtree to root.
   */
  async renameFolder(
    from: string,
    to: string,
  ): Promise<{ updatedCount: number; from: string; to: string | null }> {
    const res = await apiClient.post<{
      updatedCount: number;
      from: string;
      to: string | null;
    }>("/api/nle/sources/folders/rename", { from, to });
    return res.data;
  },
};
