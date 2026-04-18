/**
 * Autofill Service
 * Handles application form analysis and AI answer generation API operations
 */

import { apiClient } from "../api-client";
import type {
  FormField,
  FormAnalysisRequest,
  FormAnalysisResponse,
  AnswerGenerationRequest,
  AnswerGenerationResponse,
  FieldAnswer,
  SaveSubmissionRequest,
  SavedFormSubmission,
  CachedAnswer,
} from "@shared/autofill";

// ============================================================================
// RESPONSE TYPES
// ============================================================================

interface SaveResponse {
  id: string;
}

interface HistoryItem {
  id: string;
  sourceUrl?: string;
  atsProvider?: string;
  status: string;
  jobId?: string;
  jobTitle?: string;
  company?: string;
  createdAt: string;
  submittedAt?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export const autofillService = {
  /**
   * Analyze a form: extract fields from HTML, raw questions, or a URL.
   */
  async analyzeForm(data: FormAnalysisRequest): Promise<FormAnalysisResponse> {
    const response = await apiClient.post<FormAnalysisResponse>(
      "/api/autofill/analyze",
      data
    );
    return response;
  },

  /**
   * Generate answers for form fields using profile + resume + job context.
   */
  async generateAnswers(
    data: AnswerGenerationRequest
  ): Promise<AnswerGenerationResponse> {
    const response = await apiClient.post<AnswerGenerationResponse>(
      "/api/autofill/generate",
      data
    );
    return response;
  },

  /**
   * Save a completed form submission with answers.
   */
  async saveSubmission(data: SaveSubmissionRequest): Promise<SaveResponse> {
    const response = await apiClient.post<SaveResponse>(
      "/api/autofill/save",
      data
    );
    return response;
  },

  /**
   * Get paginated submission history.
   */
  async getHistory(params?: {
    jobId?: string;
    page?: number;
    limit?: number;
  }): Promise<HistoryItem[]> {
    const searchParams = new URLSearchParams();
    if (params?.jobId) searchParams.set("jobId", params.jobId);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    const response = await apiClient.get<HistoryItem[]>(
      `/api/autofill/history${qs ? `?${qs}` : ""}`
    );
    return response;
  },

  /**
   * Get a single submission detail.
   */
  async getSubmission(id: string): Promise<SavedFormSubmission> {
    const response = await apiClient.get<SavedFormSubmission>(
      `/api/autofill/history/${id}`
    );
    return response;
  },

  /**
   * Get the user's cached answers.
   */
  async getCache(): Promise<CachedAnswer[]> {
    const response = await apiClient.get<CachedAnswer[]>(
      "/api/autofill/cache"
    );
    return response;
  },

  /**
   * Update a cached answer.
   */
  async updateCachedAnswer(id: string, answer: string): Promise<void> {
    await apiClient.put(`/api/autofill/cache/${id}`, { answer });
  },

  /**
   * Delete a cached answer.
   */
  async deleteCachedAnswer(id: string): Promise<void> {
    await apiClient.delete(`/api/autofill/cache/${id}`);
  },
};
