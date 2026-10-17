/**
 * Unified Search Service
 * Handles searching across all content types with a single API endpoint
 */

import { z } from "zod";
import { apiClient } from "../api-client";

// ============================================================================
// SCHEMAS
// ============================================================================

/** Embedded voice clone marketplace data when item.type === "voice". */
export const VoiceListingSchema = z.object({
  id: z.string(),
  previewAudioUrl: z.string().nullish().optional(),
  priceCents: z.number().int().min(0),
  currency: z.string(),
  language: z.string().nullish().optional(),
  gender: z.string().nullish().optional(),
  accent: z.string().nullish().optional(),
  listingSlug: z.string().nullish().optional(),
  creatorId: z.string(),
  playCount: z.number().int().default(0),
  purchaseCount: z.number().int().default(0),
});
export type VoiceListing = z.infer<typeof VoiceListingSchema>;

export const SearchResultItemSchema = z.object({
  id: z.string(),
  type: z.enum(["job", "resume", "people", "company", "media", "voice", "template"]),
  voice: VoiceListingSchema.optional(),
  /** Template items — what the template makes (studio_templates media_kind /
   *  document_kind). Label via `templateKindLabelKey` (@shared/template-kinds). */
  mediaKind: z.string().optional(),
  documentKind: z.string().nullable().optional(),
  title: z.string().default("").optional(),
  name: z.string().default("").optional(),
  summary: z.string().default("").optional(),
  description: z.string().default("").optional(),
  location: z.string().default("").optional(),
  company: z.string().default("").optional(),
  industry: z.string().default("").optional(),
  employmentType: z.string().default("").optional(),
  postedDate: z.string().optional(),
  createdAt: z.string().optional(),
  views: z.number().default(0).optional(),
  avatar: z.string().default("").optional(),
  logo: z.string().default("").optional(),
  skills: z.array(z.string()).optional(),
  // Additional fields for specific types
  salary: z.string().optional(),
  experienceLevel: z.string().optional(),
  headline: z.string().optional(),
  tagline: z.string().optional(),
  size: z.string().optional(),
  founded: z.number().optional(),
  isPublic: z.boolean().optional(),
  templateName: z.string().optional(),
  updatedAt: z.string().optional(),
  isFeatured: z.boolean().default(false).optional(),
  // Company-specific fields
  activeJobCount: z.number().default(0).optional(),
  followers: z.number().default(0).optional(),
  // Job-specific fields
  applications: z.number().default(0).optional(),
});

