/**
 * CommHubProvider — single source of truth for the UNFILTERED Communication
 * Hub data (`/api/inbox` with no query params).
 *
 * Several surfaces care about the same unfiltered aggregate:
 *   • Header bell badge + Popover/Sheet body (`CommunicationHub`)
 *   • Outreach page header tab badge + `DashboardTab` metric tiles
 *   • Popover-mode `InboxPanel` (header dropdown body)
 *
 * Before this provider, each surface called `useCommHub()` directly, so a
 * user landing on `/outreach?tab=inbox` issued 3+ concurrent `GET /api/inbox`
 * requests on mount and again every 35 s poll tick. The `InboxTab` keeps
 * its own filter-aware hub on top — that one query is intentional because
 * the filter chips must not pollute the badge/dashboard view.
 *
 * Sharing happens via React Context: the provider mounts ONE `useCommHub()`
 * instance and consumers read through `useSharedCommHub()`. Gating is
 * unchanged — the underlying hook still short-circuits on
 * `useApiReady()`/SignalR so we never fire requests for anonymous users.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useCommHub, type UseCommHubReturn } from "@/hooks/use-comm-hub";

const CommHubContext = createContext<UseCommHubReturn | null>(null);

export function CommHubProvider({ children }: { children: ReactNode }) {
  const hub = useCommHub();
  return (
    <CommHubContext.Provider value={hub}>{children}</CommHubContext.Provider>
  );
}

/** Read the shared unfiltered Communication Hub. Throws if used outside the
 *  provider so we never silently fall back to a duplicate `useCommHub()`
 *  instance — the dedup is the whole point. */
export function useSharedCommHub(): UseCommHubReturn {
  const ctx = useContext(CommHubContext);
  if (!ctx) {
    throw new Error(
      "useSharedCommHub must be used within <CommHubProvider />. Mount the provider in App.tsx.",
    );
  }
  return ctx;
}
