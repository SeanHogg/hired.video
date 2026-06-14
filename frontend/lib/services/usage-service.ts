/**
 * Usage Service (admin reads) — presence + per-feature usage for the staff
 * "active now / engage" surface and the usage→access hints in
 * /admin/role-access (#2045-2046). Wire shapes come from @shared/usage.
 */
import { apiClient } from "../api-client";
import type { ActiveSessionDto } from "@shared/usage";

class UsageService {
  async adminActive(): Promise<ActiveSessionDto[]> {
    const res = await apiClient.get<{ sessions: ActiveSessionDto[] }>(
      "/api/admin/usage/active",
    );
    return res.data?.sessions ?? [];
  }

  async adminFeatureUsage(role: string): Promise<Record<string, number>> {
    const res = await apiClient.get<{ role: string; usage: Record<string, number> }>(
      `/api/admin/usage/feature-usage?role=${encodeURIComponent(role)}`,
    );
    return res.data?.usage ?? {};
  }

  async adminEraseVisitor(visitorId: string): Promise<void> {
    await apiClient.delete(`/api/admin/usage/visitor/${encodeURIComponent(visitorId)}`);
  }
}

export const usageService = new UsageService();
