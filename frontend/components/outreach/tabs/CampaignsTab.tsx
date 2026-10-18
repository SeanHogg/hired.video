/**
 * CampaignsTab — Campaign Manager hierarchy + Video/Email campaign lists.
 *
 * The Campaign Manager card is presentational context (cross-links to the
 * surfaces that own each level of the hierarchy today). Video and Email
 * lists reuse the same search+view-toggle shell as Templates/Contacts.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Mail, Megaphone, Plus } from "lucide-react";
import Pagination from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { CampaignManagerCard } from "@/components/outreach/campaigns/CampaignManagerCard";
import { VideoCampaignCard } from "@/components/outreach/campaigns/VideoCampaignCard";
import { EmptyState } from "@/components/outreach/shared/EmptyState";
import { OutreachTabToolbar } from "@/components/outreach/shared/OutreachTabToolbar";
import ViewModeToggle from "@/components/ViewModeToggle";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import { ViewModeList, SCROLL_GRID_LIST_MODES } from "@/components/ViewModeList";
import {
  CampaignList,
  CampaignSizeGroupedList,
  CampaignSizeViewToggle,
  collectCampaignAssets,
  type CampaignViewMode,
  type SizeAwareCampaign,
} from "@/components/campaigns";
import type { CampaignDTO } from "@shared/campaigns";
import type { VideoCampaign } from "@/lib/services/studio-service";

/** Minimal project shape for creative-size lookup (#1133). */
export type CampaignsTabProject = {
  id: string;
  timelineSpec?: unknown;
  imageState?: unknown;
};

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
  /** Studio projects keyed by the campaign `projectIds` — drives the
   *  creative-size matrix / grouped view (#1133). */
  studioProjects?: CampaignsTabProject[];
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
  studioProjects = [],
}: CampaignsTabProps) {
  const { t } = useTranslation();
  const [sizeView, setSizeView] = useState<CampaignViewMode>("list");
  const projectsById = useMemo(() => {
    const map = new Map<string, CampaignsTabProject>();
    for (const project of studioProjects) map.set(project.id, project);
    return map;
  }, [studioProjects]);
  const sizeAwareVideo: SizeAwareCampaign[] = useMemo(
    () =>
      filteredCampaigns.video.map((vc) => ({
        id: vc.id,
        name: vc.name,
        status: vc.status,
        assets: collectCampaignAssets({
          projectIds: vc.projectIds,
          projectsById,
        }),
      })),
    [filteredCampaigns.video, projectsById],
  );
  const assetsByCampaignId = useMemo(() => {
    const map = new Map<string, SizeAwareCampaign["assets"]>();
    for (const campaign of sizeAwareVideo) map.set(campaign.id, campaign.assets);
    return map;
  }, [sizeAwareVideo]);
  const noCampaigns =
    emailCampaigns.length === 0 && videoCampaigns.length === 0;

  return (
    <div className="space-y-6">
      <OutreachTabToolbar
        title={t("outreach.campaignsTab.title")}
        search={{
          placeholder: t("outreach.campaignsTab.searchPlaceholder"),
          value: search,
          onChange: (v) => {
            onSearchChange(v);
            pagination.setCurrentPage(1);
          },
        }}
      >
        <CampaignSizeViewToggle value={sizeView} onChange={setSizeView} />
        {sizeView === "list" && (
          <ViewModeToggle value={viewMode} onChange={onViewModeChange} modes={SCROLL_GRID_LIST_MODES} />
        )}
        <Button onClick={onCreateVideoCampaign}>
          <Plus className="h-4 w-4 mr-2" />
          {t("outreach.campaignsTab.newVideoCampaign")}
        </Button>
      </OutreachTabToolbar>

      {/* Campaign Manager hierarchy card */}
      <CampaignManagerCard onNavigateTo={onNavigateTo} />

      {filteredCampaigns.video.length > 0 && (
        <>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> {t("outreach.campaignsTab.studioCampaigns")}
            <span className="text-xs font-normal text-muted-foreground">
              · {t("outreach.campaignsTab.studioCampaignsHint")}
            </span>
          </h3>
          {sizeView === "grouped" ? (
            <CampaignSizeGroupedList campaigns={sizeAwareVideo} />
          ) : (
          <ViewModeList viewMode={viewMode}>
            {filteredCampaigns.video.map((vc) => (
              <VideoCampaignCard
                key={vc.id}
                campaign={vc}
                viewMode={viewMode}
                assets={assetsByCampaignId.get(vc.id) ?? []}
                onDelete={onDeleteVideoCampaign}
              />
            ))}
          </ViewModeList>
          )}
        </>
      )}

      {filteredCampaigns.email.length > 0 && (
        <>
          <h3 className="text-lg font-semibold flex items-center gap-2 mt-6">
            <Mail className="h-4 w-4" /> {t("outreach.campaignsTab.emailCampaigns")}
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
          title={t("outreach.campaignsTab.emptyTitle")}
          description={t("outreach.campaignsTab.emptyDescription")}
          action={
            <Button onClick={onCreateVideoCampaign}>
              <Plus className="h-4 w-4 mr-2" />
              {t("outreach.campaignsTab.createCampaign")}
            </Button>
          }
        />
      )}
    </div>
  );
}

export default CampaignsTab;
