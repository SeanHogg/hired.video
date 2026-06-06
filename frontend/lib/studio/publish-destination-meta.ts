/**
 * Per-destination presentation metadata for the Studio publish surfaces.
 *
 * Kept here (frontend-only) rather than in `@shared/media-kinds` because the
 * icons are lucide components — a frontend dependency. ONE record drives both
 * the Save menu's publish rows (StudioSaveMenuV2) AND the "Published to" list
 * (PublishedToList), so the two surfaces can't drift on icon/label per the
 * standing DRY rule.
 */
import {
  Copy,
  Share2,
  Upload,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import {
  PUBLISH_DESTINATIONS,
  type PublishDestinationId,
} from "@shared/media-kinds";

/** Icon per publish destination. */
export const DESTINATION_ICON: Record<PublishDestinationId, LucideIcon> = {
  youtube:                Upload,
  linkedin:               Share2,
  profile:                UserCheck,
  rss:                    Upload,
  "apple-podcasts":       Upload,
  "spotify-creators":     Upload,
  "voice-marketplace":    Share2,
  "profile-audio-embed":  UserCheck,
  giphy:                  Share2,
  tenor:                  Share2,
  "r2-host":              Share2,
  "itch-io":              Upload,
  "github-pages":         Upload,
  "game-web-embed":       Share2,
  "comic-reader":         UserCheck,
  "webtoon-feed":         Upload,
  "tapas-feed":           Upload,
  "profile-gallery":      UserCheck,
  "asset-library":        UserCheck,
  "cad-gallery":          UserCheck,
  "cad-asset-library":    UserCheck,
  "course-lesson":        Upload,
};

/** Fallback icon for any destination id not in the map (defensive — keeps the
 *  list rendering if a server-recorded destination predates the icon entry). */
export const DESTINATION_ICON_FALLBACK: LucideIcon = Copy;

const LABEL_BY_ID = new Map<string, string>(
  PUBLISH_DESTINATIONS.map((d) => [d.id, d.label]),
);

/** Human label for a destination id (e.g. "youtube" → "YouTube"). Falls back
 *  to the raw id so an unknown/legacy destination still renders something. */
export function destinationLabel(id: string): string {
  return LABEL_BY_ID.get(id) ?? id;
}

/** Icon for a destination id, with a safe fallback. */
export function destinationIcon(id: string): LucideIcon {
  return DESTINATION_ICON[id as PublishDestinationId] ?? DESTINATION_ICON_FALLBACK;
}
