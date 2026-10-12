/**
 * visibility.ts — single source of truth for a project's
 * Public / Private visual presentation (icon + label + tone).
 *
 * Both the editor's VisibilityChip and the /studio landing card badge
 * resolve their look from this helper so a third visibility state
 * (unlisted, scheduled, etc.) lands in one place.
 */

import { Globe, Lock, Loader2, type LucideIcon } from "lucide-react";

export type VisibilityTone = "public" | "private";

export interface VisibilityVisual {
  Icon: LucideIcon;
  label: string;
  title: string;
  tone: VisibilityTone;
}

export function projectVisibilityVisual(
  isPublic: boolean,
  busy: boolean = false,
): VisibilityVisual {
  if (busy) {
    return {
      Icon: Loader2,
      label: isPublic ? "Public" : "Private",
      title: "Updating visibility…",
      tone: isPublic ? "public" : "private",
    };
  }
  return isPublic
    ? {
        Icon: Globe,
        label: "Public",
        title: "Public — click to make private",
        tone: "public",
      }
    : {
        Icon: Lock,
        label: "Private",
        title: "Private — click to publish",
        tone: "private",
      };
}
