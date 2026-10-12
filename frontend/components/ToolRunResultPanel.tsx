// Generic result panel for any resume-input tool. Every tool normalises
// its response into NormalizedToolRunResult (see lib/resume-tools/types.ts)
// so this one component can render the score view, the summary view, the
// recommendation view, or any subset of those, for every tool.

import { AlertTriangle, CheckCircle2, Copy, TrendingUp } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import { SEVERITY_LABEL_KEYS } from "@/components/tools/resume-analysis/resume-analysis-shared";

interface Props {
  result: NormalizedToolRunResult;
  toolLabel: string;
  onCopyReport?: () => void;
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-brand-green-text";
  if (score >= 70) return "text-amber-600";
  return "text-destructive";
}

function gradeChipColor(grade?: string): string {
  if (!grade) return "text-muted-foreground bg-muted";
  const g = grade.toLowerCase();
  if (g.startsWith("a") || g === "positive") return "text-brand-green-text bg-brand-green/15";
  if (g.startsWith("b") || g === "neutral") return "text-primary bg-accent";
  if (g.startsWith("c")) return "text-amber-600 bg-amber-100";
  return "text-destructive bg-destructive/10";
}

function recommendationIcon(category?: string) {
  switch (category) {
    case "critical":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />;
    case "important":
      return <TrendingUp className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />;
    default:
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />;
  }
}

function recommendationBadgeColor(category?: string): string {
  switch (category) {
    case "critical":
      return "bg-destructive/10 text-destructive";
    case "important":
      return "bg-amber-100 text-amber-800";
    case "minor":
      return "bg-accent text-accent-foreground";
    default:
      return "bg-muted text-foreground";
  }
}

function defaultCopyReport(
  toolLabel: string,
  result: NormalizedToolRunResult,
  t: TFunction,
): string {
  const lines: string[] = [t("toolSteps.panel.reportTitle", { name: toolLabel }), ""];
  if (typeof result.overallScore === "number") lines.push(`${t("metrics.overallScore")}: ${result.overallScore}${result.grade ? ` (${result.grade})` : ""}`);
  if (result.categoryScores?.length) {
    lines.push("", `${t("toolSteps.panel.scores")}:`);
    for (const c of result.categoryScores) lines.push(`- ${c.label}: ${c.score}%`);
  }
  if (result.summary) lines.push("", `${t("toolSteps.panel.summary")}:`, result.summary);
  if (result.strengths?.length) {
    lines.push("", `${t("headings.strengths")}:`);
    for (const s of result.strengths) lines.push(`- ${s}`);
  }
  if (result.weaknesses?.length) {
    lines.push("", `${t("headings.areasForImprovement")}:`);
    for (const w of result.weaknesses) lines.push(`- ${w}`);
  }
  if (result.recommendations?.length) {
    lines.push("", `${t("headings.recommendations")}:`);
    for (const r of result.recommendations) lines.push(`- ${r.title}${r.description ? `: ${r.description}` : ""}`);
  }
  if (result.extras?.length) {
    lines.push("", `${t("labels.details")}:`);
    for (const e of result.extras) lines.push(`- ${e.label}: ${e.value}`);
  }
  return lines.join("\n");
}

export function ToolRunResultPanel({ result, toolLabel, onCopyReport }: Props) {
  const { t } = useTranslation();
  const hasCategoryScores = (result.categoryScores?.length ?? 0) > 0;
  const hasStrengths = (result.strengths?.length ?? 0) > 0;
  const hasWeaknesses = (result.weaknesses?.length ?? 0) > 0;
  const hasRecommendations = (result.recommendations?.length ?? 0) > 0;
  const hasExtras = (result.extras?.length ?? 0) > 0;

  const handleCopy = () => {
    if (onCopyReport) return onCopyReport();
    navigator.clipboard.writeText(defaultCopyReport(toolLabel, result, t));
  };

  return (
    <div className="space-y-4">
      {(typeof result.overallScore === "number" || hasCategoryScores) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("toolSteps.panel.toolScores", { name: toolLabel })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {typeof result.overallScore === "number" && (
              <div className="text-center p-6 rounded-xl bg-muted">
                <div className={`font-display text-5xl font-bold tracking-tight mb-1 ${scoreColor(result.overallScore)}`}>
                  {Math.round(result.overallScore)}
                </div>
                {result.grade && (
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-semibold ${gradeChipColor(result.grade)}`}>
                    {result.grade}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-2">{t("metrics.overallScore")}</p>
              </div>
            )}

            {hasCategoryScores && (
              <div className="space-y-3">
                {result.categoryScores!.map((c) => (
                  <div key={c.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{c.label}</span>
                      <span className={`font-mono ${scoreColor(c.score)}`}>{Math.round(c.score)}%</span>
                    </div>
                    <Progress value={c.score} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {result.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("toolSteps.panel.summary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{result.summary}</p>
          </CardContent>
        </Card>
      )}

      {(hasStrengths || hasWeaknesses) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />{" "}
              {t("tools.card.sentiment-analysis.stat.0.label")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasStrengths && (
              <div>
                <h4 className="font-semibold text-brand-green-text mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("headings.strengths")}
                </h4>
                <ul className="space-y-1">
                  {result.strengths!.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-brand-green-text mt-1" aria-hidden="true">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasWeaknesses && (
              <div>
                <h4 className="font-semibold text-destructive mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {t("headings.areasForImprovement")}
                </h4>
                <ul className="space-y-1">
                  {result.weaknesses!.map((w, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-destructive mt-1" aria-hidden="true">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasRecommendations && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />{" "}
              {t("headings.recommendations")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.recommendations!.map((r, i) => (
              <div key={i} className="border border-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {recommendationIcon(r.category)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-semibold">{r.title}</h4>
                      {r.category && (
                        <Badge variant="secondary" className={recommendationBadgeColor(r.category)}>
                          {SEVERITY_LABEL_KEYS[r.category] ? t(SEVERITY_LABEL_KEYS[r.category]) : r.category}
                        </Badge>
                      )}
                      {typeof r.impact !== "undefined" && (
                        <Badge variant="outline" className="text-xs">
                          {t("toolSteps.analysis.impactValue", {
                            value: typeof r.impact === "number" ? `${r.impact}/10` : r.impact,
                          })}
                        </Badge>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-sm text-muted-foreground">{r.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {hasExtras && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("labels.details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {result.extras!.map((e, i) => (
                <div key={i} className="flex flex-col">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{e.label}</dt>
                  <dd className="text-foreground">{e.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleCopy} className="min-h-11 gap-2">
          <Copy className="h-4 w-4" aria-hidden="true" /> {t("actions.copyReport")}
        </Button>
      </div>
    </div>
  );
}
