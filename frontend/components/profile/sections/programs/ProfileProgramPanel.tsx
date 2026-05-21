// Single dispatch point — `<ProfileProgramPanel program="..." />` picks
// the right per-program panel. Centralised here so the PeopleDetail page
// doesn't carry a parallel switch statement and so every program panel
// has the same prop contract (`userId`, `isOwner`).
//
// Each per-program panel self-fetches + self-gates (loading / empty
// state) — consumers only provide identity, not "canShow" booleans.

import ProfileServicesPanel from "@/components/profile/sections/ProfileServicesPanel";
import {
  CREATOR_PROGRAMS,
  CREATOR_PROGRAM_LABEL,
  CREATOR_PROGRAM_ICON,
  type CreatorProgram,
} from "@/lib/services/creator-service";
import type { ServiceOffering } from "@/lib/services/services-service";

import ProfileArticlesPanel from "./ProfileArticlesPanel";
import ProfileCoursesPanel from "./ProfileCoursesPanel";
import ProfileVideoPanel from "./ProfileVideoPanel";
import ProfileVoicePanel from "./ProfileVoicePanel";
import EmptyProgramState from "./EmptyProgramState";

/** Re-export so PageHeader tab-strip consumers don't reach across
 *  creator-service AND this module. PROGRAM_ICON keeps the legacy alias
 *  for the public-profile callsite — the SSoT is CREATOR_PROGRAM_ICON. */
export {
  CREATOR_PROGRAMS,
  CREATOR_PROGRAM_LABEL,
  CREATOR_PROGRAM_ICON as PROGRAM_ICON,
};
export type { CreatorProgram };

interface Props {
  program: CreatorProgram;
  userId: string;
  isOwner: boolean;
  providerFirstName?: string;
  /** Services-only handlers — ignored by other programs. The cart / quote
   *  flow lives at the page level today so the services panel still hands
   *  them up. */
  onAddServiceToCart?: (svc: ServiceOffering) => void;
  onRequestServiceQuote?: (svc: ServiceOffering) => void;
}

export default function ProfileProgramPanel({
  program,
  userId,
  isOwner,
  providerFirstName,
  onAddServiceToCart,
  onRequestServiceQuote,
}: Props) {
  switch (program) {
    case "video":
      return <ProfileVideoPanel userId={userId} isOwner={isOwner} />;
    case "voice":
      return <ProfileVoicePanel userId={userId} isOwner={isOwner} />;
    case "articles":
      return <ProfileArticlesPanel userId={userId} isOwner={isOwner} />;
    case "courses":
      return <ProfileCoursesPanel userId={userId} isOwner={isOwner} />;
    case "services":
      return (
        <ProfileServicesPanel
          userId={userId}
          isOwner={isOwner}
          providerFirstName={providerFirstName}
          onAddToCart={onAddServiceToCart}
          onRequestQuote={onRequestServiceQuote}
        />
      );
    case "templates":
      // No dedicated ProfileTemplatesPanel yet — render the shared empty
      // state so the tab body still has a CTA for owners and an empty
      // card for visitors. See gap register entry for the real panel.
      return <EmptyProgramState program="templates" isOwner={isOwner} />;
  }
}
