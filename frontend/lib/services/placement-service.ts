import { z } from "zod";
import { apiClient } from "@/lib/api-client";

// Zod schemas for type-safe API responses
const PlacementDTOSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  recruiterUserId: z.string(),
  recruiterName: z.string(),
  candidateUserId: z.string(),
  candidateName: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  startDate: z.string(),
  annualSalary: z.number(),
  commissionPercentage: z.number(),
  commissionAmount: z.number(),
  commissionStatus: z.string(),
  commissionPaidDate: z.string().nullable(),
  paymentReference: z.string().nullable(),
  guaranteePeriodDays: z.number().nullable(),
  guaranteeEndDate: z.string().nullable(),
  guaranteeMetStatus: z.boolean().nullable(),
  notes: z.string().nullable(),
  placedAt: z.string(),
  updatedAt: z.string(),
});

const CommissionSummaryDTOSchema = z.object({
  totalEarned: z.number(),
  totalPending: z.number(),
  totalPaid: z.number(),
  totalPlacements: z.number(),
  placementsThisMonth: z.number(),
  placementsThisYear: z.number(),
  averagePlacementValue: z.number(),
});

const PlacementResponseSchema = z.object({
  success: z.boolean(),
  data: PlacementDTOSchema.nullable(),
  errorMessage: z.string().nullable(),
  errorCode: z.string().nullable(),
});

const PlacementListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(PlacementDTOSchema).nullable(),
  errorMessage: z.string().nullable(),
  errorCode: z.string().nullable(),
});

const CommissionSummaryResponseSchema = z.object({
  success: z.boolean(),
  data: CommissionSummaryDTOSchema.nullable(),
  errorMessage: z.string().nullable(),
  errorCode: z.string().nullable(),
});

// TypeScript types
export type PlacementDTO = z.infer<typeof PlacementDTOSchema>;
export type CommissionSummaryDTO = z.infer<typeof CommissionSummaryDTOSchema>;

export interface RecordPlacementRequest {
  submissionId: string;
  startDate: string;
  annualSalary: number;
  commissionPercentage: number;
  guaranteePeriodDays?: number;
  notes?: string;
}

export interface UpdateCommissionStatusRequest {
  status: string; // Pending, Paid, Cancelled
  paidDate?: string;
  paymentReference?: string;
}

export interface UpdateGuaranteeStatusRequest {
  guaranteeMet: boolean;
  notes?: string;
}

export interface PlacementFilters {
  jobId?: string;
  candidateUserId?: string;
  commissionStatus?: string;
  placedAfter?: string;
  placedBefore?: string;
  guaranteeMetOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export const placementService = {
  async recordPlacement(request: RecordPlacementRequest): Promise<PlacementDTO> {
    const response = await apiClient.post('/api/Recruiter/placements', request);
    const parsed = PlacementResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to record placement');
    }
    
    return parsed.data;
  },

  async getPlacements(filters?: PlacementFilters): Promise<PlacementDTO[]> {
    const params = new URLSearchParams();
    if (filters?.jobId) params.append('jobId', filters.jobId);
    if (filters?.candidateUserId) params.append('candidateUserId', filters.candidateUserId);
    if (filters?.commissionStatus) params.append('commissionStatus', filters.commissionStatus);
    if (filters?.placedAfter) params.append('placedAfter', filters.placedAfter);
    if (filters?.placedBefore) params.append('placedBefore', filters.placedBefore);
    if (filters?.guaranteeMetOnly !== undefined) params.append('guaranteeMetOnly', String(filters.guaranteeMetOnly));
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));

    const queryString = params.toString();
    const url = `/api/Recruiter/placements${queryString ? `?${queryString}` : ''}`;
    
    const response = await apiClient.get(url);
    const parsed = PlacementListResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to get placements');
    }
    
    return parsed.data;
  },

  async getPlacementById(id: string): Promise<PlacementDTO> {
    const response = await apiClient.get(`/api/Recruiter/placements/${id}`);
    const parsed = PlacementResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to get placement');
    }
    
    return parsed.data;
  },

  async updateCommissionStatus(id: string, request: UpdateCommissionStatusRequest): Promise<PlacementDTO> {
    const response = await apiClient.put(`/api/Recruiter/placements/${id}/commission`, request);
    const parsed = PlacementResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to update commission status');
    }
    
    return parsed.data;
  },

  async updateGuaranteeStatus(id: string, request: UpdateGuaranteeStatusRequest): Promise<PlacementDTO> {
    const response = await apiClient.put(`/api/Recruiter/placements/${id}/guarantee`, request);
    const parsed = PlacementResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to update guarantee status');
    }
    
    return parsed.data;
  },

  async getCommissionSummary(): Promise<CommissionSummaryDTO> {
    const response = await apiClient.get('/api/Recruiter/placements/summary/commission');
    const parsed = CommissionSummaryResponseSchema.parse(response);
    
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.errorMessage || 'Failed to get commission summary');
    }
    
    return parsed.data;
  },
};

