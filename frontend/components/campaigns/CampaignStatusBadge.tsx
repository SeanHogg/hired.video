/**
 * CampaignStatusBadge — single source of truth for how a campaign status is
 * rendered, shared by the Outreach list and the SuperAdmin manager so the two
 * never colour the same status differently.
 */
import { Badge } from "@/components/ui/badge";
import {
  CAMPAIGN_STATUS_LABELS,
  type CampaignStatus,
} from "@shared/campaigns";

const TONE: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground border-transparent",
  scheduled: "bg-blue-500/10 text-blue-700 border-blue-200",
  sending: "bg-amber-500/10 text-amber-700 border-amber-200",
  sent: "bg-green-500/10 text-green-700 border-green-200",
  paused: "bg-orange-500/10 text-orange-700 border-orange-200",
  cancelled: "bg-red-500/10 text-red-700 border-red-200",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant="outline" className={TONE[status] ?? ""}>
      {CAMPAIGN_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export default CampaignStatusBadge;
