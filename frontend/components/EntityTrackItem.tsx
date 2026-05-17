// EntityTrackItem — the "Save / Unsave" (or "Track / Untrack",
// "Follow / Unfollow") dropdown row shared by every entity-action menu
// (resume, job, company, person).
//
// Self-gating per the standing DRY rule:
//   - reads `useAuth` itself, so unauthenticated viewers never see the
//     row at all (tracking is an authenticated-only affordance)
//   - returns null when the viewer owns the entity or no `onTrack` handler
//     is wired up
//   - parents pass the labels for their entity ("Save Job" / "Unsave Job",
//     "Track Resume" / "Untrack Resume", etc.) so no entity-specific
//     branching leaks into this component

import { Bookmark, BookmarkCheck } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

export interface EntityTrackItemProps {
  isOwner?: boolean;
  isTracked?: boolean;
  onTrack?: () => void;
  /** Label shown when not yet tracked (e.g. "Save Job", "Track Resume"). */
  trackLabel: string;
  /** Label shown when already tracked (e.g. "Unsave Job", "Untrack Resume"). */
  trackedLabel: string;
}

export function EntityTrackItem({
  isOwner = false,
  isTracked = false,
  onTrack,
  trackLabel,
  trackedLabel,
}: EntityTrackItemProps): JSX.Element | null {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated || isOwner || !onTrack) return null;
  return (
    <DropdownMenuItem onClick={onTrack}>
      {isTracked
        ? <><BookmarkCheck className="w-4 h-4 mr-2" />{trackedLabel}</>
        : <><Bookmark className="w-4 h-4 mr-2" />{trackLabel}</>}
    </DropdownMenuItem>
  );
}
