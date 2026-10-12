// Non-result right-column cards for ResumeAnalysisToolPage: the free-tier
// preview (score + grade + teaser + upgrade link) and the empty state.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getGradeColor, getScoreColor, type ResumeAnalysisResult } from "./resume-analysis-shared";

export function ResumeAnalysisProPreviewCard({ result }: { result: ResumeAnalysisResult }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-3">
        <div
          className={`font-display text-5xl font-bold tracking-tight ${getScoreColor(result.overallScore)}`}
        >
          {result.overallScore}
        </div>
        {result.grade && (
          <div
            className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-semibold ${getGradeColor(result.grade)}`}
          >
            {result.grade}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {result.teaserRecommendation
            ? t("toolSteps.analysis.teaser", { title: result.teaserRecommendation.title })
            : t("toolSteps.analysis.upgradeToSeeBreakdown")}
        </p>
        {result.upgradeUrl && (
          <Button asChild className="min-h-11">
            <a href={result.upgradeUrl}>{t("toolSteps.analysis.upgradeForFullResults")}</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ResumeAnalysisEmptyStateCard({
  icon,
  title,
  blurb,
  bullets,
}: {
  icon: ReactNode;
  title: string;
  blurb: string;
  bullets: string[];
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 flex items-center justify-center rounded-xl bg-accent text-primary">
          {icon}
        </div>
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{blurb}</p>
        <div className="text-left bg-muted rounded-xl p-4 mt-4">
          <h4 className="font-medium mb-2">{t("headings.whatYoullGet")}</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            {bullets.map((b, i) => (
              <li key={i}>• {b}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
