import { apiClient } from "@/lib/api-client";
import { z } from "zod";

// ============================================================================
// SCHEMAS
// ============================================================================

export const TalentPoolEntrySchema = z.object({
  id: z.string(),
  recruiterUserId: z.string(),
  candidateUserId: z.string(),
  candidateName: z.string(),
  candidateEmail: z.string().optional(),
  candidateTitle: z.string().optional(),
  candidateProfilePicture: z.string().optional(),
  relationshipStrength: z.string(),
  tags: z.array(z.string()),
  poolName: z.string().optional(),
  status: z.string(),
  notes: z.string().optional(),
  currentCompany: z.string().optional(),
  currentTitle: z.string().optional(),
  desiredSalary: z.number().optional(),
  preferredLocations: z.string().optional(),
  lastContactedAt: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
  contactFrequency: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const InteractionSchema = z.object({
  id: z.string(),
  talentPoolId: z.string(),
  interactionType: z.string(),
  subject: z.string().optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
  interactionDate: z.string(),
  durationMinutes: z.number().optional(),
  requiresFollowUp: z.boolean(),
  followUpDate: z.string().optional(),
  createdAt: z.string(),
});

export type TalentPoolEntry = z.infer<typeof TalentPoolEntrySchema>;
export type Interaction = z.infer<typeof InteractionSchema>;

export interface AddToTalentPoolRequest {
  candidateUserId: string;
  relationshipStrength?: string;
  tags?: string[];
  poolName?: string;
  status?: string;
  notes?: string;
  currentCompany?: string;
  currentTitle?: string;
  desiredSalary?: number;
  preferredLocations?: string;
  contactFrequency?: string;
  nextFollowUpAt?: string;
}

export interface UpdateTalentPoolRequest {
  relationshipStrength?: string;
  tags?: string[];
  poolName?: string;
  status?: string;
  notes?: string;
  currentCompany?: string;
  currentTitle?: string;
  desiredSalary?: number;
  preferredLocations?: string;
  contactFrequency?: string;
  nextFollowUpAt?: string;
  lastContactedAt?: string;
}

export interface AddInteractionRequest {
  talentPoolId: string;
  interactionType: string;
  subject?: string;
  notes?: string;
  outcome?: string;
  interactionDate?: string;
  durationMinutes?: number;
  requiresFollowUp?: boolean;
  followUpDate?: string;
}

export interface TalentPoolFilters {
  poolName?: string;
  status?: string;
  relationshipStrength?: string;
  tags?: string;
  requiresFollowUp?: boolean;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// RECRUITER SERVICE
// ============================================================================

class RecruiterService {
  /**
   * Add a candidate to the talent pool
   */
  async addToTalentPool(
    request: AddToTalentPoolRequest
  ): Promise<TalentPoolEntry> {
    const response = await apiClient.post<TalentPoolEntry>(
      "/api/recruiter/talent-pool",
      request,
      TalentPoolEntrySchema
    );
    return response.data;
  }

  /**
   * Get recruiter's talent pool with optional filtering
   */
  async getTalentPool(
    filters?: TalentPoolFilters
  ): Promise<TalentPoolEntry[]> {
    const params = new URLSearchParams();
    if (filters?.poolName) params.append("poolName", filters.poolName);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.relationshipStrength)
      params.append("relationshipStrength", filters.relationshipStrength);
    if (filters?.tags) params.append("tags", filters.tags);
    if (filters?.requiresFollowUp !== undefined)
      params.append("requiresFollowUp", String(filters.requiresFollowUp));
    if (filters?.searchTerm) params.append("searchTerm", filters.searchTerm);
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.pageSize) params.append("pageSize", String(filters.pageSize));

    const queryString = params.toString();
    const endpoint = queryString
      ? `/api/recruiter/talent-pool?${queryString}`
      : "/api/recruiter/talent-pool";

    const response = await apiClient.get<TalentPoolEntry[]>(
      endpoint,
      z.array(TalentPoolEntrySchema)
    );
    return response.data;
  }

  /**
   * Get a specific talent pool entry
   */
  async getTalentPoolEntry(id: string): Promise<TalentPoolEntry> {
    const response = await apiClient.get<TalentPoolEntry>(
      `/api/recruiter/talent-pool/${id}`,
      TalentPoolEntrySchema
    );
    return response.data;
  }

  /**
   * Update a talent pool entry
   */
  async updateTalentPoolEntry(
    id: string,
    request: UpdateTalentPoolRequest
  ): Promise<TalentPoolEntry> {
    const response = await apiClient.put<TalentPoolEntry>(
      `/api/recruiter/talent-pool/${id}`,
      request,
      TalentPoolEntrySchema
    );
    return response.data;
  }

  /**
   * Remove a candidate from the talent pool
   */
  async removeFromTalentPool(id: string): Promise<void> {
    await apiClient.delete(`/api/recruiter/talent-pool/${id}`);
  }

  /**
   * Add an interaction note to a candidate
   */
  async addInteraction(request: AddInteractionRequest): Promise<Interaction> {
    const response = await apiClient.post<Interaction>(
      "/api/recruiter/interactions",
      request,
      InteractionSchema
    );
    return response.data;
  }

  /**
   * Get interaction history for a candidate
   */
  async getInteractions(talentPoolId: string): Promise<Interaction[]> {
    const response = await apiClient.get<Interaction[]>(
      `/api/recruiter/interactions/${talentPoolId}`,
      z.array(InteractionSchema)
    );
    return response.data;
  }

  /**
   * Check if a candidate is in the recruiter's talent pool
   */
  async checkInTalentPool(candidateUserId: string): Promise<boolean> {
    try {
      const response = await apiClient.get<boolean>(
        `/api/recruiter/talent-pool/check/${candidateUserId}`
      );
      return response.data;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const recruiterService = new RecruiterService();
export default recruiterService;

