import { z } from 'zod';
import { apiClient } from '../api-client';

// ============================================================================
// Zod Schemas for Type-Safe API Responses
// ============================================================================

const SubmissionDTOSchema = z.object({
  id: z.string(),
  recruiterUserId: z.string(),
  recruiterName: z.string(),
  candidateUserId: z.string(),
  candidateName: z.string(),
  candidateEmail: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  resumeId: z.string().nullable(),
  coverLetter: z.string().nullable(),
  recruiterNotes: z.string().nullable(),
  proposedSalary: z.number().nullable(),
  availableStartDate: z.string().nullable(),
  status: z.string(),
  statusNotes: z.string().nullable(),
  interviewDate: z.string().nullable(),
  withdrawalReason: z.string().nullable(),
  withdrawalNotes: z.string().nullable(),
  withdrawnAt: z.string().nullable(),
  submittedAt: z.string(),
  updatedAt: z.string(),
});

export type SubmissionDTO = z.infer<typeof SubmissionDTOSchema>;

const SubmissionListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(SubmissionDTOSchema),
  errorMessage: z.string().nullable(),
  errorCode: z.string().nullable(),
});

const SubmissionResponseSchema = z.object({
  success: z.boolean(),
  data: SubmissionDTOSchema.nullable(),
  errorMessage: z.string().nullable(),
  errorCode: z.string().nullable(),
});

// ============================================================================
// Request Types
// ============================================================================

export interface SubmitCandidateRequest {
  candidateUserId: string;
  jobId: string;
  resumeId?: string;
  coverLetter?: string;
  recruiterNotes?: string;
  proposedSalary?: number;
  availableStartDate?: string;
}

export interface UpdateSubmissionStatusRequest {
  status: string;
  statusNotes?: string;
  interviewDate?: string;
}

export interface WithdrawSubmissionRequest {
  reason: string;
  notes?: string;
}

export interface SubmissionFilters {
  jobId?: string;
  candidateUserId?: string;
  status?: string;
  companyName?: string;
  submittedAfter?: string;
  submittedBefore?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// Submission Service
// ============================================================================

export const submissionService = {
  /**
   * Submit a candidate to a job
   */
  async submitCandidate(request: SubmitCandidateRequest): Promise<SubmissionDTO> {
    const response = await apiClient.post('/api/Recruiter/submissions', request);
    const parsed = SubmissionResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to submit candidate');
    }
    
    return parsed.data;
  },

  /**
   * Get all submissions for the current recruiter with optional filters
   */
  async getSubmissions(filters?: SubmissionFilters): Promise<SubmissionDTO[]> {
    const params = new URLSearchParams();
    
    if (filters?.jobId) params.append('jobId', filters.jobId);
    if (filters?.candidateUserId) params.append('candidateUserId', filters.candidateUserId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.companyName) params.append('companyName', filters.companyName);
    if (filters?.submittedAfter) params.append('submittedAfter', filters.submittedAfter);
    if (filters?.submittedBefore) params.append('submittedBefore', filters.submittedBefore);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());
    
    const url = `/api/Recruiter/submissions${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await apiClient.get(url);
    const parsed = SubmissionListResponseSchema.parse(response);
    
    if (!parsed.success) {
      throw new Error(parsed.errorMessage || 'Failed to fetch submissions');
    }
    
    return parsed.data;
  },

  /**
   * Get a specific submission by ID
   */
  async getSubmissionById(submissionId: string): Promise<SubmissionDTO> {
    const response = await apiClient.get(`/api/Recruiter/submissions/${submissionId}`);
    const parsed = SubmissionResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to fetch submission');
    }
    
    return parsed.data;
  },

  /**
   * Update submission status
   */
  async updateSubmissionStatus(
    submissionId: string,
    request: UpdateSubmissionStatusRequest
  ): Promise<SubmissionDTO> {
    const response = await apiClient.put(
      `/api/Recruiter/submissions/${submissionId}/status`,
      request
    );
    const parsed = SubmissionResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to update submission status');
    }
    
    return parsed.data;
  },

  /**
   * Withdraw a submission
   */
  async withdrawSubmission(
    submissionId: string,
    request: WithdrawSubmissionRequest
  ): Promise<SubmissionDTO> {
    const response = await apiClient.post(
      `/api/Recruiter/submissions/${submissionId}/withdraw`,
      request
    );
    const parsed = SubmissionResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to withdraw submission');
    }
    
    return parsed.data;
  },

  /**
   * Get all submissions for a specific job
   */
  async getJobSubmissions(jobId: string): Promise<SubmissionDTO[]> {
    const response = await apiClient.get(`/api/Recruiter/submissions/job/${jobId}`);
    const parsed = SubmissionListResponseSchema.parse(response);
    
    if (!parsed.success) {
      throw new Error(parsed.errorMessage || 'Failed to fetch job submissions');
    }
    
    return parsed.data;
  },
};

