/**
 * NLE API client. Wraps `/api/nle/*` so the editor calls typed methods
 * instead of stringifying URLs at every call site (one API client, one
 * place for auth/error handling, per the DRY rule).
 *
 * The Timeline JSON shape is defined in shared/timeline.ts. This client
 * does no validation — that's the editor's job. Server trusts the
 * client to send a valid Timeline; ownership is the only thing the
 * server enforces.
 */

import type { MediaSource, Timeline } from "../../../shared/timeline";

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

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function call<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok || !json.success) {
    const msg = json.error?.message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json.data as T;
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
  list(): Promise<{ projects: NleProjectMeta[] }> {
    return call("GET", "/api/nle/projects");
  },
  load(id: string): Promise<NleProject> {
    return call("GET", `/api/nle/projects/${id}`);
  },
  create(input: CreateProjectInput): Promise<NleProject> {
    return call("POST", "/api/nle/projects", input);
  },
  save(
    id: string,
    timelineSpec: Timeline,
    title?: string,
  ): Promise<{ id: string; title: string; timelineSpec: Timeline; updatedAt: string }> {
    return call("PATCH", `/api/nle/projects/${id}`, { timelineSpec, title });
  },
  delete(id: string): Promise<{ id: string }> {
    return call("DELETE", `/api/nle/projects/${id}`);
  },
  listSources(): Promise<{ sources: MediaSource[] }> {
    return call("GET", "/api/nle/sources");
  },
  /**
   * Upload a probed file to /api/nle/sources. The caller probes
   * client-side first (via lib/timeline/source-probe.ts) and passes the
   * metadata fields in the multipart form so the server doesn't need
   * ffprobe on the Worker side.
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
    const res = await fetch("/api/nle/sources", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as ApiEnvelope<{
      source: MediaSource;
      deduped: boolean;
    }>;
    if (!res.ok || !json.success || !json.data) {
      throw new Error(json.error?.message ?? `Upload failed (${res.status})`);
    }
    return json.data;
  },
  deleteSource(id: string): Promise<{ id: string }> {
    return call("DELETE", `/api/nle/sources/${id}`);
  },
};
