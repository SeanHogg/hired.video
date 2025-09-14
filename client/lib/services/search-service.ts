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
  type: z.enum(["job", "resume", "people", "company"]),
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

    // Prefer the unified Dashboard endpoint; fall back to legacy Search endpoint
    const unifiedUrl = `/api/dashboard/search/public?${params.toString()}`;
    const legacyUrl = `/api/search/public?${params.toString()}`;

    // Helper schemas for legacy shape (jobs/companies paginated collections)
    const LegacyJobItemSchema = z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      creationDateTimeFormatted: z.string().optional(),
      views: z.number().optional(),
      applications: z.number().optional(),
      userId: z.string().optional(),
      atsApplyUrl: z.string().optional(),
    });

    const LegacyCompanyItemSchema = z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      industry: z.string().optional(),
      location: z.string().optional(),
      logo: z.string().optional(),
      logoUrl: z.string().optional(),
      creationDateTime: z.string().optional(),
      views: z.number().optional(),
    });

    const PaginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
      z.object({
        items: z.array(item).default([]),
        total: z.number().default(0),
        page: z.number().default(1),
        limit: z.number().default(0),
      });

    const LegacySearchSchema = z.object({
      jobs: PaginatedSchema(LegacyJobItemSchema),
      companies: PaginatedSchema(LegacyCompanyItemSchema).optional(),
    });

    try {
      // First try unified search
      const response = await apiClient.get<SearchResponse>(
        unifiedUrl,
        SearchResponseSchema,
      );
      return response.data;
    } catch (unifiedError) {
      // Fallback: try legacy public search and normalize to SearchResponse
      try {
        const legacyResponse = await apiClient.get<z.infer<typeof LegacySearchSchema>>(
          legacyUrl,
          LegacySearchSchema,
        );
        const legacy = legacyResponse.data;

        const items: SearchResultItem[] = [
          // Map jobs to unified items
          ...legacy.jobs.items.map((j) => ({
            id: j.id,
            type: "job" as const,
            title: j.title || "Untitled Job",
            summary: j.description || "",
            postedDate: j.creationDateTimeFormatted,
            createdAt: j.creationDateTimeFormatted,
            views: j.views ?? 0,
          })),
          // Map companies if present
          ...((legacy.companies?.items || []).map((c) => ({
            id: c.id,
            type: "company" as const,
            title: c.name || "Unnamed Company",
            name: c.name || "Unnamed Company",
            summary: c.description || "",
            description: c.description || "",
            industry: c.industry,
            location: c.location,
            logo: c.logo || c.logoUrl,
            createdAt: c.creationDateTime,
            views: c.views ?? 0,
          })) || []),
        ];

        const total = (legacy.jobs.total ?? 0) + (legacy.companies?.total ?? 0);
        const page = Math.max(legacy.jobs.page ?? 1, legacy.companies?.page ?? 1);
        const limit = Math.max(
          legacy.jobs.limit ?? 0,
          legacy.companies?.limit ?? 0,
        );
        const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

        const normalized: SearchResponse = {
          items,
          total,
          page,
          limit: limit || (filters.limit || 20),
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        };

        // Validate final shape to be safe
        const validated = SearchResponseSchema.parse(normalized);
        return validated;
      } catch (legacyError) {
        console.error("Failed to search public content (both unified and legacy):", {
          unifiedError,
          legacyError,
        });
        throw legacyError;
      }
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
