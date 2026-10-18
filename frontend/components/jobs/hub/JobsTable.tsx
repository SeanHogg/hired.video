import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Clock, Eye, MapPin } from "lucide-react";
import { publicJobPath } from "@shared/public-paths";
import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import { Button } from "@/components/ui/button";
import { useTimeAgo } from "@/hooks/use-time-ago";
import type { JobSummary } from "@/lib/services/job-service";

// Dense rows-and-columns view for the Jobs browse surface — mirrors
// ResumeOwnedTable so the Scroll / Grid / Table trio stays visually
// consistent across browse pages. The job link reuses JobCard's default
// navigation target (`/jobs/:id`).
export function JobsTable({ jobs }: { jobs: JobSummary[] }) {
  const { t } = useTranslation();
  const { formatDate } = useTimeAgo();
  return (
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.title", "Title")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.company", "Company")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.location", "Location")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.type", "Type")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.posted", "Posted")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className="border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="px-3 py-2">
                <Link
                  to={publicJobPath(job.id)}
                  className="font-medium hover:text-brand-primary"
                >
                  {job.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {job.company || "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {job.isRemote ? (
                    <>
                      <Building2 className="h-3.5 w-3.5" />
                      {t("labels.remote", "Remote")}
                    </>
                  ) : job.location ? (
                    <>
                      <MapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {job.employmentType ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {job.employmentType}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {job.postedDate ? formatDate(job.postedDate) : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={publicJobPath(job.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {t("actions.view", "View")}
                    </Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
