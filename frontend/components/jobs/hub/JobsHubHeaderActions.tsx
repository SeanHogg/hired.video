import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidatesHeaderActions } from "@/components/recruit/CandidatesPanel";
import ListsButton from "@/components/lists/ListsButton";
import LocationFilterButton from "@/components/location/LocationFilterButton";
import SectorFilterButton from "@/components/sector/SectorFilterButton";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";
import type { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import type { JobsHubTab } from "./jobs-hub-model";
import type { JobsBrowseState } from "./hooks/useJobsBrowse";

type CompanyScope = ReturnType<typeof useCurrentCompanyScope>;

interface JobsHubHeaderActionsProps {
  effectiveTab: JobsHubTab;
  canManageJobs: boolean;
  candidates: CompanyScope;
  onCandidatesImported: () => void;
  browse: JobsBrowseState;
}

/** PageHeader actions slot for the /jobs hub: Post Job, the lifted
 *  Candidates company picker/import controls, and the browse filters. */
export function JobsHubHeaderActions({
  effectiveTab,
  canManageJobs,
  candidates,
  onCandidatesImported,
  browse,
}: JobsHubHeaderActionsProps) {
  const { t } = useTranslation();
  return (
    <>
      {canManageJobs && (
        <Button asChild>
          <Link to={studioNewEntityHref("job")}>
            <Plus className="h-4 w-4 mr-2" />
            {t("actions.postJob")}
          </Link>
        </Button>
      )}
      {effectiveTab === "candidates" && canManageJobs && (
        <CandidatesHeaderActions
          scope={candidates.scope}
          companyId={candidates.companyId}
          onCompanyChange={candidates.setCompanyId}
          onImported={onCandidatesImported}
        />
      )}
      {effectiveTab === "jobs" && (
        <>
          <SectorFilterButton
            value={browse.sectorFilter}
            onChange={browse.handleSectorFilterChange}
          />
          <LocationFilterButton
            value={browse.geoFilter}
            onChange={browse.handleGeoFilterChange}
          />
          <ViewModeToggle
            value={browse.viewMode}
            onChange={browse.setViewMode}
            modes={BROWSE_VIEW_MODES}
          />
          <ListsButton entityType="job" />
        </>
      )}
    </>
  );
}
