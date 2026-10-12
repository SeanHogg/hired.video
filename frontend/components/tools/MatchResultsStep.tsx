import {
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FileText,
  Briefcase,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import MarkdownDisplay from "./MarkdownDisplay";
import type { JobResumeMatchResponse } from "@/lib/services/match-service";
import { useAuth } from "@/lib/auth";
import { useToolEmbed } from "@/lib/tools/tool-embed";
import TailorToJobButton from "./TailorToJobButton";

interface MatchResultsStepProps {
  matchResult: JobResumeMatchResponse;
  onStartOver: () => void;
  isLoading?: boolean;
  /** The résumé + job that were matched — "Tailor my résumé to this job". */
  resumeId?: string;
  job?: { jobId?: string; jobContent?: string };
}

// Score category styling — `tier` selects the i18n label/message keys.
function getScoreCategory(score: number) {
  if (score >= 80)
    return {
      tier: "excellent",
      textColor: "text-brand-green-text",
      bgColor: "bg-brand-green/10",
    };
  if (score >= 60)
    return {
      tier: "good",
      textColor: "text-primary",
      bgColor: "bg-accent",
    };
  if (score >= 40)
    return {
      tier: "fair",
      textColor: "text-amber-700",
      bgColor: "bg-amber-50",
    };
  return {
    tier: "needsWork",
    textColor: "text-destructive",
    bgColor: "bg-destructive/10",
  };
}

function getScoreIcon(score: number) {
  if (score >= 80) return <CheckCircle2 className="h-6 w-6 text-brand-green-text" aria-hidden="true" />;
  if (score >= 60) return <TrendingUp className="h-6 w-6 text-primary" aria-hidden="true" />;
  if (score >= 40) return <Target className="h-6 w-6 text-amber-600" aria-hidden="true" />;
  return <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />;
}

// Four stacked 25-point bands. Each fills as the score passes through it.
const SCORE_BANDS = [
  {
    labelKey: "toolSteps.match.band.basic",
    floor: 0,
    reached: 25,
    text: "text-brand-green-text",
    track: "bg-brand-green/25",
    fill: "bg-brand-green",
  },
  {
    labelKey: "toolSteps.match.band.skills",
    floor: 25,
    reached: 50,
    text: "text-primary",
    track: "bg-primary/20",
    fill: "bg-primary",
  },
  {
    labelKey: "headings.experience",
    floor: 50,
    reached: 75,
    text: "text-primary",
    track: "bg-primary/20",
    fill: "bg-primary",
  },
  {
    labelKey: "toolSteps.match.band.perfect",
    floor: 75,
    reached: 90,
    text: "text-amber-600",
    track: "bg-amber-200",
    fill: "bg-amber-500",
  },
] as const;

const NEXT_STEP_KEYS: Record<"high" | "mid" | "low", string[]> = {
  high: ["toolSteps.match.next.high.0", "toolSteps.match.next.high.1", "toolSteps.match.next.high.2"],
  mid: ["toolSteps.match.next.mid.0", "toolSteps.match.next.mid.1", "toolSteps.match.next.mid.2"],
  low: ["toolSteps.match.next.low.0", "toolSteps.match.next.low.1", "toolSteps.match.next.low.2"],
};

export default function MatchResultsStep({
  matchResult,
  onStartOver,
  isLoading = false,
  resumeId,
  job,
}: MatchResultsStepProps) {
  const embedded = useToolEmbed() !== null;
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { score, summaryRecommendations } = matchResult;

  const scoreCategory = getScoreCategory(score);
  const nextSteps = NEXT_STEP_KEYS[score >= 80 ? "high" : score >= 60 ? "mid" : "low"];

  return (
    <div className="space-y-6">
      {/* Score Display */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("headings.matchResults")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Score Circle and Details */}
            <div className="flex flex-wrap items-center gap-4">
              <div
                className={`relative w-20 h-20 shrink-0 rounded-full ${scoreCategory.bgColor} flex items-center justify-center`}
              >
                <div className="text-center">
                  <div
                    className={`font-display text-3xl font-bold tracking-tight ${scoreCategory.textColor}`}
                  >
                    {Math.round(score)}
                  </div>
                  <div className={`text-xs ${scoreCategory.textColor}`}>
                    {t("toolSteps.match.outOf100")}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-[12rem]">
                <div className="flex items-center gap-2 mb-2">
                  {getScoreIcon(score)}
                  <Badge variant="secondary" className={scoreCategory.textColor}>
                    {t(`toolSteps.match.tier.${scoreCategory.tier}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(`toolSteps.match.message.${scoreCategory.tier}`)}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t("tools.card.job-resume-match.stat.0.label")}</span>
                <span className="font-mono font-medium">{Math.round(score)}%</span>
              </div>
              <Progress value={score} className="h-2" />
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {SCORE_BANDS.map((band) => {
                const on = score >= band.reached;
                return (
                  <div key={band.labelKey} className="space-y-1">
                    <div className={`text-sm font-medium ${on ? band.text : "text-muted-foreground"}`}>
                      {t(band.labelKey)}
                    </div>
                    <div className={`w-full h-2 rounded ${on ? band.track : "bg-muted"}`}>
                      <div
                        className={`h-full rounded ${on ? band.fill : "bg-muted-foreground"}`}
                        style={{
                          width: `${Math.min(100, ((score - band.floor) / 25) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("toolSteps.match.detailedAnalysis")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownDisplay content={summaryRecommendations} />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        {job && <TailorToJobButton resumeId={resumeId} job={job} className="flex-1 min-h-11" />}
        <Button
          onClick={onStartOver}
          variant="outline"
          className="flex-1 min-h-11"
          disabled={isLoading}
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("toolSteps.match.analyzeAnother")}
        </Button>

        {/* Embedded in the kit workspace these would leave the workspace. */}
        {isAuthenticated && !embedded && (
          <>
            <Link to="/resumes" className="flex-1">
              <Button variant="outline" className="w-full min-h-11">
                <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("actions.viewMyResumes")}
              </Button>
            </Link>
            <Link to="/jobs" className="flex-1">
              <Button variant="outline" className="w-full min-h-11">
                <Briefcase className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("actions.browseJobs")}
              </Button>
            </Link>
          </>
        )}
      </div>

      {/* Tips Section */}
      <Card className="bg-muted">
        <CardContent className="p-6">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("toolSteps.match.nextSteps")}
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {nextSteps.map((key) => (
              <li key={key}>• {t(key)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
