// Page → video embed registry (#1860) — part of the `studioService` facade
// in studio-service.ts.
import { apiClient } from "../../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import type { PageEmbedListItem, ResolvedPageEmbed } from "./video-schemas";

export const studioPageEmbedsApi = {

  /**
   * Resolve the video a SuperAdmin published to a marketing-page route, or
   * null. PUBLIC — the shared <MarketingPageVideo> component calls this on
   * every page for anonymous visitors too.
   */
  async resolvePageEmbed(
    pathname: string,
  ): Promise<ApiSuccessResponse<{ embed: ResolvedPageEmbed | null }>> {
    return apiClient.get(
      `/api/studio/page-embeds/resolve?path=${encodeURIComponent(pathname)}`,
    ) as Promise<ApiSuccessResponse<{ embed: ResolvedPageEmbed | null }>>;
  },

  /** PUBLIC: the set of routes that currently carry an embed. Fetched once
   *  + cached so <MarketingPageVideo> only runs the full resolve on a hit
   *  (#1863). */
  async listActivePageEmbedPaths(): Promise<ApiSuccessResponse<{ paths: string[] }>> {
    return apiClient.get("/api/studio/page-embeds/paths") as Promise<
      ApiSuccessResponse<{ paths: string[] }>
    >;
  },

  /** SuperAdmin: publish a Studio project onto a page route (upsert). */
  async setPageEmbed(args: {
    pathname: string;
    projectId: string;
    placement?: "hero" | "inline";
  }): Promise<ApiSuccessResponse<{ pathname: string; placement: string }>> {
    return apiClient.post("/api/studio/page-embeds", args) as Promise<
      ApiSuccessResponse<{ pathname: string; placement: string }>
    >;
  },

  /** SuperAdmin: unpublish a page route's video. */
  async removePageEmbed(
    pathname: string,
  ): Promise<ApiSuccessResponse<{ pathname: string; removed: boolean }>> {
    return apiClient.delete(
      `/api/studio/page-embeds?path=${encodeURIComponent(pathname)}`,
    ) as Promise<ApiSuccessResponse<{ pathname: string; removed: boolean }>>;
  },

  /** SuperAdmin: list every active page→video mapping. */
  async listPageEmbeds(): Promise<ApiSuccessResponse<{ embeds: PageEmbedListItem[] }>> {
    return apiClient.get("/api/studio/page-embeds") as Promise<
      ApiSuccessResponse<{ embeds: PageEmbedListItem[] }>
    >;
  },
};
