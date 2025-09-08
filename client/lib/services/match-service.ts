/**
 * Match Service
 * Handles job-resume matching API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";

// ============================================================================
// SCHEMAS
// ============================================================================

// Request schemas matching backend models
export const JobContentResumeIdMatchRequestSchema = z.object({
  jobContent: z.string(),
  resumeId: z.string(),
});

export const JobResumeIdMatchRequestSchema = z.object({
  jobId: z.string(),
  resumeId: z.string(),
});

export const JobResumeByContentMatchRequestSchema = z.object({
  jobContent: z.string(),
  resumeContent: z.string(),
});

// Response schema matching backend JobResumeMatchResponse
export const JobResumeMatchResponseSchema = z.object({
  summaryRecommendations: z.string(), // Markdown content
  score: z.number(), // 0-100 match score
});

// ============================================================================
// TYPES
// ============================================================================

export type JobContentResumeIdMatchRequest = z.infer<
  typeof JobContentResumeIdMatchRequestSchema
>;
export type JobResumeIdMatchRequest = z.infer<
  typeof JobResumeIdMatchRequestSchema
>;
export type JobResumeByContentMatchRequest = z.infer<
  typeof JobResumeByContentMatchRequestSchema
>;
export type JobResumeMatchResponse = z.infer<
  typeof JobResumeMatchResponseSchema
>;

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class MatchService {
  /**
   * Match job content with existing resume by ID
   * Uses POST /api/Match endpoint
   */
  async matchJobContentWithResumeId(
    request: JobContentResumeIdMatchRequest,
  ): Promise<JobResumeMatchResponse> {
    const response = await apiClient.post<JobResumeMatchResponse>(
      "/api/Match",
      request,
      JobResumeMatchResponseSchema,
    );
    return response.data;
  }

  /**
   * Match existing job with existing resume by IDs
   * Uses POST /api/Match/byid endpoint
   */
  async matchJobIdWithResumeId(
    request: JobResumeIdMatchRequest,
  ): Promise<JobResumeMatchResponse> {
    const response = await apiClient.post<JobResumeMatchResponse>(
      "/api/Match/byid",
      request,
      JobResumeMatchResponseSchema,
    );
    return response.data;
  }

  /**
   * Match job content with resume content (both as text)
   * Uses POST /api/Match/bycontent endpoint
   */
  async matchJobContentWithResumeContent(
    request: JobResumeByContentMatchRequest,
  ): Promise<JobResumeMatchResponse> {
    const response = await apiClient.post<JobResumeMatchResponse>(
      "/api/Match/bycontent",
      request,
      JobResumeMatchResponseSchema,
    );
    return response.data;
  }

  /**
   * Helper method to determine which API endpoint to use based on input types
   */
  async matchJobWithResume(params: {
    jobId?: string;
    jobContent?: string;
    resumeId?: string;
    resumeContent?: string;
  }): Promise<JobResumeMatchResponse> {
    const { jobId, jobContent, resumeId, resumeContent } = params;

    // Validate inputs
    if (!jobId && !jobContent) {
      throw new Error("Either jobId or jobContent must be provided");
    }
    if (!resumeId && !resumeContent) {
      throw new Error("Either resumeId or resumeContent must be provided");
    }

    // Route to appropriate endpoint based on available data
    if (jobId && resumeId) {
      // Both IDs available - use byid endpoint
      return this.matchJobIdWithResumeId({ jobId, resumeId });
    } else if (jobContent && resumeId) {
      // Job content + resume ID - use main endpoint
      return this.matchJobContentWithResumeId({ jobContent, resumeId });
    } else if (jobContent && resumeContent) {
      // Both content strings - use bycontent endpoint
      return this.matchJobContentWithResumeContent({
        jobContent,
        resumeContent,
      });
    } else {
      throw new Error(
        "Invalid combination of parameters. Cannot match job ID with resume content.",
      );
    }
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const matchService = new MatchService();
export default matchService;
