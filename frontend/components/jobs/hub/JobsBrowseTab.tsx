import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import JobCard from "@/components/JobCard";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { AppEmptyState } from "@/components/app/AppEmptyState";
import Pagination from "@/components/Pagination";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import { Button } from "@/components/ui/button";
import type { JobSummary } from "@/lib/services/job-service";
import { toBrowseJobCardMetadata, type JobDialogTarget } from "./jobs-hub-model";
import type { JobMenuHandlers } from "./hooks/useJobOwnerActions";
import type { JobsBrowseState } from "./hooks/useJobsBrowse";
import { JobsTable } from "./JobsTable";

interface JobsBrowseTabProps {
  browse: JobsBrowseState;
  menuHandlersFor: (job: JobDialogTarget) => JobMenuHandlers;
}

/** All Available Jobs — header omitted; the inline PageHeader search slot
 *  already labels this surface as "Jobs". Owned jobs surface in this grid via
 *  the per-row Edit affordance (ownership marker on the public-jobs payload);
 *  the dedicated "Your Job Postings" / "Tracked Jobs" groups were removed in
 *  #396 because they hung off a wiring that never ran. */
export function JobsBrowseTab({ browse, menuHandlersFor }: JobsBrowseTabProps) {
  const { t } = useTranslation();
  const {
    jobs,
    displayedJobs,
    listMembership,
    isLoading,
    error,
    totalJobs,
    fetchJobs,
    clearFilters,
    viewMode,
    pagination: { currentPage, itemsPerPage, setCurrentPage, handleItemsPerPageChange },
  } = browse;

  // One card definition shared by the Scroll and Grid views so the full
  // handler wiring lives in a single place (Table renders its own dense rows).
  const renderJobCard = (job: JobSummary) => (
    <JobCard
      key={job.id}
      job={toBrowseJobCardMetadata(job)}
      extraMenuItems={
        <AddToListMenu
          entityType="job"
          entityId={job.id}
          entityLabel={job.title}
        />
      }
      {...menuHandlersFor({ id: job.id, title: job.title })}
    />
  );

  return (
    <div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-muted rounded-lg h-48" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={fetchJobs}>{t("actions.tryAgainCapital")}</Button>
        </div>
      ) : displayedJobs.length === 0 ? (
        <AppEmptyState
          icon={Search}
          title={
            listMembership
              ? t("messages.jobs.noJobsInList")
              : t("messages.jobs.noJobsFound")
          }
          action={
            <Button onClick={clearFilters}>
              {t("actions.clearFilters")}
            </Button>
          }
        />
      ) : (
        viewMode === "table" ? (
          <JobsTable jobs={displayedJobs} />
        ) : viewMode === "scroll" ? (
          <HorizontalScroller itemCount={displayedJobs.length}>
            {displayedJobs.map((job) => (
              <Fragment key={job.id}>{renderJobCard(job)}</Fragment>
            ))}
          </HorizontalScroller>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedJobs.map((job) => renderJobCard(job))}
          </div>
        )
      )}

      {/* Pagination */}
      {!isLoading && !error && jobs.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalJobs}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      )}
    </div>
  );
}
