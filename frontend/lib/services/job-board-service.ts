import { apiClient } from "../api-client";
import { z } from "zod";

// ============================================================================
// Zod Schemas
// ============================================================================

export const JobBoardDTOSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullish(),
  logoUrl: z.string().nullish(),
  websiteUrl: z.string().nullish(),
  category: z.string(),
  tier: z.string(),
  costPerPosting: z.number().nullish(),
  isActive: z.boolean(),
  requiresApiKey: z.boolean(),
  supportsAutoPosting: z.boolean(),
  maxPostingDuration: z.number().nullish(),
});

export const JobBoardPostingDTOSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  jobBoardId: z.string(),
  jobBoardName: z.string(),
  status: z.string(),
  externalPostingId: z.string().nullish(),
  externalUrl: z.string().nullish(),
  postedAt: z.string(),
  expiresAt: z.string().nullish(),
  views: z.number(),
  clicks: z.number(),
  applications: z.number(),
  cost: z.number().nullish(),
});

export const BoardPerformanceDTOSchema = z.object({
  jobBoardId: z.string(),
  jobBoardName: z.string(),
  totalPostings: z.number(),
  activePostings: z.number(),
  totalViews: z.number(),
  totalClicks: z.number(),
  totalApplications: z.number(),
  totalCost: z.number(),
  averageCostPerApplication: z.number(),
});

export const JobBoardStatsDTOSchema = z.object({
  totalPostings: z.number(),
  activePostings: z.number(),
  totalViews: z.number(),
  totalApplications: z.number(),
  totalCost: z.number(),
  boardPerformance: z.array(BoardPerformanceDTOSchema),
});

export const PostJobToBoardsRequestSchema = z.object({
  jobId: z.string(),
  boardIds: z.array(z.string()),
  expirationDate: z.string().nullish().optional(),
  customFields: z.record(z.string(), z.string()).nullish().optional(),
});

// ============================================================================
// Types
// ============================================================================

export type JobBoardDTO = z.infer<typeof JobBoardDTOSchema>;
export type JobBoardPostingDTO = z.infer<typeof JobBoardPostingDTOSchema>;
export type BoardPerformanceDTO = z.infer<typeof BoardPerformanceDTOSchema>;
export type JobBoardStatsDTO = z.infer<typeof JobBoardStatsDTOSchema>;
export type PostJobToBoardsRequest = z.infer<typeof PostJobToBoardsRequestSchema>;

// ============================================================================
// Service
// ============================================================================

class JobBoardService {
  /**
   * Get available job boards for distribution
   */
  async getAvailableJobBoards(): Promise<JobBoardDTO[]> {
    const response = await apiClient.get("/api/communication/job-boards");
    return z.array(JobBoardDTOSchema).parse(response.data);
  }

  /**
   * Post a job to multiple job boards (Boost campaign)
   */
  async postJobToBoards(
    request: PostJobToBoardsRequest
  ): Promise<JobBoardPostingDTO[]> {
    const response = await apiClient.post(
      "/api/communication/job-boards/post",
      request
    );
    return z.array(JobBoardPostingDTOSchema).parse(response.data);
  }

  /**
   * Get job board postings for a specific job
   */
  async getPostingsForJob(jobId: string): Promise<JobBoardPostingDTO[]> {
    const response = await apiClient.get(
      `/api/communication/job-boards/jobs/${jobId}/postings`
    );
    return z.array(JobBoardPostingDTOSchema).parse(response.data);
  }

  /**
   * Get all job board postings with filtering
   */
  async getJobBoardPostings(filters?: {
    jobId?: string;
    jobBoardId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<JobBoardPostingDTO[]> {
    const params = new URLSearchParams();
    if (filters?.jobId) params.append("jobId", filters.jobId);
    if (filters?.jobBoardId) params.append("jobBoardId", filters.jobBoardId);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.page) params.append("page", filters.page.toString());
    if (filters?.pageSize) params.append("pageSize", filters.pageSize.toString());

    const response = await apiClient.get(
      `/api/communication/job-boards/postings?${params.toString()}`
    );
    return z.array(JobBoardPostingDTOSchema).parse(response.data);
  }

  /**
   * Get job board posting statistics
   */
  async getJobBoardStats(filters?: {
    startDate?: string;
    endDate?: string;
  }): Promise<JobBoardStatsDTO> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);

    const response = await apiClient.get(
      `/api/communication/job-boards/stats?${params.toString()}`
    );
    return JobBoardStatsDTOSchema.parse(response.data);
  }

  /**
   * Remove job from job board
   */
  async removeJobBoardPosting(postingId: string): Promise<boolean> {
    const response = await apiClient.delete(
      `/api/communication/job-boards/postings/${postingId}`
    );
    return response.data === true;
  }
}

export const jobBoardService = new JobBoardService();

