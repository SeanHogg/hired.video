/**
 * Context-aware help — frontend API client (v2, meta only).
 *
 * The API serves mapping + search META (slugs), never content. Help content
 * comes from the bundled catalog in `lib/help/content.ts`. The drawer/admin
 * join the slugs these calls return to that catalog.
 */

import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import type {
  HelpContextKey,
  HelpIndexItem,
  HelpMappingListItem,
  HelpSearchResponse,
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

  /** Ordered content slugs curated for a page context. */
  resolve(context: HelpContextKey): Promise<ApiSuccessResponse<ResolveHelpResponse>> {
    return apiClient.get(
      `/api/help/resolve?context=${encodeURIComponent(context)}`,
    ) as Promise<ApiSuccessResponse<ResolveHelpResponse>>;
  },

  /** Semantic-search slug hits (Vectorize). `semantic:false` → the caller
   *  should use its local keyword index instead. */
  search(q: string): Promise<ApiSuccessResponse<HelpSearchResponse>> {
    return apiClient.get(`/api/help/search?q=${encodeURIComponent(q)}`) as Promise<
      ApiSuccessResponse<HelpSearchResponse>
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
  ): Promise<ApiSuccessResponse<{ contextKey: HelpContextKey; slug: string }>> {
    return apiClient.post("/api/help/mappings", input) as Promise<
      ApiSuccessResponse<{ contextKey: HelpContextKey; slug: string }>
    >;
  },

  removeMapping(id: string): Promise<ApiSuccessResponse<{ id: string; removed: boolean }>> {
    return apiClient.delete(`/api/help/mappings/${encodeURIComponent(id)}`) as Promise<
      ApiSuccessResponse<{ id: string; removed: boolean }>
    >;
  },

  /** (Re)build semantic-search vectors from the bundled catalog (the caller
   *  passes `helpIndexItems()`). Returns count + whether Vectorize is live. */
  reindex(
    items: HelpIndexItem[],
  ): Promise<ApiSuccessResponse<{ indexed: number; semantic: boolean }>> {
    return apiClient.post("/api/help/reindex", { items }) as Promise<
      ApiSuccessResponse<{ indexed: number; semantic: boolean }>
    >;
  },
};
