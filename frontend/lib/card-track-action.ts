import { Bookmark, BookmarkCheck } from "lucide-react";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface TrackActionOptions {
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
 * Tracked / Saved / Followed state of a content item. Uses the Bookmark icon
 * pair (outline / filled) that was historically rendered in the top-right of
 * JobCard — the icon moves down into the action row so every content type
 * exposes tracking the same way.
 *
 * Wire it up per-card type (save job, follow company, track resume, etc.) by
 * supplying the right `onToggle` handler.
 */
export function buildTrackAction({
  isTracked,
  onToggle,
  trackLabel = "Track",
  trackedLabel = "Tracked",
  disabled,
}: TrackActionOptions): DynamicCardAction {
  return {
    id: isTracked ? "untrack" : "track",
    label: isTracked ? trackedLabel : trackLabel,
    variant: isTracked ? "secondary" : "outline",
    icon: isTracked ? BookmarkCheck : Bookmark,
    onClick: onToggle,
    disabled,
  };
}
