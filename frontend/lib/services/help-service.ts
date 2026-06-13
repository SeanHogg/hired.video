/**
 * Context-aware help — frontend API client.
 *
 * Thin wrapper over the /api/help endpoints. The HelpDrawer uses the
 * public reads; the SuperAdmin curation page uses the mapping mutations.
 * Shapes come from the shared contract (DRY — no re-declaration).
 */

import { apiClient, type ApiSuccessResponse } from "../api-client";
import type {
  HelpArticleCard,
  HelpContextKey,
  HelpFaqGroup,
  HelpMappingListItem,
  ResolveHelpResponse,
  SetHelpMappingInput,
} from "@shared/help";

export const helpService = {
  /** Active context keys that carry any help — cached app-wide so the
   *  drawer skips the per-context resolve on pages with no mapping. */
  listActiveContexts(): Promise<ApiSuccessResponse<{ contexts: HelpContextKey[] }>> {
    return apiClient.get("/api/help/contexts") as Promise<
      ApiSuccessResponse<{ contexts: HelpContextKey[] }>
    >;
  },

  /** Curated published article set for a page context. */
  resolve(context: HelpContextKey): Promise<ApiSuccessResponse<ResolveHelpResponse>> {
    return apiClient.get(
      `/api/help/resolve?context=${encodeURIComponent(context)}`,
    ) as Promise<ApiSuccessResponse<ResolveHelpResponse>>;
  },

  /** All published FAQs grouped by category (DB-backed; replaced the
   *  static help-faqs.ts). Drives the Help page accordion + card feed. */
  listFaqs(): Promise<ApiSuccessResponse<{ groups: HelpFaqGroup[] }>> {
    return apiClient.get("/api/help/faqs") as Promise<
      ApiSuccessResponse<{ groups: HelpFaqGroup[] }>
    >;
  },

  /** All published guide articles as cards (DB-backed; replaced HELP_GUIDES). */
  listGuides(): Promise<ApiSuccessResponse<{ guides: HelpArticleCard[] }>> {
    return apiClient.get("/api/help/guides") as Promise<
      ApiSuccessResponse<{ guides: HelpArticleCard[] }>
    >;
  },

  /** Search published help content (faq|guide) for the drawer search box. */
  search(q: string): Promise<ApiSuccessResponse<{ articles: HelpArticleCard[] }>> {
    return apiClient.get(`/api/help/search?q=${encodeURIComponent(q)}`) as Promise<
      ApiSuccessResponse<{ articles: HelpArticleCard[] }>
    >;
  },

  // ── SuperAdmin curation ──────────────────────────────────────────────

  listMappings(): Promise<ApiSuccessResponse<{ mappings: HelpMappingListItem[] }>> {
    return apiClient.get("/api/help/mappings") as Promise<
      ApiSuccessResponse<{ mappings: HelpMappingListItem[] }>
    >;
  },

  setMapping(
    input: SetHelpMappingInput,
  ): Promise<ApiSuccessResponse<{ contextKey: HelpContextKey; articleId: string }>> {
    return apiClient.post("/api/help/mappings", input) as Promise<
      ApiSuccessResponse<{ contextKey: HelpContextKey; articleId: string }>
    >;
  },

  removeMapping(id: string): Promise<ApiSuccessResponse<{ id: string; removed: boolean }>> {
    return apiClient.delete(`/api/help/mappings/${encodeURIComponent(id)}`) as Promise<
      ApiSuccessResponse<{ id: string; removed: boolean }>
    >;
  },

  /** (Re)build semantic-search embeddings for all published help content
   *  (Phase 2 / #2004). Returns how many were indexed + whether the
   *  Vectorize binding is active. */
  reindex(): Promise<ApiSuccessResponse<{ indexed: number; semantic: boolean }>> {
    return apiClient.post("/api/help/reindex", {}) as Promise<
      ApiSuccessResponse<{ indexed: number; semantic: boolean }>
    >;
  },
};
