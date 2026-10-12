import { Bookmark, BookmarkCheck } from "lucide-react";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface TrackActionOptions {
  /** Whether the viewer is currently signed in. Tracking is an
   *  authenticated-only affordance — unauthenticated viewers get `null` so
   *  the menu collapses to Share-only. */
  isAuthenticated: boolean;
  /** Whether the viewer owns this entity. Owners never track their own
   *  content; callers don't have to remember to gate this themselves. */
  isOwn?: boolean;
  isTracked: boolean;
  onToggle: (event: React.MouseEvent) => void;
  /** Label shown on the button when not yet tracked. Defaults to "Track". */
  trackLabel?: string;
  /** Label shown on the button when already tracked. Defaults to "Tracked". */
  trackedLabel?: string;
  disabled?: boolean;
}

/**
 * Returns a `DynamicCardAction` for the bottom action panel that toggles the
 * Tracked / Saved / Followed state of a content item, or `null` when the
 * affordance shouldn't be offered at all (unauthenticated viewer, or the
 * viewer owns the entity). Self-gating per the standing DRY rule — callers
 * just filter falsy entries from the action array.
 *
 * Wire it up per-card type (save job, follow company, track resume, etc.) by
 * supplying the right `onToggle` handler.
 */
export function buildTrackAction({
  isAuthenticated,
  isOwn = false,
  isTracked,
  onToggle,
  trackLabel = "Track",
  trackedLabel = "Tracked",
  disabled,
}: TrackActionOptions): DynamicCardAction | null {
  if (!isAuthenticated || isOwn) return null;
  return {
    id: isTracked ? "untrack" : "track",
    label: isTracked ? trackedLabel : trackLabel,
    variant: isTracked ? "secondary" : "outline",
    icon: isTracked ? BookmarkCheck : Bookmark,
    onClick: onToggle,
    disabled,
  };
}
