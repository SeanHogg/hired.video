/**
 * Company Service
 * Handles company-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";

// ============================================================================
// SCHEMAS
// ============================================================================

// Metadata item returned by GET /api/Companies/public
export const CompanyMetadataSchema = z.object({
  id: nullableString(),
  slug: nullableString(),
  name: nullableString(),
  logo: nullableString(),
  tagline: nullableString(),
  description: nullableString(),
  website: nullableString(),
  industry: nullableString(),
  size: nullableString(),
  location: nullableString(),
  status: z
    .union([z.string(), z.number()])
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  visibility: z
    .union([z.string(), z.number()])
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  createdAt: nullableString(),
  updatedAt: nullableString(),
  views: nullableNumber(),
  followers: nullableNumber(),
  jobCount: nullableNumber(),
  activeJobCount: nullableNumber(),
  userId: nullableString(),
  onboardingProgress: nullableNumber(),
});

export const CompanyFiltersSchema = z.object({
  search: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  location: z.string().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
});

export const PaginatedCompaniesSchema = z.object({
  items: z.array(CompanyMetadataSchema).nullable(),
  total: z.number().nullable(),
  page: z.number().nullable(),
  limit: z.number().nullable(),
  totalPages: z.number().nullable().optional(),
  hasNextPage: z.boolean().nullable().optional(),
  hasPreviousPage: z.boolean().nullable().optional(),
});

// ============================================================================
// TYPES
// ============================================================================

export type Company = z.infer<typeof CompanyMetadataSchema>;
export type CompanyFilters = z.infer<typeof CompanyFiltersSchema>;
export type PaginatedCompanies = z.infer<typeof PaginatedCompaniesSchema>;

// ============================================================================
// COMPANY SERVICE CLASS
// ============================================================================

export class CompanyService {
  /**
   * Get all public companies with optional filters
   */
  async getPublicCompanies(
    filters?: CompanyFilters,
  ): Promise<PaginatedCompanies> {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, v.toString()));
          } else {
            params.append(key, value.toString());
          }
        }
      });
    }

    const endpoint = `/api/Companies/public${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await apiClient.get<PaginatedCompanies>(
      endpoint,
      PaginatedCompaniesSchema,
    );

    return response.data;
  }

  /**
   * Get specific company by ID
   */
  async getCompanyById(id: string): Promise<Company> {
    const response = await apiClient.get<Company>(
      `/api/Companies/${id}`,
      CompanyMetadataSchema,
    );
    return response.data;
  }

  /**
   * Get jobs for a specific company
   */
  async getCompanyJobs(id: string, page = 1, limit = 20): Promise<any[]> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    const response = await apiClient.get<any[]>(
      `/api/Companies/${id}/jobs?${params.toString()}`,
      z.array(z.any()), // We'll use the Job schema from job-service when available
    );

    return response.data;
  }

  /**
   * Follow a company
   */
  async followCompany(id: string): Promise<void> {
    await apiClient.post(`/api/Companies/${id}/follow`);
  }

  /**
   * Unfollow a company
   */
  async unfollowCompany(id: string): Promise<void> {
    await apiClient.delete(`/api/Companies/${id}/follow`);
  }

  /**
   * Get companies followed by current user
   */
  async getFollowedCompanies(): Promise<Company[]> {
    const response = await apiClient.get<Company[]>(
      "/api/Companies/me/followed",
      z.array(CompanyMetadataSchema),
    );

    return response.data;
  }

  /**
   * Get current user's company (for employers)
   */
  async getMyCompany(): Promise<Company> {
    const response = await apiClient.get<Company>(
      "/api/Companies/me",
      CompanyMetadataSchema,
    );

    return response.data;
  }

  /**
   * Check if current user follows a company
   */
  async isFollowingCompany(id: string): Promise<boolean> {
    try {
      const response = await apiClient.get<{ isFollowing: boolean }>(
        `/api/Companies/${id}/following-status`,
        z.object({ isFollowing: z.boolean() }),
      );
      return response.data.isFollowing;
    } catch (error) {
      return false;
    }
  }

  /**
   * Search companies with filters
   */
  async searchCompanies(filters: CompanyFilters): Promise<PaginatedCompanies> {
    return this.getPublicCompanies(filters);
  }

  /**
   * Get company statistics
   */
  async getCompanyStats(id: string): Promise<{
    jobsCount: number;
    followersCount: number;
    activeJobsCount: number;
  }> {
    const response = await apiClient.get<{
      jobsCount: number;
      followersCount: number;
      activeJobsCount: number;
    }>(
      `/api/Companies/${id}/stats`,
      z.object({
        jobsCount: z.number(),
        followersCount: z.number(),
        activeJobsCount: z.number(),
      }),
    );
    return response.data;
  }

  /**
   * Get trending/popular companies
   */
  async getTrendingCompanies(limit = 10): Promise<Company[]> {
    const response = await apiClient.get<Company[]>(
      `/api/Companies/trending?limit=${limit}`,
      z.array(CompanyMetadataSchema),
    );

    return response.data;
  }

  /**
   * Get companies by industry
   */
  async getCompaniesByIndustry(
    industry: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedCompanies> {
    return this.getPublicCompanies({
      industry,
      page,
      limit,
    });
  }

  /**
   * Get companies by location
   */
  async getCompaniesByLocation(
    location: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedCompanies> {
    return this.getPublicCompanies({
      location,
      page,
      limit,
    });
  }

  /**
   * Get company by slug (for SEO-friendly URLs)
   */
  async getCompanyBySlug(slug: string): Promise<Company> {
    const response = await apiClient.get<Company>(
      `/api/Companies/slug/${slug}`,
      CompanyMetadataSchema,
    );

    return response.data;
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const companyService = new CompanyService();
export default companyService;
