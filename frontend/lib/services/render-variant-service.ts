/**
 * Fitted-cut client (#2045) — /api/studio/projects/:projectId/render-variants/:variantKey.
 * A cut is a project's master render reframed / trimmed for a network whose
 * preset the master doesn't fit (shared/publish-presets `variantKeyFor`).
 */
import { apiClient } from "@/lib/api-client";

export interface RenderVariant {
  variantId: string;
  variantKey: string;
  contentRevision: string;
  /** The cut's `videos` row — what a post names as `variantVideoId`. */
  videoId: string;
  videoUrl: string | null;
}

const path = (projectId: string, variantKey: string) =>
  `/api/studio/projects/${encodeURIComponent(projectId)}/render-variants/${encodeURIComponent(variantKey)}`;

export const renderVariantService = {
  /** The stored cut for this content revision, or null (render it). */
  async find(projectId: string, variantKey: string, contentRevision: string): Promise<RenderVariant | null> {
    const res = await apiClient.get<{ variant: RenderVariant | null }>(
      `${path(projectId, variantKey)}?revision=${encodeURIComponent(contentRevision)}`,
    );
    return res.data?.variant ?? null;
  },

  /** Host a cut the browser rendered; returns it (or the one that already existed). */
  async upload(
    projectId: string,
    variantKey: string,
    input: { blob: Blob; contentRevision: string; branded: boolean; title: string },
  ): Promise<RenderVariant> {
    const form = new FormData();
    form.append("video", input.blob, `${variantKey}.mp4`);
    form.append("revision", input.contentRevision);
    form.append("branded", String(input.branded));
    form.append("title", input.title);
    const res = await apiClient.post<{ variant: RenderVariant }>(path(projectId, variantKey), form);
    return res.data.variant;
  },
};
