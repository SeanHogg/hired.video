import { Video } from "lucide-react";
import CreatorWorkspace from "@/components/creator/CreatorWorkspace";
import CreatorTemplateEarnings from "@/components/studio/shared/CreatorTemplateEarnings";
import type { CreatorProfile } from "@/lib/services/creator-service";

interface Props {
  onProfileChange?: (next: CreatorProfile | null) => void;
}

/**
 * Single source of truth for the Content Creator section. Composes the header,
 * the tabbed workspace (Profile / Payouts / Portfolio / Account) and the
 * template-earnings card. Mounted on /services (dashboard) and on /settings
 * (Content Creator → Account sidebar item). Inner forms self-gate on
 * enrollment, so this can be rendered unconditionally on /settings.
 */
export default function ContentCreatorSection({ onProfileChange }: Props = {}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Video className="h-5 w-5 text-pink-500" />
        Content Creator
      </h2>
      <CreatorWorkspace onProfileChange={onProfileChange} />
      <CreatorTemplateEarnings />
    </div>
  );
}
