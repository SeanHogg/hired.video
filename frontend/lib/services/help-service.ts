/**
 * Context-aware help — frontend API client.
 *
 * Thin wrapper over the /api/help endpoints. The HelpDrawer uses the
 * public reads; the SuperAdmin curation page uses the mapping mutations.
 * Shapes come from the shared contract (DRY — no re-declaration).
 */

import { apiClient, type ApiSuccessResponse } from "../api-client";
import i18n from "@/lib/i18n/i18n";
import type {
  HelpArticleCard,
  HelpContextKey,
  HelpFaqGroup,
  HelpMappingListItem,
  ResolveHelpResponse,
  SetHelpMappingInput,
} from "@shared/help";

/** The active UI locale, appended to public help reads so content comes
 *  back localized (EN fallback server-side). Centralized here so callers
 *  never thread locale through (DRY). */
function localeParam(): string {
  return `locale=${encodeURIComponent(i18n.language || "en")}`;
}

export const helpService = {
  /** Active context keys that carry any help — cached app-wide so the
   *  drawer skips the per-context resolve on pages with no mapping. */
  listActiveContexts(): Promise<ApiSuccessResponse<{ contexts: HelpContextKey[] }>> {
    return apiClient.get("/api/help/contexts") as Promise<
      ApiSuccessResponse<{ contexts: HelpContextKey[] }>
    >;
  },

  /** Curated published article set for a page context (localized). */
  resolve(context: HelpContextKey): Promise<ApiSuccessResponse<ResolveHelpResponse>> {
    return apiClient.get(
      `/api/help/resolve?context=${encodeURIComponent(context)}&${localeParam()}`,
    ) as Promise<ApiSuccessResponse<ResolveHelpResponse>>;
  },

  /** All published FAQs grouped by category, localized (DB-backed; replaced
   *  the static help-faqs.ts). Drives the Help page accordion + card feed. */
  listFaqs(): Promise<ApiSuccessResponse<{ groups: HelpFaqGroup[] }>> {
    return apiClient.get(`/api/help/faqs?${localeParam()}`) as Promise<
      ApiSuccessResponse<{ groups: HelpFaqGroup[] }>
    >;
  },

  /** All published guide articles as localized cards (DB-backed; replaced HELP_GUIDES). */
  listGuides(): Promise<ApiSuccessResponse<{ guides: HelpArticleCard[] }>> {
    return apiClient.get(`/api/help/guides?${localeParam()}`) as Promise<
      ApiSuccessResponse<{ guides: HelpArticleCard[] }>
    >;
  },

  /** Search published help content (faq|guide), localized. */
  search(q: string): Promise<ApiSuccessResponse<{ articles: HelpArticleCard[] }>> {
    return apiClient.get(`/api/help/search?q=${encodeURIComponent(q)}&${localeParam()}`) as Promise<
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
