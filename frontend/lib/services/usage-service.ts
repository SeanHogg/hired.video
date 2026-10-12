/**
 * Usage Service (admin reads) — presence + per-feature usage for the staff
 * "active now / engage" surface and the usage→access hints in
 * /admin/role-access (#2045-2046). Wire shapes come from @shared/usage.
 */
import { apiClient } from "../api-client";
import type { ActiveSessionDto, FunnelReportDto, TrafficReportDto, TrafficWindowDays } from "@shared/usage";
import type { ApiHealthReport } from "@shared/observability";

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

  async adminTraffic(days: TrafficWindowDays): Promise<TrafficReportDto | null> {
    const res = await apiClient.get<TrafficReportDto>(`/api/admin/usage/traffic?days=${days}`);
    return res.data ?? null;
  }

  async adminFunnel(funnelId: string, days: TrafficWindowDays): Promise<FunnelReportDto | null> {
    const res = await apiClient.get<FunnelReportDto>(
      `/api/admin/usage/funnels/${encodeURIComponent(funnelId)}?days=${days}`,
    );
    return res.data ?? null;
  }

  async adminApiHealth(): Promise<ApiHealthReport | null> {
    const res = await apiClient.get<ApiHealthReport>("/api/admin/usage/api-health");
    return res.data ?? null;
  }

  async adminEraseVisitor(visitorId: string): Promise<void> {
    await apiClient.delete(`/api/admin/usage/visitor/${encodeURIComponent(visitorId)}`);
  }
}

export const usageService = new UsageService();
