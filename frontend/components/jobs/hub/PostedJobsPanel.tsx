import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Briefcase, Plus } from "lucide-react";
import JobCard from "@/components/JobCard";
import { AppEmptyState } from "@/components/app/AppEmptyState";
import { Button } from "@/components/ui/button";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";
import type { JobSummary } from "@/lib/services/job-service";
import { isOwnedBy, toPostedJobCardMetadata, type JobDialogTarget } from "./jobs-hub-model";
import type { JobMenuHandlers } from "./hooks/useJobOwnerActions";

interface PostedJobsPanelProps {
  jobs: JobSummary[];
  userId: string;
  menuHandlersFor: (job: JobDialogTarget) => JobMenuHandlers;
}

/** "Posted" tab of the /jobs hub (hiring side). Displays owned jobs from the
 *  public-jobs grid filtered to this user. The full company-scoped query
 *  lives in #401 — until that backend filter ships, fall back to the
 *  ownership marker on the existing payload. */
export function PostedJobsPanel({ jobs, userId, menuHandlersFor }: PostedJobsPanelProps) {
  const { t } = useTranslation();
  const owned = jobs.filter((j) => isOwnedBy(j, userId));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Briefcase className="h-5 w-5" />
        {t("headings.jobs.myPostings")}
      </h2>
      {owned.length === 0 ? (
        <AppEmptyState
          icon={Briefcase}
          title={t("headings.jobs.noPostingsYet")}
          description={t("messages.jobs.postFirstJobDesc")}
          action={
            <Button asChild>
              <Link to={studioNewEntityHref("job")}>
                <Plus className="h-4 w-4 mr-2" />
                {t("actions.postJob")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {owned.map((job) => (
            <JobCard
              key={job.id}
              job={toPostedJobCardMetadata(job)}
              showOwnership
              {...menuHandlersFor({ id: job.id, title: job.title })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
