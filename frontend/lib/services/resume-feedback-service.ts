/**
 * Resume-feedback service — frontend wrapper for `/api/resume-feedback/*`
 * (gap #1946 backend, #1947 studio annotation layer).
 *
 * Mirrors the contracts in `shared/resume-feedback.ts`. The reviewer flow is
 * driven by an unguessable `shareToken` (passed as `?token=`), so every
 * review-scoped read/write accepts an optional token — when present the call
 * works for an unauthenticated peer opening a share link.
 */

import type {
  ResumeReviewDTO,
  ResumeReviewAnnotationDTO,
  ProposedDraftDTO,
  ResumeReviewDetailDTO,
  CreateReviewInput,
  InviteReviewersInput,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  SubmitReviewInput,
  ProposeDraftInput,
} from "@shared/resume-feedback";
import { apiClient } from "../api-client";

const BASE = "/api/resume-feedback";

/** Append `?token=` when a reviewer is acting via a share link. */
function withToken(path: string, token?: string): string {
  if (!token) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}

export class ResumeFeedbackService {
  // ── Reviews ────────────────────────────────────────────────────────────────

  /** Owner: open a review I own (by id). */
  async getReview(reviewId: string): Promise<ResumeReviewDetailDTO> {
    const res = await apiClient.get<ResumeReviewDetailDTO>(
      `${BASE}/reviews/${reviewId}`,
    );
    return res.data;
  }

  /** Reviewer: open a review via its share-link token (auth optional). */
  async getReviewByToken(token: string): Promise<ResumeReviewDetailDTO> {
    const res = await apiClient.get<ResumeReviewDetailDTO>(
      `${BASE}/link/${encodeURIComponent(token)}`,
    );
    return res.data;
  }

  /** Owner: reviews I created on my resumes. */
  async listOwnerReviews(): Promise<ResumeReviewDTO[]> {
    const res = await apiClient.get<ResumeReviewDTO[]>(`${BASE}/reviews`);
    return res.data;
  }

  /** Owner: every feedback session on ONE resume — the per-resume manager. */
  async listResumeReviews(resumeId: string): Promise<ResumeReviewDTO[]> {
    const res = await apiClient.get<ResumeReviewDTO[]>(
      `${BASE}/reviews?resumeId=${encodeURIComponent(resumeId)}`,
    );
    return res.data;
  }

  /** Reviewer: reviews assigned to me. */
  async listAssigned(): Promise<ResumeReviewDTO[]> {
    const res = await apiClient.get<ResumeReviewDTO[]>(`${BASE}/assigned`);
    return res.data;
  }

  async createReview(input: CreateReviewInput): Promise<ResumeReviewDTO> {
    const res = await apiClient.post<ResumeReviewDTO>(`${BASE}/reviews`, input);
    return res.data;
  }

  /** Batch-invite reviewers (platform contacts + external emails). Each invitee
   *  gets their own review + share link; the backend fans out the emails,
   *  in-app notifications, and lead capture. */
  async inviteReviewers(input: InviteReviewersInput): Promise<ResumeReviewDTO[]> {
    const res = await apiClient.post<ResumeReviewDTO[]>(`${BASE}/reviews/invite`, input);
    return res.data;
  }

  async submitReview(
    reviewId: string,
    input: SubmitReviewInput = {},
    token?: string,
  ): Promise<ResumeReviewDTO> {
    const res = await apiClient.post<ResumeReviewDTO>(
      withToken(`${BASE}/reviews/${reviewId}/submit`, token),
      input,
    );
    return res.data;
  }

  async completeReview(reviewId: string): Promise<ResumeReviewDTO> {
    const res = await apiClient.post<ResumeReviewDTO>(
      `${BASE}/reviews/${reviewId}/complete`,
      {},
    );
    return res.data;
  }

  async cancelReview(reviewId: string): Promise<ResumeReviewDTO> {
    const res = await apiClient.post<ResumeReviewDTO>(
      `${BASE}/reviews/${reviewId}/cancel`,
      {},
    );
    return res.data;
  }

  // ── Annotations ──────────────────────────────────────────────────────────────

  async listAnnotations(
    reviewId: string,
    token?: string,
  ): Promise<ResumeReviewAnnotationDTO[]> {
    const res = await apiClient.get<ResumeReviewAnnotationDTO[]>(
      withToken(`${BASE}/reviews/${reviewId}/annotations`, token),
    );
    return res.data;
  }

  async createAnnotation(
    reviewId: string,
    input: CreateAnnotationInput,
    token?: string,
  ): Promise<ResumeReviewAnnotationDTO> {
    const res = await apiClient.post<ResumeReviewAnnotationDTO>(
      withToken(`${BASE}/reviews/${reviewId}/annotations`, token),
      input,
    );
    return res.data;
  }

  async updateAnnotation(
    annotationId: string,
    patch: UpdateAnnotationInput,
  ): Promise<ResumeReviewAnnotationDTO> {
    const res = await apiClient.patch<ResumeReviewAnnotationDTO>(
      `${BASE}/annotations/${annotationId}`,
      patch,
    );
    return res.data;
  }

  /** Owner: accept an annotation, applying its `suggestedEdit` to the resume. */
  async acceptAnnotation(annotationId: string): Promise<{
    annotation: ResumeReviewAnnotationDTO;
    appliedEdit: boolean;
    reviewerId: string | null;
  }> {
    const res = await apiClient.post<{
      annotation: ResumeReviewAnnotationDTO;
      appliedEdit: boolean;
      reviewerId: string | null;
    }>(`${BASE}/annotations/${annotationId}/accept`, {});
    return res.data;
  }

  async deleteAnnotation(annotationId: string): Promise<void> {
    await apiClient.delete(`${BASE}/annotations/${annotationId}`);
  }

  // ── Proposed drafts ──────────────────────────────────────────────────────────

  async listProposals(
    reviewId: string,
    token?: string,
  ): Promise<ProposedDraftDTO[]> {
    const res = await apiClient.get<ProposedDraftDTO[]>(
      withToken(`${BASE}/reviews/${reviewId}/proposals`, token),
    );
    return res.data;
  }

  async proposeDraft(
    reviewId: string,
    input: ProposeDraftInput,
    token?: string,
  ): Promise<ProposedDraftDTO> {
    const res = await apiClient.post<ProposedDraftDTO>(
      withToken(`${BASE}/reviews/${reviewId}/propose`, token),
      input,
    );
    return res.data;
  }

  async acceptProposal(versionId: string): Promise<ProposedDraftDTO> {
    const res = await apiClient.post<ProposedDraftDTO>(
      `${BASE}/proposals/${versionId}/accept`,
      {},
    );
    return res.data;
  }

  async rejectProposal(versionId: string): Promise<ProposedDraftDTO> {
    const res = await apiClient.post<ProposedDraftDTO>(
      `${BASE}/proposals/${versionId}/reject`,
      {},
    );
    return res.data;
  }
}

export const resumeFeedbackService = new ResumeFeedbackService();
