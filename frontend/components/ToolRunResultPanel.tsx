// Generic result panel for any resume-input tool. Every tool normalises
// its response into NormalizedToolRunResult (see lib/resume-tools/types.ts)
// so this one component can render the score view, the summary view, the
// recommendation view, or any subset of those, for every tool.

import { AlertTriangle, CheckCircle2, Copy, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { NormalizedToolRunResult } from "@/lib/resume-tools/types";

interface Props {
  result: NormalizedToolRunResult;
  toolLabel: string;
  onCopyReport?: () => void;
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-600";
}

function gradeChipColor(grade?: string): string {
  if (!grade) return "text-slate-600 bg-slate-100";
  const g = grade.toLowerCase();
  if (g.startsWith("a") || g === "positive") return "text-green-600 bg-green-100";
  if (g.startsWith("b") || g === "neutral") return "text-blue-600 bg-blue-100";
  if (g.startsWith("c")) return "text-yellow-600 bg-yellow-100";
  return "text-red-600 bg-red-100";
}

function recommendationIcon(category?: string) {
  switch (category) {
    case "critical":
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    case "important":
      return <TrendingUp className="h-4 w-4 text-yellow-600" />;
    default:
      return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
  }
}

function recommendationBadgeColor(category?: string): string {
  switch (category) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "important":
      return "bg-yellow-100 text-yellow-800";
    case "minor":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function defaultCopyReport(toolLabel: string, result: NormalizedToolRunResult): string {
  const lines: string[] = [`${toolLabel} Report`, ""];
  if (typeof result.overallScore === "number") lines.push(`Overall Score: ${result.overallScore}${result.grade ? ` (${result.grade})` : ""}`);
  if (result.categoryScores?.length) {
    lines.push("", "Scores:");
    for (const c of result.categoryScores) lines.push(`- ${c.label}: ${c.score}%`);
  }
  if (result.summary) lines.push("", "Summary:", result.summary);
  if (result.strengths?.length) {
    lines.push("", "Strengths:");
    for (const s of result.strengths) lines.push(`- ${s}`);
  }
  if (result.weaknesses?.length) {
    lines.push("", "Areas for Improvement:");
    for (const w of result.weaknesses) lines.push(`- ${w}`);
  }
  if (result.recommendations?.length) {
    lines.push("", "Recommendations:");
    for (const r of result.recommendations) lines.push(`- ${r.title}${r.description ? `: ${r.description}` : ""}`);
  }
  return lines.join("\n");
}

export function ToolRunResultPanel({ result, toolLabel, onCopyReport }: Props) {
  const hasCategoryScores = (result.categoryScores?.length ?? 0) > 0;
  const hasStrengths = (result.strengths?.length ?? 0) > 0;
  const hasWeaknesses = (result.weaknesses?.length ?? 0) > 0;
  const hasRecommendations = (result.recommendations?.length ?? 0) > 0;

  const handleCopy = () => {
    if (onCopyReport) return onCopyReport();
    navigator.clipboard.writeText(defaultCopyReport(toolLabel, result));
  };

  return (
    <div className="space-y-4">
      {(typeof result.overallScore === "number" || hasCategoryScores) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {toolLabel} Scores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {typeof result.overallScore === "number" && (
              <div className="text-center p-6 bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 rounded-lg">
                <div className={`text-5xl font-bold mb-1 ${scoreColor(result.overallScore)}`}>
                  {Math.round(result.overallScore)}
                </div>
                {result.grade && (
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-semibold ${gradeChipColor(result.grade)}`}>
                    {result.grade}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-2">Overall Score</p>
              </div>
            )}

            {hasCategoryScores && (
              <div className="space-y-3">
                {result.categoryScores!.map((c) => (
                  <div key={c.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{c.label}</span>
                      <span className={scoreColor(c.score)}>{Math.round(c.score)}%</span>
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
            <CardTitle className="text-base">Summary</CardTitle>
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
              <TrendingUp className="h-5 w-5" /> Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasStrengths && (
              <div>
                <h4 className="font-semibold text-green-600 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Strengths
                </h4>
                <ul className="space-y-1">
                  {result.strengths!.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-green-600 mt-1">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasWeaknesses && (
              <div>
                <h4 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Areas for Improvement
                </h4>
                <ul className="space-y-1">
                  {result.weaknesses!.map((w, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-red-600 mt-1">•</span>
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
              <CheckCircle2 className="h-5 w-5" /> Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.recommendations!.map((r, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  {recommendationIcon(r.category)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-semibold">{r.title}</h4>
                      {r.category && (
                        <Badge variant="secondary" className={recommendationBadgeColor(r.category)}>
                          {r.category}
                        </Badge>
                      )}
                      {typeof r.impact !== "undefined" && (
                        <Badge variant="outline" className="text-xs">
                          Impact: {typeof r.impact === "number" ? `${r.impact}/10` : r.impact}
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

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
          <Copy className="h-4 w-4" /> Copy Report
        </Button>
      </div>
    </div>
  );
}
