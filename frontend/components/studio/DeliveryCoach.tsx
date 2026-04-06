"use client";

import { useMemo } from "react";
import {
  Award,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FillerWordEntry {
  word: string;
  count: number;
  timestamps: number[];
}

interface Suggestion {
  type: string;
  message: string;
}

interface DeliveryCoachResult {
  overallScore: number;
  pacingWpm: number;
  pacingScore: number;
  fillerWords: FillerWordEntry[];
  fillerScore: number;
  energyScore: number;
  clarityScore: number;
  suggestions: Suggestion[];
}

interface DeliveryCoachProps {
  result: DeliveryCoachResult | null;
  isAnalyzing?: boolean;
  onReRecord?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function getScoreBadgeVariant(
  score: number,
): "default" | "secondary" | "destructive" {
  if (score >= 80) return "default";
  if (score >= 60) return "secondary";
  return "destructive";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Great";
  if (score >= 70) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Needs Work";
  return "Poor";
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getSuggestionIcon(type: string) {
  switch (type) {
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />;
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    default:
      return <TrendingUp className="h-4 w-4 text-blue-500 shrink-0" />;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** SVG-based circular progress ring */
function CircularScore({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="136" height="136" className="-rotate-90">
        {/* Background ring */}
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-muted/30"
        />
        {/* Score ring */}
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-all duration-700 ease-out",
            score >= 80
              ? "text-green-500"
              : score >= 60
                ? "text-yellow-500"
                : "text-red-500",
          )}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-3xl font-bold", getScoreColor(score))}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

/** Horizontal metric row with label, score bar, and feedback */
function MetricRow({
  label,
  score,
  feedback,
}: {
  label: string;
  score: number;
  feedback?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold", getScoreColor(score))}>
            {score}
          </span>
          <Badge variant={getScoreBadgeVariant(score)} className="text-[10px] px-1.5 py-0">
            {getScoreLabel(score)}
          </Badge>
        </div>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            getScoreBarColor(score),
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      {feedback && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {feedback}
        </p>
      )}
    </div>
  );
}

/** Pacing WPM gauge with ideal-range overlay */
function PacingGauge({ wpm, score }: { wpm: number; score: number }) {
  // Visual range 60-240 WPM
  const min = 60;
  const max = 240;
  const clampedWpm = Math.min(Math.max(wpm, min), max);
  const pct = ((clampedWpm - min) / (max - min)) * 100;
  const idealStart = ((130 - min) / (max - min)) * 100;
  const idealEnd = ((170 - min) / (max - min)) * 100;

  const inRange = wpm >= 130 && wpm <= 170;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Pacing</span>
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold", getScoreColor(score))}>
            {wpm} WPM
          </span>
          <Badge
            variant={inRange ? "default" : "secondary"}
            className="text-[10px] px-1.5 py-0"
          >
            {inRange ? "Ideal" : wpm < 130 ? "Too Slow" : "Too Fast"}
          </Badge>
        </div>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
        {/* Ideal range highlight */}
        <div
          className="absolute top-0 h-full bg-green-500/20 dark:bg-green-400/15"
          style={{ left: `${idealStart}%`, width: `${idealEnd - idealStart}%` }}
        />
        {/* WPM indicator */}
        <div
          className={cn(
            "absolute top-0 h-full w-1 rounded-full transition-all duration-500",
            inRange ? "bg-green-500" : "bg-yellow-500",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>60</span>
        <span className="text-green-600 dark:text-green-400 font-medium">
          130 - 170 ideal
        </span>
        <span>240</span>
      </div>
    </div>
  );
}

/** Filler word breakdown table */
function FillerWordBreakdown({ words }: { words: FillerWordEntry[] }) {
  const totalFillers = words.reduce((sum, w) => sum + w.count, 0);

  if (words.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4" />
        No filler words detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Filler Words</span>
        <Badge variant="secondary" className="text-[10px]">
          {totalFillers} total
        </Badge>
      </div>
      <div className="space-y-1.5">
        {words.map((entry) => (
          <div
            key={entry.word}
            className="flex items-start justify-between rounded-md border bg-muted/40 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                &ldquo;{entry.word}&rdquo;
              </code>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {entry.count}x
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1 justify-end max-w-[50%]">
              {entry.timestamps.map((ts, i) => (
                <span
                  key={`${entry.word}-${i}`}
                  className="text-[10px] text-muted-foreground font-mono"
                >
                  {formatTimestamp(ts)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AnalyzingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Award className="h-5 w-5 animate-pulse text-primary" />
          Analyzing your delivery...
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-center">
          <Skeleton className="h-[136px] w-[136px] rounded-full" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metric feedback generation
// ---------------------------------------------------------------------------

function getMetricFeedback(metric: string, score: number): string {
  if (metric === "energy") {
    if (score >= 80) return "Your energy is engaging and enthusiastic.";
    if (score >= 60)
      return "Consider adding more vocal variety to boost engagement.";
    return "Try to project more confidence and enthusiasm in your delivery.";
  }
  if (metric === "clarity") {
    if (score >= 80) return "Your articulation and pronunciation are clear.";
    if (score >= 60)
      return "Some words could be enunciated more clearly. Slow down on key points.";
    return "Focus on clearer articulation. Practice tongue-twisters before recording.";
  }
  if (metric === "filler") {
    if (score >= 80)
      return "Minimal filler words detected. Great conversational flow.";
    if (score >= 60)
      return "Some filler words present. Pause silently instead of filling gaps.";
    return "Frequent filler words detected. Practice pausing between thoughts.";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DeliveryCoach({
  result,
  isAnalyzing = false,
  onReRecord,
}: DeliveryCoachProps) {
  const totalFillers = useMemo(
    () => result?.fillerWords.reduce((sum, w) => sum + w.count, 0) ?? 0,
    [result?.fillerWords],
  );

  if (isAnalyzing) {
    return <AnalyzingSkeleton />;
  }

  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-muted-foreground" />
            Delivery Coach
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Record a video to receive AI-powered delivery coaching feedback.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-primary" />
            Delivery Coach
          </span>
          <Badge variant={getScoreBadgeVariant(result.overallScore)}>
            {getScoreLabel(result.overallScore)}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---- Overall score circle ---- */}
        <div className="flex flex-col items-center gap-2">
          <CircularScore score={result.overallScore} />
          <span className="text-sm text-muted-foreground">Overall Score</span>
        </div>

        {/* ---- Pacing gauge ---- */}
        <PacingGauge wpm={result.pacingWpm} score={result.pacingScore} />

        {/* ---- Individual metrics ---- */}
        <div className="space-y-4">
          <MetricRow
            label="Pacing"
            score={result.pacingScore}
            feedback={
              result.pacingScore >= 80
                ? "Your speaking pace is well-suited for clear communication."
                : result.pacingWpm < 130
                  ? "You are speaking too slowly. Try to pick up the pace slightly."
                  : "You are speaking too quickly. Slow down to let your points land."
            }
          />
          <MetricRow
            label="Filler Words"
            score={result.fillerScore}
            feedback={getMetricFeedback("filler", result.fillerScore)}
          />
          <MetricRow
            label="Energy"
            score={result.energyScore}
            feedback={getMetricFeedback("energy", result.energyScore)}
          />
          <MetricRow
            label="Clarity"
            score={result.clarityScore}
            feedback={getMetricFeedback("clarity", result.clarityScore)}
          />
        </div>

        {/* ---- Filler word breakdown ---- */}
        <FillerWordBreakdown words={result.fillerWords} />

        {/* ---- Suggestions ---- */}
        {result.suggestions.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Suggestions</span>
            <ul className="space-y-2">
              {result.suggestions.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
                >
                  {getSuggestionIcon(s.type)}
                  <span className="leading-relaxed">{s.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- Re-record button ---- */}
        {onReRecord && (
          <Button
            variant="outline"
            className="w-full"
            onClick={onReRecord}
          >
            <RotateCcw className="h-4 w-4" />
            Re-record
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
