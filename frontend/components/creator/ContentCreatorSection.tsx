import { Video } from "lucide-react";
import CreatorWorkspace, { type CreatorWorkspaceTab } from "@/components/creator/CreatorWorkspace";
import type { CreatorProfile } from "@/lib/services/creator-service";
import type { ServiceOffering } from "@/lib/services/services-service";

interface Props {
  onProfileChange?: (next: CreatorProfile | null) => void;
  /** Creator profile (null when not enrolled). Forwarded to the Offerings sub-tab. */
  profile?: CreatorProfile | null;
  /** Services list — pass through to enable the Offerings sub-tab. Omit on /settings. */
  services?: ServiceOffering[];
  servicesLoading?: boolean;
  setServices?: React.Dispatch<React.SetStateAction<ServiceOffering[]>>;
  defaultTab?: CreatorWorkspaceTab;
}

/**
 * Single source of truth for the Content Creator section. Composes the header
 * and the tabbed workspace (Offerings / Profile / Marketplace Earnings /
 * Payouts / Portfolio / Account). Mounted on /services (with the Offerings
 * sub-tab wired up) and on /settings (Content Creator → Account sidebar item,
 * without Offerings — services management belongs to /services). Inner forms
 * self-gate on enrollment, so this can be rendered unconditionally.
 */
export default function ContentCreatorSection({
  onProfileChange,
  profile,
  services,
  servicesLoading,
  setServices,
  defaultTab,
}: Props = {}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Video className="h-5 w-5 text-pink-500" />
        Content Creator
      </h2>
      <CreatorWorkspace
        onProfileChange={onProfileChange}
        profile={profile}
        services={services}
        servicesLoading={servicesLoading}
        setServices={setServices}
        defaultTab={defaultTab}
      />
    </div>
  );
}
