/**
 * /superadmin/ads — Internal Growth wrapper around PaidMediaPage (#986).
 *
 * The customer-facing /settings/ads route mounts <PaidMediaPage /> directly
 * and reads the workspace from ?workspace= (defaulting to "personal"). On the
 * internal route that default is WRONG: it would surface the calling
 * SuperAdmin's PERSONAL ad connections rather than hired.video's own house
 * ad accounts.
 *
 * To fix it without forking canActFor() (no 4th workspace kind — see #975),
 * we fetch the reserved HOUSE_USER_ID from the SA-only /house-config endpoint
 * and pass forceWorkspace={{ kind: 'delegated', subjectUserId: HOUSE_USER_ID }}.
 * That same endpoint provisions the SA's active workspace_grants row, so every
 * downstream paid-media write authorizes through the existing delegated path.
 *
 * When HOUSE_USER_ID is unset (e.g. the house account hasn't been seeded), the
 * page degrades gracefully to the normal personal-workspace behaviour.
 */

import { useQuery } from "@tanstack/react-query";
import { paidMediaService } from "@/lib/services/paid-media-service";
import PaidMediaPage from "./PaidMediaPage";

export default function SuperAdminPaidMediaPage() {
  const houseQ = useQuery({
    queryKey: ["paid-media", "house-config"],
    queryFn: () => paidMediaService.getHouseConfig(),
    staleTime: 5 * 60_000,
  });

  // Until the house config resolves, render nothing rather than briefly
  // binding the SA's personal workspace.
  if (houseQ.isLoading) {
    return <div className="py-8 px-4 text-sm text-muted-foreground">Loading…</div>;
  }

  const houseUserId = houseQ.data?.houseUserId ?? null;

  return (
    <PaidMediaPage
      title="Paid Media (Internal Growth)"
      forceWorkspace={
        houseUserId
          ? { kind: "delegated", subjectUserId: houseUserId }
          : undefined
      }
    />
  );
}