export const SearchResponseSchema = z.object({
  items: z.array(SearchResultItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const SearchFiltersSchema = z.object({
  search: z.string().optional(),
  category: z
    .enum(["all", "jobs", "resumes", "people", "companies", "media", "voices"])
    .optional(),
  location: z.string().optional(),
  industry: z.string().optional(),
  experienceLevel: z.string().optional(),
  employmentType: z.string().optional(),
  datePosted: z.string().optional(),
  sortBy: z.enum(["recent", "featured", "top", "latest"]).optional(),
  hasMedia: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

// ============================================================================
// TYPES
// ============================================================================

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

// ============================================================================
// SERVICE
// ============================================================================

/** The one transport for GET /api/search/public. Callers with their own
 *  projection (e.g. the Resource Map) use this instead of a raw apiClient call. */
export function getPublicSearch<T>(
  params: URLSearchParams,
  schema?: z.ZodSchema<T>,
  config?: Parameters<typeof apiClient.get>[2],
) {
  return apiClient.get<T>(`/api/search/public?${params.toString()}`, schema, config);
}

export class SearchService {
  private inflight = new Map<string, Promise<SearchResponse>>();
  /**
   * Search across all content types with unified pagination
   */
  async searchPublicContent(filters: SearchFilters): Promise<SearchResponse> {
    // Build query parameters
    const params = new URLSearchParams();

    if (filters.search) params.append("search", filters.search);
    if (filters.category && filters.category !== "all")
      params.append("category", filters.category);
    if (filters.location) params.append("location", filters.location);
    if (filters.industry) params.append("industry", filters.industry);
    if (filters.experienceLevel)
      params.append("experienceLevel", filters.experienceLevel);
    if (filters.employmentType)
      params.append("employmentType", filters.employmentType);
    if (filters.datePosted) params.append("datePosted", filters.datePosted);

    params.append("page", filters.page.toString());
    params.append("limit", filters.limit.toString());

    // Use the unified search endpoint
    const unifiedUrl = `/api/search/public?${params.toString()}`;
    const key = unifiedUrl;

    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }

    const promise = (async (): Promise<SearchResponse> => {
      // Schema for the unified search response - matches UnifiedSearchResultDTO from backend
      const UnifiedSearchItemSchema = z.object({
        id: z.string(),
        type: z.string(),
        title: z.string().optional().nullish(),
        name: z.string().optional().nullish(),
        summary: z.string().optional().nullish(),
        description: z.string().optional().nullish(),
        location: z.string().optional().nullish(),
        company: z.string().optional().nullish(),
        industry: z.string().optional().nullish(),
        employmentType: z.string().optional().nullish(),
        postedDate: z.string().optional().nullish(),
        createdAt: z.string().optional().nullish(),
        updatedAt: z.string().optional().nullish(),
        views: z.number().default(0),
        avatar: z.string().optional().nullish(),
        logo: z.string().optional().nullish(),
        skills: z.string().optional().nullish(),
        salary: z.string().optional().nullish(),
        experienceLevel: z.string().optional().nullish(),
        headline: z.string().optional().nullish(),
        tagline: z.string().optional().nullish(),
        size: z.string().optional().nullish(),
        founded: z.number().optional().nullish(),
        isPublic: z.boolean().optional().nullish(),
        templateName: z.string().optional().nullish(),
        isFeatured: z.boolean().default(false),
        voice: VoiceListingSchema.optional(),
        mediaKind: z.string().optional().nullish(),
        documentKind: z.string().optional().nullish(),
      });

      const UnifiedSearchResponseSchema = z.object({
        items: z.array(UnifiedSearchItemSchema),
        total: z.number(),
        page: z.number(),
        limit: z.number(),
        totalPages: z.number(),
        hasNextPage: z.boolean(),
        hasPreviousPage: z.boolean(),
      });

      // Call the unified search endpoint
      const response = await getPublicSearch<z.infer<typeof UnifiedSearchResponseSchema>>(
        params,
        UnifiedSearchResponseSchema,
      );
      const unifiedData = response.data;

      // Transform the unified response to our SearchResponse format
      const items: SearchResultItem[] = unifiedData.items.map((item) => ({
        id: item.id,
        type: item.type as SearchResultItem["type"],
        ...(item.type === "voice" && item.voice ? { voice: item.voice } : {}),
        ...(item.type === "template" && {
          name: item.name || item.title || undefined,
          mediaKind: item.mediaKind ?? undefined,
          documentKind: item.documentKind ?? null,
        }),
        title: item.title,
        summary: item.description || item.summary || "",
        description: item.description || item.summary || "",
        location: item.location || "",
        createdAt: item.createdAt || "",
        views: item.views || 0,
        // Add type-specific properties
        ...(item.type === "job" && {
          postedDate: item.postedDate || item.createdAt,
          company: item.company,
          industry: item.industry,
          employmentType: item.employmentType,
          salary: item.salary,
          experienceLevel: item.experienceLevel,
        }),
        ...(item.type === "company" && {
          name: item.name || item.title,
          industry: item.industry,
          logo: item.logo,
          tagline: item.tagline,
          size: item.size,
          founded: item.founded,
        }),
        ...(item.type === "people" && {
          name: item.name || item.title,
          headline: item.headline,
          avatar: item.avatar,
        }),
        ...(item.type === "resume" && {
          name: item.name || item.title,
          isPublic: item.isPublic ?? true,
          templateName: item.templateName,
        }),
        ...(item.type === "media" && {
          name: item.name || item.title,
          // Media metadata is stored in different fields by the backend
          // skills field contains metaType, location contains userId, company contains referenceId, experienceLevel contains url
          metaType: item.skills ? parseInt(item.skills) : undefined,
          url: item.experienceLevel,
          userId: item.location,
          referenceId: item.company,
        }),
      }));

      const searchResponse: SearchResponse = {
        items,
        total: unifiedData.total,
        page: unifiedData.page,
        limit: unifiedData.limit,
        totalPages: unifiedData.totalPages,
        hasNextPage: unifiedData.hasNextPage,
        hasPreviousPage: unifiedData.hasPreviousPage,
      };

      return SearchResponseSchema.parse(searchResponse);
    })();

    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * Get homepage content with unified search
   */
  async getHomepageContent(limit = 4): Promise<SearchResponse> {
    return this.searchPublicContent({
      page: 1,
      limit: limit * 4, // Get more items to distribute across categories
    });
  }

  /**
   * Get content by category with pagination
   */
  async getContentByCategory(
    category: "jobs" | "resumes" | "people" | "companies" | "media",
    page = 1,
    limit = 20,
  ): Promise<SearchResponse> {
    return this.searchPublicContent({
      category,
      page,
      limit,
    });
  }
}

// Export singleton instance
export const searchService = new SearchService();
