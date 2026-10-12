// Shared types + pure helpers for the ResumeAnalysisToolPage family
// (/tools/resume-optimizer and /tools/ai-resume-scorer).

import type { TFunction } from "i18next";

// ---------------------------------------------------------------------------
// Shared result shape — superset of what Scorer and Optimizer surface.
// Mirrors `ResumeAnalysis` in shared/tool-schemas.ts. Every field except
// scores + recommendations is optional; the UI self-gates on presence.
// ---------------------------------------------------------------------------

export interface ResumeAnalysisResult {
  overallScore: number;
  grade?: string;
  atsScore: number;
  contentScore: number;
  keywordScore: number;
  formatScore: number;
  impactScore?: number;
  strengths?: string[];
  weaknesses?: string[];
  recommendations: Array<{
    severity?: "critical" | "important" | "minor";
    /** Some legacy backends still return `category` as the severity
     *  axis. The shell treats `category` as the diagnostic bucket
     *  (ats/keywords/format/...) and falls back to `severity`'s field
     *  when only one is present. */
    category?: string;
    title: string;
    description: string;
    impact?: number | string;
    /** The wand that fixes it (#374) — validated again by the Action button. */
    actionId?: string;
    actionArgs?: Record<string, unknown>;
  }>;
  optimizedContent?: string;
  /** Free-tier preview marker. When true, the response carries only
   *  score + grade + a teaser; the page renders an upgrade card. */
  isProPreview?: true;
  upgradeUrl?: string;
  teaserRecommendation?: { title: string; impact?: number | string } | null;
}

// ---------------------------------------------------------------------------
// Score / grade helpers — unified thresholds. The legacy Scorer used
// 85/70 and the Optimizer used 80/60; collapsing here is a DRY fix
// for the divergence flagged in the gap register.
// ---------------------------------------------------------------------------

export function getScoreColor(score: number): string {
  if (score >= 85) return "text-brand-green-text";
  if (score >= 70) return "text-amber-600";
  return "text-destructive";
}

export function getGradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-brand-green-text bg-brand-green/15";
  if (grade.startsWith("B")) return "text-primary bg-accent";
  if (grade.startsWith("C")) return "text-amber-600 bg-amber-100";
  return "text-destructive bg-destructive/10";
}

export function getRecommendationBadgeColor(severity: string | undefined): string {
  switch (severity) {
    case "critical":
      return "bg-destructive/10 text-destructive";
    case "important":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-accent text-accent-foreground";
  }
}

/** i18n key for a known severity value; unknown values render verbatim. */
export const SEVERITY_LABEL_KEYS: Record<string, string> = {
  critical: "toolSteps.severity.critical",
  important: "toolSteps.severity.important",
  minor: "toolSteps.severity.minor",
};

/** Category-bar rows, in display order. `labelKey` is translated at render. */
export function categoryScoreRows(
  result: ResumeAnalysisResult,
): Array<{ labelKey: string; score: number }> {
  return [
    { labelKey: "metrics.atsCompatibility", score: result.atsScore },
    { labelKey: "metrics.contentQuality", score: result.contentScore },
    { labelKey: "metrics.keywords", score: result.keywordScore },
    { labelKey: "metrics.format", score: result.formatScore },
    ...(typeof result.impactScore === "number"
      ? [{ labelKey: "metrics.impact", score: result.impactScore }]
      : []),
  ];
}

// ---------------------------------------------------------------------------
// Copy Report builder. Self-gates on which fields are present on the
// result so the same template covers both Scorer and Optimizer.
// ---------------------------------------------------------------------------

export function buildResumeAnalysisReport(
  r: ResumeAnalysisResult,
  opts: { reportLabel: string; toolTitle: string; t: TFunction },
): string {
  const { t } = opts;
  const lines: string[] = [opts.reportLabel, ""];
  lines.push(
    `${t("metrics.overallScore")}: ${r.overallScore}%${r.grade ? ` (${r.grade})` : ""}`,
  );
  lines.push("");
  lines.push(t("toolSteps.report.detailedScores"));
  for (const row of categoryScoreRows(r)) lines.push(`- ${t(row.labelKey)}: ${row.score}%`);
  if (r.strengths?.length) {
    lines.push("", `${t("headings.strengths")}:`);
    for (const s of r.strengths) lines.push(`- ${s}`);
  }
  if (r.weaknesses?.length) {
    lines.push("", `${t("headings.areasForImprovement")}:`);
    for (const w of r.weaknesses) lines.push(`- ${w}`);
  }
  if (r.recommendations.length) {
    lines.push("", `${t("headings.recommendations")}:`);
    for (const rec of r.recommendations) lines.push(`- ${rec.title}: ${rec.description}`);
  }
  lines.push("", t("toolSteps.report.generatedBy", { name: opts.toolTitle }));
  return lines.join("\n");
}
