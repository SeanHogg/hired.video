/**
 * Batch-fetch + classify connection statuses for a list of other users.
 *
 * Returns a stable `Record<userId, ConnectionStatus>` keyed by the *other*
 * user's id. The viewer's own id is filtered out before the request — you
 * cannot have a connection with yourself, and asking burns a round trip.
 * Anonymous viewers get an empty map without hitting the network.
 *
 * Lives here (not inside PeopleCard) because card surfaces render N people
 * at once and we want a single batched request per list, not N per card.
 * Consumers (DiscoverPeopleGrid, the Connections tab on /people) pass the
 * full set of displayed ids and look up by person.id at render time.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { userService } from "@/lib/services/user-service";
import type { ConnectionStatus } from "@/types/people";

export function useConnectionStatuses(
  personIds: string[],
): Record<string, ConnectionStatus> {
  const { isAuthenticated, user } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});

  // Join the ids so the effect re-runs only when the *set* changes — not
  // when the parent re-renders with a fresh-but-equal array reference.
  const idKey = personIds.join(",");

  useEffect(() => {
    if (!isAuthenticated || !user?.id || personIds.length === 0) {
      setStatuses({});
      return;
    }
    const otherIds = personIds.filter((id) => id !== user.id);
    if (otherIds.length === 0) {
      setStatuses({});
      return;
    }

    let cancelled = false;
    userService
      .getConnectionStatuses(otherIds)
      .then((raw) => {
        if (cancelled) return;
        const mapped: Record<string, ConnectionStatus> = {};
        for (const [id, s] of Object.entries(raw)) {
          if (!s.connected) {
            mapped[id] = "none";
          } else if (s.status === "accepted") {
            mapped[id] = "connected";
          } else if (s.status === "pending") {
            mapped[id] =
              s.fromUserId === user.id ? "pending_sent" : "pending_received";
          } else {
            mapped[id] = "none";
          }
        }
        setStatuses(mapped);
      })
      .catch(() => {
        if (!cancelled) setStatuses({});
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id, idKey]);

  return statuses;
}
