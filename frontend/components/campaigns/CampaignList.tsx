/**
 * CampaignList — the reusable email-campaign list. Renders a campaign's name,
 * status, audience and delivery stats. Both surfaces use it:
 *   • Outreach CampaignsTab — read-only (no actions).
 *   • SuperAdmin manager    — passes `renderActions` for schedule/pause/etc.
 *
 * Self-contained presentation: stats + audience come straight off CampaignDTO,
 * so a consumer never recomputes them. Per the DRY rule, this replaces the
 * bespoke email-campaign card markup that used to live in CampaignsTab.
 */
import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { describeAudience, type CampaignDTO } from "@shared/campaigns";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

export interface CampaignListProps {
  campaigns: CampaignDTO[];
  /** Per-row action buttons (SuperAdmin manager). Omit for a read-only list. */
  renderActions?: (campaign: CampaignDTO) => ReactNode;
  onOpen?: (campaign: CampaignDTO) => void;
  emptyState?: ReactNode;
}

export function CampaignList({
  campaigns,
  renderActions,
  onOpen,
  emptyState,
}: CampaignListProps) {
  if (campaigns.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <div className="space-y-3">
      {campaigns.map((c) => (
        <Card key={c.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div
                className={onOpen ? "min-w-0 cursor-pointer" : "min-w-0"}
                onClick={() => onOpen?.(c)}
              >
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{c.name}</span>
                </CardTitle>
                <CardDescription className="truncate">
                  {c.description || c.subject}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CampaignStatusBadge status={c.status} />
                {renderActions?.(c)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <Stat label="Recipients" value={c.stats.total} />
              <Stat label="Sent" value={c.stats.sent} />
              <Stat label="Opened" value={c.stats.opened} />
              <Stat label="Failed" value={c.stats.failed} />
              <Stat label="Audience" value={describeAudience(c.audience)} />
            </div>
            {(c.scheduledAt || c.sentAt) && (
              <p className="text-xs text-muted-foreground mt-3">
                {c.sentAt
                  ? `Sent ${new Date(c.sentAt).toLocaleString()}`
                  : c.scheduledAt
                    ? `Scheduled ${new Date(c.scheduledAt).toLocaleString()}`
                    : null}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium truncate">{value}</p>
    </div>
  );
}

export default CampaignList;
