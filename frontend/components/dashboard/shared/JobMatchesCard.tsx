import React from "react";
import { Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface JobMatch {
  jobId: string;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  salary?: string;
}

interface JobMatchesCardProps {
  matches?: JobMatch[];
  loading?: boolean;
  maxItems?: number;
}

export function JobMatchesCard({ matches, loading = false, maxItems = 4 }: JobMatchesCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {t("headings.jobMatches")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          {t("headings.jobMatches")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matches && matches.length > 0 ? (
          <div className="space-y-3">
            {matches.slice(0, maxItems).map((job, index) => (
              <div
                key={job.jobId || index}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{job.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {job.company} &bull; {job.location}
                  </div>
                  {job.salary && (
                    <div className="text-xs text-brand-green-text">{job.salary}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-primary">
                    {job.matchScore}%
                  </div>
                  <div className="text-xs text-muted-foreground">{t("labels.match")}</div>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" asChild>
              <Link to="/jobs">{t("actions.viewAllMatches")}</Link>
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t("messages.noJobMatches")}</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/jobs">{t("actions.findJobs")}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default JobMatchesCard;
