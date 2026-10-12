/**
 * LockedAccountBadge — drop-in indicator for any admin surface that
 * lists users (user table rows, profile headers, search results).
 *
 * Self-gates twice:
 *   • Returns null when the caller is not a SuperAdmin
 *   • Returns null when the target user is not currently locked
 *
 * The hosting component does NOT pass a `locked` or `canShow` prop;
 * the badge fetches its own status from
 * /api/admin/security/locked-accounts/:userId/status. That keeps the
 * lock-display logic in one place — same source of truth that
 * LockedAccountsPanel uses.
 */

import { Badge } from "@/components/ui/badge";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import { useAccountLockStatus } from "@/hooks/use-account-lock-status";

type Props = {
  userId: string;
  className?: string;
};

export function LockedAccountBadge({ userId, className }: Props) {
  if (!isSuperAdminFromToken()) return null;
  return <LockedAccountBadgeInner userId={userId} className={className} />;
}

function LockedAccountBadgeInner({ userId, className }: Props) {
  const { status, loading } = useAccountLockStatus(userId);
  if (loading || !status?.locked) return null;
  return (
    <Badge variant="destructive" className={className} title={status.reason ?? "Locked"}>
      Locked
    </Badge>
  );
}
