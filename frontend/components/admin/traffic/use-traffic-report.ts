// One query per (report, window) for the admin Traffic view. The trend and
// sources cards share the traffic query, so react-query fetches it once.

import { useQuery } from "@tanstack/react-query";
import { usageService } from "@/lib/services/usage-service";
import type { TrafficWindowDays } from "@shared/usage";

const STALE_MS = 60_000;

export function useTrafficReport(days: TrafficWindowDays) {
  return useQuery({
    queryKey: ["admin", "usage", "traffic", days],
    queryFn: () => usageService.adminTraffic(days),
    staleTime: STALE_MS,
  });
}

export function useFunnelReport(funnelId: string, days: TrafficWindowDays) {
  return useQuery({
    queryKey: ["admin", "usage", "funnel", funnelId, days],
    queryFn: () => usageService.adminFunnel(funnelId, days),
    staleTime: STALE_MS,
  });
}

export function useApiHealthReport() {
  return useQuery({
    queryKey: ["admin", "usage", "api-health"],
    queryFn: () => usageService.adminApiHealth(),
    staleTime: STALE_MS,
  });
}
