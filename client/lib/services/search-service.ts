/**
 * Unified Search Service
 * Handles searching across all content types with a single API endpoint
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { userService, type PaginatedPublicUsers } from "./user-service";
import { resumeService, type PaginatedResumes } from "./resume-service";

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

    // Use the working public search endpoint (legacy) and normalize to unified SearchResponse
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

    // Legacy public search and normalize to unified SearchResponse
    const legacyResponse = await apiClient.get<z.infer<typeof LegacySearchSchema>>(
      legacyUrl,
      LegacySearchSchema,
    );
    const legacy = legacyResponse.data;

    // Pull additional people and resumes to enrich homepage content
    const [publicUsers, publicResumes] = await Promise.all([
      // People
      userService
        .getPublicUsers({ page: filters.page, limit: filters.limit })
        .catch(() => ({ items: [], total: 0 } as PaginatedPublicUsers)),
      // Resumes
      resumeService
        .getPublicResumes(filters.page, filters.limit)
        .catch(() => ({ items: [], total: 0 } as PaginatedResumes)),
    ]);

    const items: SearchResultItem[] = [
      // Jobs
      ...legacy.jobs.items.map((j) => ({
        id: j.id,
        type: "job" as const,
        title: j.title || "Untitled Job",
        summary: j.description || "",
        postedDate: j.creationDateTimeFormatted,
        createdAt: j.creationDateTimeFormatted,
        views: j.views ?? 0,
      })),
      // Companies
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
      // People (Public Users)
      ...((publicUsers.items || []).map((u) => ({
        id: (u as any).id || "",
        type: "people" as const,
        title: (u as any).fullName || "",
        name: (u as any).fullName || "",
        headline: (u as any).headline || undefined,
        summary: (u as any).headline || undefined,
        avatar: (u as any).avatar || undefined,
        location: (u as any).location || undefined,
        views: (u as any).profileViews || 0,
        createdAt: (u as any).createdAt || undefined,
      })) as SearchResultItem[]),
      // Resumes
      ...((publicResumes.items || []).map((r) => ({
        id: (r as any).id || "",
        type: "resume" as const,
        title: (r as any).title || (r as any).name || "Untitled Resume",
        name: (r as any).name || (r as any).title || "Untitled Resume",
        summary: (r as any).summary || (r as any).description || "",
        location: (r as any).location || undefined,
        createdAt:
          (r as any).creationDateTimeFormatted || (r as any).createdAt || undefined,
        views: (r as any).views || 0,
        isPublic: (r as any).isPublic ?? true,
      })) as SearchResultItem[]),
    ];

    const jobsTotal = legacy.jobs.total ?? 0;
    const companiesTotal = legacy.companies?.total ?? 0;
    const peopleTotal = (publicUsers.total as number) || 0;
    // PaginatedResumes may not include total; fall back to length
    const resumesTotal =
      (publicResumes.total as number) || (publicResumes.items?.length ?? 0);

    const total = jobsTotal + companiesTotal + peopleTotal + resumesTotal;
    const page = Math.max(
      legacy.jobs.page ?? 1,
      legacy.companies?.page ?? 1,
      (publicUsers.page as number) || 1,
      (publicResumes.page as number) || 1,
    );
    const limit = Math.max(
      legacy.jobs.limit ?? 0,
      legacy.companies?.limit ?? 0,
      (publicUsers.limit as number) || 0,
      (publicResumes.limit as number) || 0,
      filters.limit || 0,
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

    return SearchResponseSchema.parse(normalized);
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
