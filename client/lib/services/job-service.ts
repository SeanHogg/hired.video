/**
 * Job Service
 * Handles job-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";

// ============================================================================
// SCHEMAS
// ============================================================================

export const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  companyId: z.string().optional(),
  location: z.string(),
  description: z.string(),
  requirements: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  employmentType: z.enum([
    "full_time",
    "part_time",
    "contract",
    "internship",
    "remote",
  ]),
  experienceLevel: z.enum(["entry", "mid", "senior", "executive"]),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  currency: z.string().optional(),
  isRemote: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  postedDate: z.string(),
  expiryDate: z.string().optional(),
  applicationCount: z.number().optional(),
  viewCount: z.number().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const JobSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  employmentType: z.string(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  postedDate: z.string().optional().default(new Date().toISOString()),
  isRemote: z.boolean().optional(),
});

export const CreateJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  companyId: z.string().optional(),
  location: z.string().min(1),
  description: z.string().min(1),
  requirements: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  employmentType: z.enum([
    "full_time",
    "part_time",
    "contract",
    "internship",
    "remote",
  ]),
  experienceLevel: z.enum(["entry", "mid", "senior", "executive"]),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  currency: z.string().optional(),
  isRemote: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  expiryDate: z.string().optional(),
});

export const JobFiltersSchema = z.object({
  search: z.string().optional(),
  location: z.string().optional(),
  skills: z.array(z.string()).optional(),
  employmentType: z.string().optional(),
  experienceLevel: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  isRemote: z.boolean().optional(),
  companyId: z.string().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
});

// Accept both our normalized keys and backend PascalCase keys
export const PaginatedJobsSchema = z.object({
  items: z.array(JobSummarySchema).optional(),
  Items: z.array(JobSummarySchema).optional(),
  total: z.number().optional(),
  Total: z.number().optional(),
  page: z.number().optional(),
  Page: z.number().optional(),
  limit: z.number().optional(),
  Limit: z.number().optional(),
  hasNext: z.boolean().optional(),
  hasPrev: z.boolean().optional(),
  hasNextPage: z.boolean().optional(),
  HasNextPage: z.boolean().optional(),
  hasPreviousPage: z.boolean().optional(),
  HasPreviousPage: z.boolean().optional(),
});

// ============================================================================
// TYPES
// ============================================================================

export type Job = z.infer<typeof JobSchema>;
export type JobSummary = z.infer<typeof JobSummarySchema>;
export type CreateJob = z.infer<typeof CreateJobSchema>;
export type JobFilters = z.infer<typeof JobFiltersSchema>;
export type PaginatedJobs = z.infer<typeof PaginatedJobsSchema>;

// ============================================================================
// JOB SERVICE CLASS
// ============================================================================

export class JobService {
  /**
   * Get all public jobs
   */
  async getPublicJobs(filters?: JobFilters): Promise<PaginatedJobs> {
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

    const endpoint = `/api/Job${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await apiClient.get<any>(endpoint, PaginatedJobsSchema);

    const dto = response.data;
    const items = (dto.items || dto.Items || []) as unknown[];
    const total = (dto.total ??
      dto.Total ??
      (Array.isArray(items) ? items.length : 0)) as number;
    const page = (dto.page ?? dto.Page ?? 1) as number;
    const limit = (dto.limit ??
      dto.Limit ??
      (Array.isArray(items) ? items.length : 0)) as number;
    const hasNext = (dto.hasNext ??
      dto.hasNextPage ??
      dto.HasNextPage ??
      page * limit < total) as boolean;
    const hasPrev = (dto.hasPrev ??
      dto.hasPreviousPage ??
      dto.HasPreviousPage ??
      page > 1) as boolean;

    return {
      items: items as JobSummary[],
      total,
      page,
      limit,
      hasNext,
      hasPrev,
    };
  }

  /**
   * Get jobs for current user (owned + saved)
   */
  async getUserJobs(): Promise<JobSummary[]> {
    const response = await apiClient.get<JobSummary[]>(
      "/api/Job/GetSummaryItems",
      z.array(JobSummarySchema),
    );

    return response.data;
  }

  /**
   * Get specific job by ID
   */
  async getJobById(id: string): Promise<any> {
    // Bypass strict client-side schema; backend returns JobItemEntity shape
    const response = await apiClient.get<any>(`/api/Job/${id}`);
    return response.data;
  }

  /**
   * Create new job
   */
  async createJob(jobData: CreateJob): Promise<Job> {
    const response = await apiClient.post<Job>("/api/Job", jobData, JobSchema);
    return response.data;
  }

  /**
   * Update existing job
   */
  async updateJob(id: string, jobData: any): Promise<any> {
    // Bypass strict client-side schema; backend expects JobItemEntity shape
    const response = await apiClient.put<any>(`/api/Job/${id}`, jobData);
    return response.data;
  }

  /**
   * Create job from file upload
   */
  async createJobFromFile(file: File): Promise<Job> {
    const formData = new FormData();
    formData.append("file", file);

    // Note: This will need special handling for FormData
    const response = await apiClient.request<Job>(
      "/api/Job/CreateFromFile",
      {
        method: "POST",
        body: formData,
        headers: {}, // Remove Content-Type to let browser set it for FormData
      },
      JobSchema,
    );

    return response.data;
  }

  /**
   * Extract job from URL
   */
  async extractJobFromUrl(url: string): Promise<Job> {
    const response = await apiClient.post<Job>(
      "/api/Job/Extract",
      { url },
      JobSchema,
    );

    return response.data;
  }



  /**
   * Delete job
   */
  async deleteJob(id: string): Promise<void> {
    await apiClient.delete(`/api/Job/${id}`);
  }

  /**
   * Apply to job
   */
  async applyToJob(jobId: string, resumeId?: string): Promise<void> {
    await apiClient.post(`/api/Job/${jobId}/apply`, { resumeId });
  }

  /**
   * Save/bookmark job
   */
  async saveJob(jobId: string): Promise<void> {
    await apiClient.post(`/api/Job/${jobId}/save`);
  }

  /**
   * Remove saved job
   */
  async unsaveJob(jobId: string): Promise<void> {
    await apiClient.delete(`/api/Job/${jobId}/save`);
  }

  /**
   * Get user's saved jobs
   */
  async getSavedJobs(): Promise<JobSummary[]> {
    const response = await apiClient.get<JobSummary[]>(
      "/api/Job/saved",
      z.array(JobSummarySchema),
    );

    return response.data;
  }

  /**
   * Get job by slug (for SEO-friendly URLs)
   */
  async getJobBySlug(slug: string): Promise<Job> {
    const response = await apiClient.get<Job>(
      `/api/Job/slug/${slug}`,
      JobSchema,
    );

    return response.data;
  }

  /**
   * Search jobs with filters
   */
  async searchJobs(filters: JobFilters): Promise<PaginatedJobs> {
    return this.getPublicJobs(filters);
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const jobService = new JobService();
export default jobService;
