/**
 * Match Service
 * Handles job-resume matching API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { ResumeContentSchema } from "@shared/resume";
import { JobGapSchema, TailorChangeSchema, type TailorChange } from "@shared/resume-tailor";
import { CoverLetterSchema, type CoverLetter, type CoverLetterTone } from "@shared/cover-letter";
import type { ResumeContent } from "@shared/resume";

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
  /** Review first: nothing is saved (the kit review). */
  preview: z.boolean().optional(),
  /** The résumé as it is on screen — honoured only with `preview`. */
  resumeContent: ResumeContentSchema.optional(),
}).refine((v) => !!(v.jobHtml || v.jobId), {
  message: "Either jobHtml or jobId is required",
});

/**
 * Tailor response schema.
 *
 * `tailoredResume` is the full JSON Resume the client renders; `changes`
 * carry a content path each (exact Revert) and `gaps` are what the job asks
 * for that the résumé shows no evidence of. With `preview: true` nothing is
 * saved and `variationId` is absent (the kit review saves later, as a
 * version of the master); otherwise the server saves a version and returns
 * its id. Change + gap shapes are shared with the API (shared/resume-tailor.ts).
 */
export const JobTailorResponseSchema = z.object({
  oldScore: z.number(),
  newScore: z.number(),
  tailoredResume: ResumeContentSchema,
  changes: z.array(TailorChangeSchema).default([]),
  gaps: z.array(JobGapSchema).default([]),
  /** Job keywords the résumé already shows (verified server-side, #2344). */
  matchedKeywords: z.array(z.string()).default([]),
  summaryRecommendations: z.string(),
  resumeId: z.string().optional(),
  sourceUrl: z.string().optional(),
  variationId: z.string().optional(),
  variationTitle: z.string(),
  preview: z.boolean().optional(),
});

export type { TailorChange };

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

  /**
   * Write the cover letter for a résumé tailored to a job (Pro).
   * POST /api/match/cover-letter — `resumeContent` is what is on screen.
   */
  async writeCoverLetter(request: { jobId?: string; jobHtml?: string; resumeContent: ResumeContent }): Promise<CoverLetter> {
    const response = await apiClient.post<{ letter: CoverLetter }>(
      "/api/match/cover-letter",
      request,
      z.object({ letter: CoverLetterSchema }),
    );
    return response.data.letter;
  }

  /**
   * Rewrite a cover letter's body in one tone (FREE — any signed-in viewer,
   * guests included). POST /api/match/cover-letter/tone. Returns the whole
   * letter: the new body, everything else as sent.
   */
  async rewriteCoverLetterTone(request: { letter: CoverLetter; tone: CoverLetterTone }): Promise<CoverLetter> {
    const response = await apiClient.post<{ letter: CoverLetter }>(
      "/api/match/cover-letter/tone",
      request,
      z.object({ letter: CoverLetterSchema }),
    );
    return response.data.letter;
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const matchService = new MatchService();
export default matchService;
