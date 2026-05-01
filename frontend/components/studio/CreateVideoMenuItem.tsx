/**
 * CreateVideoMenuItem — drop-in `<DropdownMenuItem>` that deep-links into
 * Studio with a subject pre-bound. Used by every entity action menu
 * (Resume, Profile, Job, Company, Skills Demo) so the label + link
 * formatting stays in lockstep with the EntityVideos scroller.
 *
 * Per the DRY rule: callers don't compute the URL or label themselves —
 * pass the subject and trust the component.
 */

import { Video } from "lucide-react";
import { Link } from "react-router-dom";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  formatStudioSubject,
  STUDIO_SUBJECT_LABEL,
  type StudioSubject,
} from "@shared/studio-subject";

interface Props {
  subject: StudioSubject;
  /** Force a brand-new video session even when the entity already has one. */
  forceNew?: boolean;
}

export default function CreateVideoMenuItem({ subject, forceNew = false }: Props) {
  const href = `/studio?subject=${formatStudioSubject(subject)}${forceNew ? "&new=1" : ""}`;
  return (
    <DropdownMenuItem asChild>
      <Link to={href} className="cursor-pointer">
        <Video className="w-4 h-4 mr-2" />
        {STUDIO_SUBJECT_LABEL[subject.kind]}
      </Link>
    </DropdownMenuItem>
  );
}
