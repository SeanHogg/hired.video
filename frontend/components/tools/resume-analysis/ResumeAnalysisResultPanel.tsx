// Full (non-preview) result rendering for ResumeAnalysisToolPage:
// score breakdown, strengths/weaknesses summary, recommendations with
// action buttons, and the optimized draft. Presentational only.

import { CheckCircle2, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RecommendationActionButton } from "@/components/tools/RecommendationActionButton";
import {
  SEVERITY_LABEL_KEYS,
  categoryScoreRows,
  getGradeColor,
  getRecommendationBadgeColor,
  getScoreColor,
  type ResumeAnalysisResult,
} from "./resume-analysis-shared";

interface ResumeAnalysisResultPanelProps {
  result: ResumeAnalysisResult;
  resumeIdForActions: string | undefined;
  onReset: () => void;
  buildReport: (r: ResumeAnalysisResult) => string;
}

export function ResumeAnalysisResultPanel({
  result,
  resumeIdForActions,
  onReset,
  buildReport,
}: ResumeAnalysisResultPanelProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* Score header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("toolSteps.analysis.scoreBreakdown")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-center p-4 bg-muted rounded-xl">
              <div
                className={`font-display text-4xl font-bold tracking-tight ${getScoreColor(result.overallScore)}`}
              >
                {result.overallScore}
              </div>
              {result.grade && (
                <div
                  className={`inline-flex items-center mt-2 px-3 py-1 rounded-full text-lg font-semibold ${getGradeColor(result.grade)}`}
                >
                  {result.grade}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2">{t("metrics.overallScore")}</p>
            </div>

            <ResumeAnalysisCategoryBars result={result} />
          </div>
        </CardContent>
      </Card>

      {/* Strengths + weaknesses (Scorer-style) — self-gated */}
      {(result.strengths?.length || result.weaknesses?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("headings.analysisSummary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.strengths?.length ? (
              <div>
                <h4 className="font-semibold text-brand-green-text mb-2">
                  {t("headings.strengths")}
                </h4>
                <ul className="space-y-1">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-brand-green-text mt-1" aria-hidden="true">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.weaknesses?.length ? (
              <div>
                <h4 className="font-semibold text-destructive mb-2">
                  {t("headings.areasForImprovement")}
                </h4>
                <ul className="space-y-1">
                  {result.weaknesses.map((w, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-destructive mt-1" aria-hidden="true">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Recommendations + Action buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("headings.recommendations")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {result.recommendations.map((rec, index) => {
              const severity = rec.severity ?? rec.category;
              const severityKey = severity ? SEVERITY_LABEL_KEYS[severity] : undefined;
              return (
                <div key={index} className="border border-border rounded-xl p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h4 className="font-semibold">{rec.title}</h4>
                    {severity && (
                      <Badge
                        variant="secondary"
                        className={getRecommendationBadgeColor(severity)}
                      >
                        {severityKey ? t(severityKey) : severity}
                      </Badge>
                    )}
                    {typeof rec.impact !== "undefined" && (
                      <Badge variant="outline" className="text-xs">
                        {t("toolSteps.analysis.impactValue", {
                          value:
                            typeof rec.impact === "number" ? `${rec.impact}/10` : rec.impact,
                        })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                  <RecommendationActionButton recommendation={rec} resumeId={resumeIdForActions} />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 mt-6">
            <Button variant="outline" className="min-h-11" onClick={onReset}>
              {t("toolSteps.analysis.runAnother")}
            </Button>
            <Button
              onClick={() => navigator.clipboard.writeText(buildReport(result))}
              variant="outline"
              className="min-h-11"
            >
              {t("actions.copyReport")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Optimized rewrite — self-gates on presence */}
      {result.optimizedContent ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("toolSteps.analysis.optimizedDraft")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap bg-muted rounded-xl p-3 max-h-96 overflow-y-auto">
              {result.optimizedContent}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function ResumeAnalysisCategoryBars({ result }: { result: ResumeAnalysisResult }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {categoryScoreRows(result).map((row) => (
        <div key={row.labelKey}>
          <div className="flex justify-between text-sm mb-1">
            <span>{t(row.labelKey)}</span>
            <span className={`font-mono ${getScoreColor(row.score)}`}>{row.score}%</span>
          </div>
          <Progress value={row.score} className="h-2" />
        </div>
      ))}
    </div>
  );
}
