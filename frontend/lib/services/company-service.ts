/**
 * Company Service
 * Handles company-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";
import { isValidCompanyName } from "../utils/company-validation";

// ============================================================================
// SCHEMAS
// ============================================================================

// Helpers to normalize enum values from backend (string or number)
const mapCompanyStatus = (val: unknown): string => {
  if (typeof val === "string") return val.toLowerCase();
  if (typeof val === "number") {
    const map = ["draft", "onboarding", "active", "paused", "inactive"];
    return map[val] ?? "draft";
  }
  return "draft";
};

const mapCompanyVisibility = (val: unknown): string => {
  if (typeof val === "string") return val.toLowerCase();
  if (typeof val === "number") {
    const map = ["public", "private", "draft"];
    return map[val] ?? "private";
  }
  return "private";
};

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
  status: z.union([z.string(), z.number()]).nullable().transform((val) =>
    val === null ? undefined : mapCompanyStatus(val),
  ).optional(),
  visibility: z.union([z.string(), z.number()]).nullable().transform((val) =>
    val === null ? undefined : mapCompanyVisibility(val),
  ).optional(),
  createdAt: nullableString(),
  updatedAt: nullableString(),
  founded: nullableNumber(),
  views: nullableNumber(),
  followers: nullableNumber(),
  jobCount: nullableNumber(),
  activeJobCount: nullableNumber(),
  userId: nullableString(),
  onboardingProgress: nullableNumber(),
});

// Full Company Profile (GET /api/Companies/{id})
const CompanyLocationSchema = z
  .object({
    address: nullableString(),
    city: nullableString(),
    state: nullableString(),
    country: nullableString(),
    postalCode: nullableString(),
    timezone: nullableString(),
    remote: z.boolean().optional(),
  })
  .optional()
  .default({});

const CompanyContactSchema = z.object({
  email: nullableString(),
  phone: nullableString(),
  website: nullableString(),
  linkedin: nullableString(),
  twitter: nullableString(),
  facebook: nullableString(),
});

const CompanyFinancialsSchema = z
  .object({
    fundingStage: nullableString(),
    fundingAmount: nullableNumber(),
    totalFunding: nullableNumber(),
    currency: nullableString(),
    valuation: nullableNumber(),
    revenue: nullableNumber(),
    profitability: nullableString(),
    investors: z.array(z.string()).optional().default([]),
  })
  .optional();

const CompanyBenefitsSchema = z.object({
  healthInsurance: nullableBoolean(),
  dentalInsurance: nullableBoolean(),
  visionInsurance: nullableBoolean(),
  retirement401k: nullableBoolean(),
  retirementPlan: nullableBoolean(),
  stockOptions: nullableBoolean(),
  paidTimeOff: nullableBoolean(),
  parentalLeave: nullableBoolean(),
  flexibleSchedule: nullableBoolean(),
  remoteWork: nullableBoolean(),
  learningBudget: nullableBoolean(),
  professionalDevelopment: nullableBoolean(),
  gymMembership: nullableBoolean(),
  freeFood: nullableBoolean(),
  commuteBenefits: nullableBoolean(),
  other: z.array(z.string()).optional().default([]),
});

const CompanyDataSchema = z.object({
  name: z.string().nullable().transform((v) => v ?? "Unnamed Company").optional().default("Unnamed Company"),
  logo: nullableString(),
  website: nullableString(),
  tagline: nullableString(),
  description: z.string().nullable().transform((v) => v ?? "").optional().default(""),
  industry: z.string().nullable().transform((v) => v ?? "Not specified").optional().default("Not specified"),
  size: z.string().nullable().transform((v) => v ?? "Not specified").optional().default("Not specified"),
  founded: nullableNumber(),
  headquarters: CompanyLocationSchema.default({}),
  locations: z.array(CompanyLocationSchema).optional().default([]),
  contact: CompanyContactSchema.default({}),
  financials: CompanyFinancialsSchema,
  benefits: CompanyBenefitsSchema.default({
    healthInsurance: false,
    dentalInsurance: false,
    visionInsurance: false,
    retirement401k: false,
    retirementPlan: false,
    stockOptions: false,
    paidTimeOff: false,
    parentalLeave: false,
    flexibleSchedule: false,
    remoteWork: false,
    learningBudget: false,
    professionalDevelopment: false,
    gymMembership: false,
    freeFood: false,
    commuteBenefits: false,
    other: [],
  }),
  culture: z.array(z.string()).optional().default([]),
  technologies: z.array(z.string()).optional().default([]),
  techStack: z.array(z.string()).optional(),
  perks: z.array(z.string()).optional().default([]),
  mission: nullableString(),
  vision: nullableString(),
  values: z.array(z.string()).optional().default([]),
});

export const CompanyProfileSchema = z.object({
  id: z.string(),
  slug: z.string(),
  data: CompanyDataSchema,
  status: z.union([z.string(), z.number()]).transform(mapCompanyStatus),
  visibility: z
    .union([z.string(), z.number()])
    .transform(mapCompanyVisibility),
  onboardingTasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        completed: z.boolean(),
        required: z.boolean(),
        order: z.number(),
      }),
    )
    .optional()
    .default([]),
  createdAt: nullableString(),
  updatedAt: nullableString(),
  views: z.number().optional().default(0),
  followers: z.number().optional().default(0),
  jobCount: z.number().optional().default(0),
  activeJobCount: z.number().optional().default(0),
  userId: nullableString(),
  teamMembers: z.array(z.string()).optional().default([]),
  canEdit: z.boolean().optional(),
  isOwner: z.boolean().optional(),
  isFollowing: z.boolean().optional(),
  isAuthenticated: z.boolean().optional(),
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

export type CompanyMetadata = z.infer<typeof CompanyMetadataSchema>;
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;
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

    // Filter out companies with invalid names and demo companies
    if (response.data.items) {
      response.data.items = response.data.items.filter(company => 
        isValidCompanyName(company.name) && !(company as any).isDemo
      );
      // Update the total count to reflect filtered results
      response.data.total = response.data.items.length;
    }

    return response.data;
  }

  /**
   * Get specific company by ID (full profile)
   */
  async getCompanyProfileById(id: string): Promise<CompanyProfile> {
    const response = await apiClient.get<CompanyProfile>(
      `/api/Companies/${id}`,
      CompanyProfileSchema,
    );
    return response.data;
  }

  /**
   * Get specific company by ID (legacy metadata-only)
   * Note: Many pages use full profile; prefer getCompanyProfileById for details pages
   */
  async getCompanyById(id: string): Promise<CompanyMetadata> {
    const response = await apiClient.get<CompanyMetadata>(
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
  async getFollowedCompanies(): Promise<CompanyMetadata[]> {
    const response = await apiClient.get<CompanyMetadata[]>(
      "/api/Companies/me/followed",
      z.array(CompanyMetadataSchema),
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
  async getTrendingCompanies(limit = 10): Promise<CompanyMetadata[]> {
    const response = await apiClient.get<CompanyMetadata[]>(
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
   * Get company by slug (for SEO-friendly URLs) - returns metadata
   */
  async getCompanyBySlug(slug: string): Promise<CompanyMetadata> {
    const response = await apiClient.get<CompanyMetadata>(
      `/api/Companies/slug/${slug}`,
      CompanyMetadataSchema,
    );

    return response.data;
  }

  /**
   * Update an existing company
   */
  async updateCompany(id: string, request: UpdateCompanyRequest): Promise<CompanyProfile> {
    const response = await apiClient.put<CompanyProfile>(
      `/api/Companies/${id}`,
      request,
      CompanyProfileSchema,
    );

    return response.data;
  }
}

// ============================================================================
// UPDATE REQUEST TYPE
// ============================================================================

export interface UpdateCompanyRequest {
  data?: Partial<CompanyData>;
  status?: string;
  visibility?: string;
}

export type CompanyData = z.infer<typeof CompanyDataSchema>;

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const companyService = new CompanyService();
export default companyService;
