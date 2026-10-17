import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { companyService } from "@/lib/services/company-service";
import { REREAD_ON_MOUNT, useViewerId, type ViewerQueryOptions } from "./use-viewer-id";

/** Companies the viewer owns (`GET /api/companies/me`), keyed
 *  `["my-companies", userId]`. Disabled while signed out. */
export function useMyCompanies(options: ViewerQueryOptions = {}) {
  const userId = useViewerId();
  return useQuery({
    queryKey: queryKeys.myCompanies.byUser(userId),
    queryFn: () => companyService.getMyCompanies(),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: REREAD_ON_MOUNT,
  });
}
