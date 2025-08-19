/**
 * Dashboard Service
 * Handles homepage dashboard data and statistics
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import {
  searchService,
  type SearchResponse,
  type SearchFilters,
} from "./search-service";

// ============================================================================
// SCHEMAS
// ============================================================================

export const DashboardStatsSchema = z.object({
  totalJobs: z.number(),
  totalCompanies: z.number(),
  totalUsers: z.number(),
  totalResumes: z.number(),
  totalViews: z.number(),
  recentJobs: z.number(),
  recentCompanies: z.number(),
  recentUsers: z.number(),
  recentResumes: z.number(),
});

export const HomepageContentSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      company: z.string(),
      location: z.string(),
      employmentType: z.string(),
      postedDate: z.string(),
      views: z.number().optional(),
    }),
  ),
  companies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      industry: z.string(),
      location: z.string(),
      logo: z.string().optional(),
      views: z.number().optional(),
    }),
  ),
  users: z.array(
    z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      headline: z.string(),
      location: z.string(),
      avatar: z.string().optional(),
      views: z.number().optional(),
    }),
  ),
  resumes: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      name: z.string().optional(),
      summary: z.string().optional(),
      description: z.string().optional(),
      skills: z.array(z.string()).optional(),
      location: z.string().optional(),
      views: z.number().optional(),
      userId: z.string().optional(),
      templateName: z.string().optional(),
      isPublic: z.boolean().optional(),
      createdAt: z.string().optional(),
    }),
  ),
});

// ============================================================================
// TYPES
// ============================================================================

export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type HomepageContent = z.infer<typeof HomepageContentSchema>;

export interface HomepageFilters {
  search?: string;
  category?: "all" | "jobs" | "companies" | "people" | "resumes";
  location?: string;
  limit?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class DashboardService {
  /**
   * Get homepage content with filtering using unified search
   */
  async getHomepageContent(
    filters: HomepageFilters = {},
  ): Promise<HomepageContent> {
    const limit = filters.limit || 4;

    try {
      // Use unified search service
      const searchResponse = await searchService.searchPublicContent({
        search: filters.search,
        category: filters.category === "all" ? undefined : filters.category,
        location: filters.location,
        page: 1,
        limit: limit * 4, // Get more items to distribute across categories
      });

      // Group items by type
      const jobs = searchResponse.items.filter((item) => item.type === "job");
      const companies = searchResponse.items.filter(
        (item) => item.type === "company",
      );
      const users = searchResponse.items.filter(
        (item) => item.type === "people",
      );
      const resumes = searchResponse.items.filter(
        (item) => item.type === "resume",
      );

      return {
        jobs: jobs.slice(0, limit).map((job) => ({
          id: job.id,
          title: job.title,
          company: job.company || "Unknown Company",
          location: job.location || "Unknown Location",
          employmentType: job.employmentType || "Full-time",
          postedDate:
            job.postedDate || job.createdAt || new Date().toISOString(),
          views: job.views || 0,
        })),
        companies: companies.slice(0, limit).map((company) => ({
          id: company.id,
          name: company.name || company.title,
          description:
            company.description ||
            company.summary ||
            "No description available",
          industry: company.industry || "Technology",
          location: company.location || "Unknown location",
          logo: company.logo,
          views: company.views || 0,
        })),
        users: users.slice(0, limit).map((user) => ({
          id: user.id,
          firstName: user.name?.split(" ")[0] || "Unknown",
          lastName: user.name?.split(" ").slice(1).join(" ") || "",
          headline: user.headline || user.summary || "Professional",
          location: user.location || "Unknown location",
          avatar: user.avatar,
          views: user.views || 0,
        })),
        resumes: resumes.slice(0, limit).map((resume) => ({
          id: resume.id,
          title: resume.title || resume.name || "Untitled Resume",
          name: resume.name || resume.title || "Untitled Resume",
          summary:
            resume.summary || resume.description || "No summary available",
          description:
            resume.description || resume.summary || "No description available",
          skills: resume.skills || [],
          location: resume.location || "Unknown location",
          views: resume.views || 0,
          userId: resume.id, // TODO: Get actual owner ID
          templateName: resume.templateName,
          isPublic: resume.isPublic,
          createdAt: resume.createdAt,
        })),
      };
    } catch (error) {
      console.error("Failed to get homepage content:", error);
      throw error;
    }
  }

  /**
   * Search across all content types using unified search
   */
  async searchContent(
    query: string,
    category: string = "all",
    limit: number = 20,
  ): Promise<SearchResponse> {
    return searchService.searchPublicContent({
      page: 1,
      search: query,
      category: category as "all" | "jobs" | "resumes" | "people" | "companies",
      limit,
    });
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const dashboardService = new DashboardService();
