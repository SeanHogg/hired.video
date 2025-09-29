/**
 * Unified Search Service
 * Handles searching across all content types with a single API endpoint
 */

import { z } from "zod";
import { apiClient } from "../api-client";

// ============================================================================
// SCHEMAS
// ============================================================================

export const SearchResultItemSchema = z.object({
  id: z.string(),
  type: z.enum(["job", "resume", "people", "company", "media"]),
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
  isPublic: z.boolean().optional(),
  templateName: z.string().optional(),
  updatedAt: z.string().optional(),
  isFeatured: z.boolean().default(false).optional(),
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
    .enum(["all", "jobs", "resumes", "people", "companies"])
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

export class SearchService {
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

    // Use the new unified search endpoint
    const unifiedUrl = `/api/Dashboard/search/public?${params.toString()}`;

    // Schema for the unified search response
    const UnifiedSearchItemSchema = z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      description: z.string().optional(),
      location: z.string().optional(),
      createdAt: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
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
    const response = await apiClient.get<z.infer<typeof UnifiedSearchResponseSchema>>(
      unifiedUrl,
      UnifiedSearchResponseSchema,
    );
    const unifiedData = response.data;

    // Transform the unified response to our SearchResponse format
    const items: SearchResultItem[] = unifiedData.items.map((item) => ({
      id: item.id,
      type: item.type as "job" | "company" | "people" | "resume" | "media",
      title: item.title,
      summary: item.description || "",
      description: item.description || "",
      location: item.location || "",
      createdAt: item.createdAt || "",
      views: (item.metadata?.views as number) || 0,
      // Add type-specific properties based on metadata
      ...(item.type === "job" && {
        postedDate: item.createdAt,
        applications: item.metadata?.applications as number,
        userId: item.metadata?.userId as string,
        atsApplyUrl: item.metadata?.atsApplyUrl as string,
      }),
      ...(item.type === "company" && {
        name: item.title,
        industry: item.metadata?.industry as string,
        logo: (item.metadata?.logo || item.metadata?.logoUrl) as string,
      }),
      ...(item.type === "people" && {
        name: item.title,
        headline: item.metadata?.headline as string,
        avatar: (item.metadata?.avatar || item.metadata?.profilePictureUrl) as string,
        openToWork: item.metadata?.openToWork as boolean,
        slug: item.metadata?.slug as string,
      }),
      ...(item.type === "resume" && {
        name: item.title,
        slug: item.metadata?.slug as string,
        userId: item.metadata?.userId as string,
        isPublic: (item.metadata?.isPublic ?? true) as boolean,
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
    category: "jobs" | "resumes" | "people" | "companies",
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
