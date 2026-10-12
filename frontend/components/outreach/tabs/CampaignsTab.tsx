/**
 * CampaignsTab — Campaign Manager hierarchy + Video/Email campaign lists.
 *
 * The Campaign Manager card is presentational context (cross-links to the
 * surfaces that own each level of the hierarchy today). Video and Email
 * lists reuse the same search+view-toggle shell as Templates/Contacts.
 */
import {
  BarChart3,
  ExternalLink,
  Layers,
  Mail,
  Megaphone,
  Plus,
  Target,
  Trash2,
  Video,
} from "lucide-react";
import { Link } from "react-router-dom";
import Pagination from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/outreach/shared/EmptyState";
import { OutreachTabToolbar } from "@/components/outreach/shared/OutreachTabToolbar";
import ViewModeToggle from "@/components/ViewModeToggle";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import { ViewModeList, SCROLL_GRID_LIST_MODES } from "@/components/ViewModeList";
import { CampaignList } from "@/components/campaigns";
import type { CampaignDTO } from "@shared/campaigns";
import type { VideoCampaign } from "@/lib/services/studio-service";

export interface CampaignsTabProps {
  videoCampaigns: VideoCampaign[];
  emailCampaigns: CampaignDTO[];
  filteredCampaigns: {
    video: VideoCampaign[];
    email: CampaignDTO[];
  };
  totalCampaigns: number;
  search: string;
  onSearchChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  pagination: {
    currentPage: number;
    itemsPerPage: number;
    setCurrentPage: (n: number) => void;
    handleItemsPerPageChange: (n: number) => void;
  };
  onCreateVideoCampaign: () => void;
  onDeleteVideoCampaign: (id: string) => Promise<void>;
  onNavigateTo: (tab: "advertise" | "content" | "performance") => void;
}

