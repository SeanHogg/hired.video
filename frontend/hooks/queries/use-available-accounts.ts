import { useQuery } from "@tanstack/react-query";
import { useApiReady } from "@/lib/auth";
import { queryKeys } from "@/lib/query-keys";
import { accountService } from "@/lib/services/account-service";
import { useViewerId } from "./use-viewer-id";

/** Accounts the viewer can switch into, keyed `["accounts-available", userId]`.
 *  Seeded by /api/bootstrap, so the switcher paints without a round-trip.
 *  Waits for api-ready (auth + verified) — the endpoint requires both. */
export function useAvailableAccounts() {
  const userId = useViewerId();
  const apiReady = useApiReady();
  return useQuery({
    queryKey: queryKeys.accountsAvailable.byUser(userId),
    queryFn: () => accountService.getAvailableAccounts(),
    enabled: apiReady && !!userId,
  });
}
