/**
 * Partner Admin Service (SuperAdmin)
 *
 * Governance surface for partner-platform access: list requests, approve /
 * reject pending ones, and suspend / activate existing partners. Uses the
 * standard authenticated `apiClient` (SuperAdmin JWT) + `{ success, data }`.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import {
  PartnerViewSchema,
  type PartnerView,
  type PartnerStatus,
} from "./partner-account-service";

const PartnersListSchema = z.object({
  partners: z.array(PartnerViewSchema),
});
const PartnerWrapperSchema = z.object({ partner: PartnerViewSchema });

/** Loose shape — connection rows are only rendered for reference in admin. */
export const PartnerConnectionRowSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    status: z.string(),
    scopes: z.array(z.string()).optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();
export type PartnerConnectionRow = z.infer<typeof PartnerConnectionRowSchema>;

const ConnectionsResponseSchema = z.object({
  connections: z.array(PartnerConnectionRowSchema),
});

export class PartnerAdminService {
  /** List partner requests/records, optionally filtered by status. */
  async listPartners(status?: PartnerStatus): Promise<PartnerView[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await apiClient.get(
      `/api/admin/partners${qs}`,
      PartnersListSchema,
    );
    return response.data.partners;
  }

  async approve(id: string): Promise<PartnerView> {
    const response = await apiClient.post(
      `/api/admin/partners/${id}/approve`,
      {},
      PartnerWrapperSchema,
    );
    return response.data.partner;
  }

  async reject(id: string): Promise<PartnerView> {
    const response = await apiClient.post(
      `/api/admin/partners/${id}/reject`,
      {},
      PartnerWrapperSchema,
    );
    return response.data.partner;
  }

  async suspend(id: string): Promise<PartnerView> {
    const response = await apiClient.post(
      `/api/admin/partners/${id}/suspend`,
      {},
      PartnerWrapperSchema,
    );
    return response.data.partner;
  }

  async activate(id: string): Promise<PartnerView> {
    const response = await apiClient.post(
      `/api/admin/partners/${id}/activate`,
      {},
      PartnerWrapperSchema,
    );
    return response.data.partner;
  }

  async listConnections(id: string): Promise<PartnerConnectionRow[]> {
    const response = await apiClient.get(
      `/api/admin/partners/${id}/connections`,
      ConnectionsResponseSchema,
    );
    return response.data.connections;
  }
}

export const partnerAdminService = new PartnerAdminService();
export default partnerAdminService;