export function CampaignsTab({
  videoCampaigns,
  emailCampaigns,
  filteredCampaigns,
  totalCampaigns,
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  pagination,
  onCreateVideoCampaign,
  onDeleteVideoCampaign,
  onNavigateTo,
}: CampaignsTabProps) {
  const noCampaigns =
    emailCampaigns.length === 0 && videoCampaigns.length === 0;

  return (
    <div className="space-y-6">
      <OutreachTabToolbar
        title="Campaigns"
        search={{
          placeholder: "Search campaigns...",
          value: search,
          onChange: (v) => {
            onSearchChange(v);
            pagination.setCurrentPage(1);
          },
        }}
      >
        <ViewModeToggle value={viewMode} onChange={onViewModeChange} modes={SCROLL_GRID_LIST_MODES} />
        <Button onClick={onCreateVideoCampaign}>
          <Plus className="h-4 w-4 mr-2" />
          New Video Campaign
        </Button>
      </OutreachTabToolbar>

      {/* Campaign Manager hierarchy card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Campaign Manager
          </CardTitle>
          <CardDescription>
            Campaign → Ad Set → Ad. Coordinate targeting, creative, and budget across every placement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <HierarchyTile
              tone="purple"
              level="Level 1"
              title="Campaign"
              description="Strategic objective: Awareness, Traffic, Applications, or Employer Brand."
              status="planned"
            />
            <HierarchyTile
              tone="blue"
              level="Level 2"
              title="Ad Set"
              description="Targeting, budget, schedule, bid — today delivered via Job Boosts."
              status="live"
              actionLabel="Manage Boosts →"
              onAction={() => onNavigateTo("advertise")}
            />
            <HierarchyTile
              tone="primary"
              level="Level 3"
              title="Ad creative"
              description="Videos, IAB display banners, social-video ads, and outdoor formats produced in Studio — attached to any campaign below."
              status="live"
              actionLabel="Open Studio →"
              onAction={() => { window.location.href = "/studio"; }}
            />
            <HierarchyTile
              tone="muted"
              level="Analytics"
              title="ROAS Dashboard"
              description="Funnel, cost-per-outcome, cross-channel performance."
              status="live"
              actionLabel="View Performance →"
              onAction={() => onNavigateTo("performance")}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <FeatureBullet
              icon={Target}
              iconClass="text-brand-primary"
              title="Audience Targeting"
              description="Target by role, skills, experience, location, and open-to-work status. Exclude existing applicants."
            />
            <FeatureBullet
              icon={BarChart3}
              iconClass="text-brand-blue"
              title="Bid Strategies"
              description="Manual CPM / CPC or auto-bid to maximise clicks and applications within budget."
            />
            <FeatureBullet
              icon={Mail}
              iconClass="text-primary"
              title="Cross-Channel"
              description="Coordinate paid placements with email outreach sequences in a single unified campaign."
            />
          </div>
        </CardContent>
      </Card>

      {filteredCampaigns.video.length > 0 && (
        <>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Studio Campaigns
            <span className="text-xs font-normal text-muted-foreground">
              · videos, IAB banners, social-ad creatives
            </span>
          </h3>
          <ViewModeList viewMode={viewMode}>
            {filteredCampaigns.video.map((vc) => (
              <Card
                key={vc.id}
                className={viewMode === "list" ? "flex flex-row items-center" : ""}
              >
                {viewMode === "list" ? (
                  <>
                    <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{vc.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {vc.description || "No description"}
                        </p>
                      </div>
                      <div className="hidden md:flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
                        <span>{vc.projectIds.length} asset{vc.projectIds.length === 1 ? "" : "s"}</span>
                        <span>{new Date(vc.createdAt).toLocaleDateString()}</span>
                        <Link
                          to="/studio"
                          className="flex items-center gap-1 text-brand-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Studio
                        </Link>
                      </div>
                      <Badge
                        variant={vc.status === "active" ? "default" : "secondary"}
                        className="flex-shrink-0"
                      >
                        {vc.status}
                      </Badge>
                    </div>
                    <div className="flex-shrink-0 p-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => onDeleteVideoCampaign(vc.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{vc.name}</CardTitle>
                          <CardDescription>
                            {vc.description || "No description"}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={vc.status === "active" ? "default" : "secondary"}
                          >
                            {vc.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => onDeleteVideoCampaign(vc.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <Stat label="Studio assets" value={vc.projectIds.length} />
                        <Stat label="UTM Source" value={vc.utmSource || "—"} />
                        <Stat label="UTM Medium" value={vc.utmMedium || "—"} />
                        <Stat
                          label="Created"
                          value={new Date(vc.createdAt).toLocaleDateString()}
                        />
                      </div>
                      <div className="mt-4 flex items-center justify-end">
                        <Link
                          to="/studio"
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Manage assets in Studio
                        </Link>
                      </div>
                    </CardContent>
                  </>
                )}
              </Card>
            ))}
          </ViewModeList>
        </>
      )}

      {filteredCampaigns.email.length > 0 && (
        <>
          <h3 className="text-lg font-semibold flex items-center gap-2 mt-6">
            <Mail className="h-4 w-4" /> Email Campaigns
          </h3>
          {/* Reuses the same engine-driven <CampaignList> as the SuperAdmin
              manager (string status + real stats + audience) — read-only here,
              no per-row actions (#1970). */}
          <CampaignList campaigns={filteredCampaigns.email} />
        </>
      )}

      {totalCampaigns > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalItems={totalCampaigns}
          itemsPerPage={pagination.itemsPerPage}
          onPageChange={pagination.setCurrentPage}
          onItemsPerPageChange={pagination.handleItemsPerPageChange}
        />
      )}

      {noCampaigns && (
        <EmptyState
          icon={Layers}
          title="No campaigns yet"
          description="Create a video campaign to group and track your published content"
          action={
            <Button onClick={onCreateVideoCampaign}>
              <Plus className="h-4 w-4 mr-2" />
              Create Campaign
            </Button>
          }
        />
      )}
    </div>
  );
}

// ─── Campaign Manager pieces ─────────────────────────────────────────────

type Tone = "purple" | "blue" | "primary" | "muted";

const TONE_CLASSES: Record<Tone, { card: string; label: string }> = {
  purple: {
    card: "border-brand-primary/20 bg-accent/50",
    label: "text-brand-primary",
  },
  blue: {
    card: "border-brand-blue/20 bg-accent/50",
    label: "text-brand-blue",
  },
  primary: {
    card: "border-primary/20 bg-accent/50",
    label: "text-primary",
  },
  muted: {
    card: "border-muted bg-muted/50",
    label: "text-muted-foreground",
  },
};

function HierarchyTile({
  tone,
  level,
  title,
  description,
  status,
  actionLabel,
  onAction,
}: {
  tone: Tone;
  level: string;
  title: string;
  description: string;
  status: "live" | "planned";
  actionLabel?: string;
  onAction?: () => void;
}) {
  const classes = TONE_CLASSES[tone];
  return (
    <div className={`${classes.card} border rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`text-xs font-semibold ${classes.label} uppercase tracking-wide`}>
          {level}
        </div>
        {status === "live" ? (
          <Badge
            className="text-[10px] bg-green-500/10 text-green-700 border-green-200"
            variant="outline"
          >
            Live
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            Planned
          </Badge>
        )}
      </div>
      <div className="font-bold mb-1">{title}</div>
      <div className="text-xs text-muted-foreground mb-2">{description}</div>
      {actionLabel && onAction && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function FeatureBullet({
  icon: Icon,
  iconClass,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} />
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground text-xs mt-0.5">{description}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

export default CampaignsTab;
