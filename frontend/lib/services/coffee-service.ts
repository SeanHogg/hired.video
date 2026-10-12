/**
 * Coffee service — typed client for `/api/coffee/*`.
 *
 * Backend gates the create call on the recipient's `openToCoffee` profile
 * section, so the frontend MUST also self-gate the CTA based on the same
 * section state to keep the UX in sync (no rendering a button that 403s).
 */
import { apiClient } from "@/lib/api-client";
import type {
  CreateCoffeeRequestInput,
  RespondCoffeeRequestInput,
  CoffeeStatus,
  CoffeeFormat,
} from "@shared/coffee";

export interface CoffeeRequest {
  id: string;
  requesterUserId: string;
  recipientUserId: string;
  message: string | null;
  proposedAt: string | null;
  proposedLocation: string | null;
  proposedFormat: CoffeeFormat;
  status: CoffeeStatus;
  respondedAt: string | null;
  responseMessage: string | null;
  acceptedEventId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptCoffeeResult {
  request: CoffeeRequest;
  eventId: string;
  taskId: string;
}

export const coffeeService = {
  async incoming(status: CoffeeStatus | "all" = "pending"): Promise<CoffeeRequest[]> {
    const qs = status === "all" ? "" : `?status=${status}`;
    const res = await apiClient.get<CoffeeRequest[]>(`/api/coffee/incoming${qs}`);
    return res.data ?? [];
  },

  async outgoing(status?: CoffeeStatus): Promise<CoffeeRequest[]> {
    const qs = status ? `?status=${status}` : "";
    const res = await apiClient.get<CoffeeRequest[]>(`/api/coffee/outgoing${qs}`);
    return res.data ?? [];
  },

  async create(input: CreateCoffeeRequestInput): Promise<CoffeeRequest> {
    const res = await apiClient.post<CoffeeRequest>(`/api/coffee`, input);
    return res.data;
  },

  async respond(
    id: string,
    input: RespondCoffeeRequestInput,
  ): Promise<AcceptCoffeeResult | CoffeeRequest> {
    const res = await apiClient.patch<AcceptCoffeeResult | CoffeeRequest>(
      `/api/coffee/${id}`,
      input,
    );
    return res.data;
  },

  async cancel(id: string): Promise<void> {
    await apiClient.post(`/api/coffee/${id}/cancel`, {});
  },
};
