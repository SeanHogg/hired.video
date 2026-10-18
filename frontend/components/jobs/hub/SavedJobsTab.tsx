import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bookmark, Briefcase, Clock, DollarSign, MapPin, Trash2 } from "lucide-react";
import { publicJobPath } from "@shared/public-paths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useTimeAgo } from "@/hooks/use-time-ago";
import type { SavedJob } from "./jobs-hub-model";
import { HubEmptyCard, HubListSkeleton } from "./HubTabStates";

interface SavedJobsTabProps {
  savedJobs: SavedJob[];
  loading: boolean;
  onUnsave: (jobId: string) => void;
  onBrowseJobs: () => void;
}

/** Saved Jobs tab body of the /jobs hub. */
export function SavedJobsTab({ savedJobs, loading, onUnsave, onBrowseJobs }: SavedJobsTabProps) {
  const { t } = useTranslation();
  const { formatDate } = useTimeAgo();

  if (loading) return <HubListSkeleton />;
  if (savedJobs.length === 0) {
    return (
      <HubEmptyCard
        icon={Bookmark}
        title={t("headings.noSavedJobsYet")}
        description={t("messages.jobs.noSavedJobsDesc")}
        action={<Button onClick={onBrowseJobs}>{t("actions.browseJobs")}</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {savedJobs.map((savedJob) => {
        const salary =
          savedJob.salaryMin && savedJob.salaryMax
            ? `$${savedJob.salaryMin.toLocaleString()} - $${savedJob.salaryMax.toLocaleString()}`
            : savedJob.salaryMin
              ? t("labels.jobs.salaryFromAmount", { amount: savedJob.salaryMin.toLocaleString() })
              : savedJob.salaryMax
                ? t("labels.jobs.salaryUpToAmount", { amount: savedJob.salaryMax.toLocaleString() })
                : null;
        return (
          <Card key={savedJob.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <Link
                    to={publicJobPath(savedJob.id)}
                    className="text-xl font-semibold hover:text-primary transition-colors"
                  >
                    {savedJob.title}
                  </Link>
                  {savedJob.company && (
                    <p className="text-muted-foreground flex items-center gap-2 mt-1">
                      <Briefcase className="h-4 w-4" />
                      {savedJob.company}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onUnsave(savedJob.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 mb-4">
                {savedJob.location && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {savedJob.location}
                  </div>
                )}
                {salary && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    {salary}
                  </div>
                )}
                {savedJob.employmentType && (
                  <Badge variant="secondary">{savedJob.employmentType}</Badge>
                )}
              </div>

              {savedJob.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {savedJob.description}
                </p>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {t("labels.savedDate", { date: formatDate(savedJob.createdAt ?? savedJob.postedDate ?? "") })}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={publicJobPath(savedJob.id)}>{t("actions.viewDetailsAdmin")}</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to={publicJobPath(savedJob.id)}>{t("actions.applyNow")}</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
