/**
 * Services Marketplace API client
 * Covers service offerings, lead inquiries, and the provider toggle.
 */

import { apiClient } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceOffering {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  category: string | null;
  /** null when priceVisible=false and fetched via /public/ endpoint */
  priceCents: number | null;
  priceVisible: boolean;
  isActive: boolean;
  deliveryDays: number | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInquiry {
  id: string;
  serviceId: string;
  fromUserId: string;
  providerId: string;
  message: string | null;
  status: "pending" | "accepted" | "rejected" | "completed";
  orderType: "inquiry" | "purchase";
  paidAmountCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface InquiryWithDetails {
  inquiry: ServiceInquiry;
  service: { id: string; title: string; priceCents: number };
  buyer: { id: string; name: string; email: string };
}

export interface MyRequestWithDetails {
  inquiry: ServiceInquiry;
  service: { id: string; title: string; priceCents: number; priceVisible: boolean };
  provider: { id: string; name: string };
}

export type CreateServiceInput = {
  title: string;
  description?: string;
  category?: string;
  priceCents: number;
  priceVisible: boolean;
  deliveryDays?: number;
  imageUrl?: string;
};

// ---------------------------------------------------------------------------
// My Services (provider CRUD)
// ---------------------------------------------------------------------------

export const servicesService = {
  /** List own service offerings */
  async listMyServices(): Promise<ServiceOffering[]> {
    const res = await apiClient.get<ServiceOffering[]>("/api/services");
    return (res as any).data ?? [];
  },

  /** Create a new service offering */
  async createService(input: CreateServiceInput): Promise<ServiceOffering> {
    const res = await apiClient.post<ServiceOffering>("/api/services", input);
    return (res as any).data;
  },

  /** Update an existing service offering */
  async updateService(id: string, patch: Partial<CreateServiceInput> & { isActive?: boolean }): Promise<ServiceOffering> {
    const res = await apiClient.put<ServiceOffering>(`/api/services/${id}`, patch);
    return (res as any).data;
  },

  /** Delete a service offering */
  async deleteService(id: string): Promise<void> {
    await apiClient.delete(`/api/services/${id}`);
  },

  /** Toggle providesServices on own profile */
  async toggleProvideServices(providesServices: boolean): Promise<void> {
    await apiClient.patch("/api/services/toggle", { providesServices });
  },

  // -------------------------------------------------------------------------
  // Public profile services (anyone can call)
  // -------------------------------------------------------------------------

  /** List active services for a public user profile */
  async getPublicServices(userId: string): Promise<ServiceOffering[]> {
    const res = await apiClient.get<ServiceOffering[]>(`/api/services/public/${userId}`);
    return (res as any).data ?? [];
  },

  // -------------------------------------------------------------------------
  // Inquiries (provider view)
  // -------------------------------------------------------------------------

  /** List incoming inquiries/leads for own services */
  async listInquiries(): Promise<InquiryWithDetails[]> {
    const res = await apiClient.get<InquiryWithDetails[]>("/api/services/inquiries");
    return (res as any).data ?? [];
  },

  /** Update inquiry status (provider only) */
  async updateInquiryStatus(
    id: string,
    status: "accepted" | "rejected" | "completed",
  ): Promise<ServiceInquiry> {
    const res = await apiClient.patch<ServiceInquiry>(`/api/services/inquiries/${id}`, { status });
    return (res as any).data;
  },

  // -------------------------------------------------------------------------
  // My Requests (buyer view)
  // -------------------------------------------------------------------------

  /** List inquiries/purchases I submitted */
  async listMyRequests(): Promise<MyRequestWithDetails[]> {
    const res = await apiClient.get<MyRequestWithDetails[]>("/api/services/my-requests");
    return (res as any).data ?? [];
  },

  // -------------------------------------------------------------------------
  // Submit inquiry or purchase intent
  // -------------------------------------------------------------------------

  /** Submit an inquiry (price hidden) or a purchase intent (price visible) */
  async submitInquiry(
    serviceId: string,
    body: { message?: string; orderType: "inquiry" | "purchase" },
  ): Promise<ServiceInquiry> {
    const res = await apiClient.post<ServiceInquiry>(
      `/api/services/${serviceId}/inquire`,
      body,
    );
    return (res as any).data;
  },
};
