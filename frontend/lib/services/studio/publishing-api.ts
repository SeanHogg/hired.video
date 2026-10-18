// Social publishing + publication records — part of the `studioService`
// facade in studio-service.ts.
import { z } from "zod";
import { apiClient } from "../../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import type { VideoPublishPlatform } from "@shared/social-platforms";
import type { TikTokCreatorInfo, TikTokPostSettings } from "@shared/tiktok-post-settings";
import { StudioPublicationSchema, type StudioPublication } from "./project-schemas";

export const studioPublishingApi = {
  /**
   * Post the project's rendered video to the caller's own YouTube channel,
   * TikTok, Instagram, X, Facebook Page or LinkedIn account (one route for
   * every network). The project must already be rendered; the editor calls
   * this after ensureRendered(). The server checks the plan's channel cap and
   * records the publication. Throws with `context.serverCode` =
   * "SOCIAL_NOT_CONNECTED" (connect again) or "PRO_REQUIRED" (cap reached).
   */
  async publishToSocial(
    projectId: string,
    platform: VideoPublishPlatform,
    request: {
      title: string;
      caption: string;
      tiktok?: TikTokPostSettings;
      youtube?: { privacy: "public" | "private" | "unlisted"; tags?: string[]; shorts?: boolean };
      /** A fitted cut of this project to post instead of the master (#2045). */
      variantVideoId?: string;
    },
  ): Promise<ApiSuccessResponse<{ publication: StudioPublication }>> {
    return apiClient.post(
      `/api/studio/projects/${projectId}/publish/social/${platform}`,
      request,
      z.object({ publication: StudioPublicationSchema }),
    );
  },

  /**
   * The caller's TikTok account state for the Post dock's TikTok settings
   * (read fresh each time the form opens — TikTok's sharing guidelines).
   * Throws with `context.serverCode` = "SOCIAL_NOT_CONNECTED" when the
   * connection is gone.
   */
  async getTikTokCreatorInfo(): Promise<TikTokCreatorInfo> {
    const res = (await apiClient.get("/api/studio/social/tiktok/creator-info")) as ApiSuccessResponse<{
      creator: TikTokCreatorInfo;
    }>;
    return res.data.creator;
  },

  /**
   * List the destinations a project has been published to (one per
   * destination, with view URLs). Drives the editor's "Published to" surfaces.
   *
   * When the project has multiple cuts (variants) published to the same
   * destination, returns only the latest one per network — the UI shows
   * one chip per network, not per cut.
   */
  async getPublications(
    projectId: string,
  ): Promise<ApiSuccessResponse<StudioPublication[]>> {
    const res = await apiClient.get(
      `/api/studio/projects/${projectId}/publications`,
      z.array(StudioPublicationSchema),
    );
    // Deduplicate by destination, keeping the latest (by publishedAt)
    const deduped = deduplicatePublications(res.data);
    return { ...res, data: deduped };
  },
};

/**
 * Deduplicate publications by destination, keeping the latest one (by publishedAt).
 * Used when the UI needs one chip per network rather than one per variant.
 */
export function deduplicatePublications(
  publications: StudioPublication[],
): StudioPublication[] {
  const byDestination = new Map<string, StudioPublication>();
  for (const pub of publications) {
    const existing = byDestination.get(pub.destination);
    if (!existing) {
      byDestination.set(pub.destination, pub);
      continue;
    }
    // Keep the one with the latest publishedAt
    const existingTime = new Date(existing.publishedAt).getTime();
    const newTime = new Date(pub.publishedAt).getTime();
    if (newTime > existingTime) {
      byDestination.set(pub.destination, pub);
    }
  }
  return Array.from(byDestination.values());
}
