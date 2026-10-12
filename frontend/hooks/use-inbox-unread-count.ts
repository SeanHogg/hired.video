/**
 * useInboxUnreadCount — the unread figure shown on the avatar badge and on the
 * Inbox menu row. One hook so both read the SAME shared hub (no second
 * /api/inbox poll) and can never disagree.
 *
 * Returns 0 for anonymous visitors and whenever the hub isn't mounted, so
 * callers can render a badge unconditionally.
 */
import { useAuth } from "@/lib/auth";
import { useSharedCommHub } from "@/providers/CommHubProvider";

export function useInboxUnreadCount(): number {
  const { isAuthenticated } = useAuth();
  const hub = useSharedCommHub();
  return isAuthenticated ? hub.unreadCount : 0;
}
