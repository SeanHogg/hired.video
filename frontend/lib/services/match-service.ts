/**
 * Match Service
 * Handles job-resume matching API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { ResumeContentSchema } from "@shared/resume";

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

// New v2 API schemas for analyze and tailor endpoints
export const JobHtmlAnalyzeRequestSchema = z.object({
  jobHtml: z.string(),
  resumeId: z.string().optional(),
  sourceUrl: z.string().optional(),
});

/** Tailor request. Either `jobHtml` (paste / upload flow) or `jobId`
 *  (select existing from account) identifies the job; callers provide
 *  exactly one. The server treats them as alternative routes into the
 *  same tailor pipeline. */
export const JobHtmlTailorRequestSchema = z.object({
  jobHtml: z.string().optional(),
  jobId: z.string().optional(),
  resumeId: z.string().optional(),
  sourceUrl: z.string().optional(),
}).refine((v) => !!(v.jobHtml || v.jobId), {
  message: "Either jobHtml or jobId is required",
});

/**
 * One change the tailor made to the resume, with a justification the UI
 * can surface alongside a diff. Keys mirror the backend
 * `TailorChangeSchema` in `api/src/routes/match-handlers.ts`.
 */
export const TailorChangeSchema = z.object({
  section: z.enum([
    "basics",
    "work",
    "education",
    "skills",
    "projects",
    "volunteer",
    "awards",
    "certificates",
    "publications",
    "languages",
    "interests",
    "references",
  ]),
  before: z.string(),
  after: z.string(),
  why: z.string(),
});

/**
 * Tailor response schema.
 *
 * The server tailors the resume AND persists it as a variation in a
 * single call. `tailoredResume` is the full JSON Resume the client
 * renders (web via DeclarativeResumeRenderer, extension via
 * renderMarkdownFromJsonResume). `variationId` points at the saved
 * copy so the client can link/navigate without a second round-trip.
 * No markdown is shipped.
 */
export const JobTailorResponseSchema = z.object({
  oldScore: z.number(),
  newScore: z.number(),
  tailoredResume: ResumeContentSchema,
  changes: z.array(TailorChangeSchema).default([]),
  summaryRecommendations: z.string(),
  resumeId: z.string().optional(),
  sourceUrl: z.string().optional(),
  variationId: z.string(),
  variationTitle: z.string(),
});

export type TailorChange = z.infer<typeof TailorChangeSchema>;

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

// New v2 types
export type JobHtmlAnalyzeRequest = z.infer<typeof JobHtmlAnalyzeRequestSchema>;
export type JobHtmlTailorRequest = z.infer<typeof JobHtmlTailorRequestSchema>;
export type JobTailorResponse = z.infer<typeof JobTailorResponseSchema>;

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

  // ==========================================================================
  // NEW V2 ENDPOINTS - Standardized API for Chrome extension and frontend tools
  // ==========================================================================

  /**
   * Analyze job HTML against a resume
   * Uses POST /api/Match/analyze endpoint
   * This is the new standardized endpoint (v2)
   */
  async analyzeJobHtml(
    request: JobHtmlAnalyzeRequest,
  ): Promise<JobResumeMatchResponse> {
    const response = await apiClient.post<JobResumeMatchResponse>(
      "/api/Match/analyze",
      request,
      JobResumeMatchResponseSchema,
    );
    return response.data;
  }

  /**
   * Generate a tailored resume from job HTML
   * Uses POST /api/Match/tailor endpoint
   * This is the new standardized endpoint (v2)
   */
  async tailorResumeFromJobHtml(
    request: JobHtmlTailorRequest,
  ): Promise<JobTailorResponse> {
    const response = await apiClient.post<JobTailorResponse>(
      "/api/Match/tailor",
      request,
      JobTailorResponseSchema,
    );
    return response.data;
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const matchService = new MatchService();
export default matchService;
