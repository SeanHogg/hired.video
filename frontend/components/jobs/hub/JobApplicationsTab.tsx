import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Briefcase, Calendar, Clock, ExternalLink, FileText, MapPin } from "lucide-react";
import { publicJobPath, publicResumePath } from "@shared/public-paths";
import { statusLabelKey } from "@shared/statuses";
import { JOB_APPLICATION_STATUS_COLORS } from "@/lib/constants/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useTimeAgo } from "@/hooks/use-time-ago";
import type { JobApplication } from "./jobs-hub-model";
import { HubEmptyCard, HubListSkeleton } from "./HubTabStates";

interface JobApplicationsTabProps {
  applications: JobApplication[];
  loading: boolean;
  onBrowseJobs: () => void;
}

/** Applications tab body of the /jobs hub. */
export function JobApplicationsTab({ applications, loading, onBrowseJobs }: JobApplicationsTabProps) {
  const { t } = useTranslation();
  const { formatDate, getTimeAgo } = useTimeAgo();

  if (loading) return <HubListSkeleton />;
  if (applications.length === 0) {
    return (
      <HubEmptyCard
        icon={FileText}
        title={t("headings.noApplicationsYet")}
        description={t("messages.noApplicationsDesc")}
        action={<Button onClick={onBrowseJobs}>{t("actions.browseJobs")}</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {applications.map((application) => (
        <Card key={application.id} className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Link
                  to={publicJobPath(application.jobId)}
                  className="text-xl font-semibold hover:text-primary transition-colors flex items-center gap-2"
                >
                  {application.job.title}
                  <ExternalLink className="h-4 w-4" />
                </Link>
                {application.job.company && (
                  <p className="text-muted-foreground flex items-center gap-2 mt-1">
                    <Briefcase className="h-4 w-4" />
                    {application.job.company}
                  </p>
                )}
              </div>
              <Badge
                variant="outline"
                className={JOB_APPLICATION_STATUS_COLORS[application.status] || ""}
              >
                {t(statusLabelKey("application", application.status), { defaultValue: application.status })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
              {application.job.location && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {application.job.location}
                </div>
              )}
              {application.job.employmentType && (
                <Badge variant="secondary">{application.job.employmentType}</Badge>
              )}
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {t("labels.appliedDate", { date: formatDate(application.appliedAt) })}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {getTimeAgo(application.appliedAt)}
              </div>
            </div>

            {application.resume && (
              <div className="mb-4 p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-1">{t("labels.resumeUsed")}</p>
                <Link
                  to={publicResumePath(application.resumeId)}
                  className="text-sm text-primary hover:underline"
                >
                  {application.resume.title}
                </Link>
              </div>
            )}

            {application.coverLetter && (
              <div className="mb-4 p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-1">{t("labels.coverLetterLabel")}</p>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {application.coverLetter}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" size="sm" asChild>
                <Link to={publicJobPath(application.jobId)}>{t("actions.viewJob")}</Link>
              </Button>
              {application.resume && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={publicResumePath(application.resumeId)}>{t("actions.viewResume")}</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
