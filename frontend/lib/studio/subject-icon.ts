/**
 * subject-icon — single mapping from a `StudioSubjectKind` to its
 * canonical lucide icon. Used by:
 *   • The active-project subject chip (StudioSidebar Recent row)
 *   • Future surfaces that need to render the subject visually next to
 *     a video reference (search result tile, profile feed card, etc.)
 *
 * Lives here (frontend) instead of in `shared/studio-subject.ts`
 * because lucide icons are React components — they can't cross the
 * shared/api boundary. The labels + hrefs that ARE plain values stay
 * in the shared module.
 */

import {
  Award,
  Briefcase,
  Building2,
  FileText,
  Monitor,
  Newspaper,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import type { StudioSubjectKind } from "@shared/studio-subject";

const SUBJECT_ICON: Record<StudioSubjectKind, LucideIcon> = {
  resume:         FileText,
  profile:        UserCircle,
  job:            Briefcase,
  company:        Building2,
  skills_demo:    Monitor,
  article:        Newspaper,
  creator_credit: Award,
};

export function getStudioSubjectIcon(kind: StudioSubjectKind): LucideIcon {
  return SUBJECT_ICON[kind];
}
