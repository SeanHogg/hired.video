/**
 * relative-time — shared, crash-safe wrapper around date-fns'
 * `formatDistanceToNow`. Returns "" for a missing/invalid timestamp instead of
 * throwing, so list rows never blow up on a malformed `updatedAt`. Used by the
 * review surfaces (Communication Hub inbox, per-resume feedback-session
 * manager) and any other "… ago" label.
 */
import { formatDistanceToNow } from "date-fns";

export function safeRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
