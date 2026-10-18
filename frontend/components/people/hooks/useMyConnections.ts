import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { userService, type PublicUser } from "@/lib/services/user-service";
import { useConnectionStatuses } from "@/lib/use-connection-statuses";
import type { ConnectionStatus, UserWithOwnership } from "@/types/people";
import { toTrackedPerson } from "@/components/people/people-helpers";

/**
 * The viewer's accepted connections for the Connections tab (#802), backed by
 * /me/connections/cards, plus their batched connection statuses and the
 * (not-yet-backed) track / untrack placeholders.
 */
export function useMyConnections(user: { id: string } | null) {
  const userId = user?.id ?? null;
  const { t } = useTranslation();
  const [myConnections, setMyConnections] = useState<PublicUser[]>([]);

  // Self-contained: clears when signed out, refetches on sign-in.
  useEffect(() => {
    if (!user) {
      setMyConnections([]);
      return;
    }
    let cancelled = false;
    userService
      .getMyConnectionCards()
      .then((cards) => {
        if (!cancelled) setMyConnections(cards);
      })
      .catch((err) => console.error("Failed to load connections:", err));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // DiscoverPeopleGrid owns its own batched fetch for the Browse tab. Shared
  // hook is the single source of truth for the request + status mapping.
  const trackedIds = useMemo(
    () => (user ? myConnections.map((p) => p.id) : []),
    [user, myConnections],
  );
  const connectionStatuses = useConnectionStatuses(trackedIds);
  const getConnectionStatus = (personId: string): ConnectionStatus =>
    connectionStatuses[personId] ?? "none";

  const tracked: UserWithOwnership[] = myConnections.map((person) =>
    toTrackedPerson(person, t),
  );

  // TODO: Implement API calls to track / untrack a person when backend supports it
  // (could use userService.followUser / unfollowUser).
  const handleTrackPerson = (personId: string) => {
    if (userId) console.log(`Track person ${personId} for user ${userId}`);
  };
  const handleUntrackPerson = (personId: string) => {
    if (userId) console.log(`Untrack person ${personId} for user ${userId}`);
  };

  return { tracked, getConnectionStatus, handleTrackPerson, handleUntrackPerson };
}
