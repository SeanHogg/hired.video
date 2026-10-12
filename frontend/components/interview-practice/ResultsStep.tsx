// Step 4 — overall score, per-question breakdown, feedback and model answer.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  Star,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ScoreMetricGrid, scoreColor } from "./ScoreMetrics";
import type { AnswerResult, Question, ScoreBreakdown } from "@/lib/interview-practice/types";

export function ResultsStep({
  questions,
  results,
  onRestart,
  onRetry,
}: {
  questions: Question[];
  results: AnswerResult[];
  onRestart: () => void;
  onRetry: (questionIndex: number) => void;
}) {
  const { t } = useTranslation();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const overallScore =
    results.length > 0
      ? Math.round((results.reduce((s, r) => s + r.score, 0) / results.length) * 10) / 10
      : 0;

  const avgBreakdown = results.length > 0
    ? Object.keys(results[0].scoreBreakdown).reduce((acc, key) => {
        acc[key as keyof ScoreBreakdown] =
          Math.round((results.reduce((s, r) => s + r.scoreBreakdown[key as keyof ScoreBreakdown], 0) / results.length) * 10) / 10;
        return acc;
      }, {} as ScoreBreakdown)
    : null;

  const selected = results[selectedIdx];
  const filledStars = Math.round(overallScore / 2);

  return (
    <div className="flex flex-col gap-6">
      {/* Overall Score */}
      <Card>
        <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t("headings.interview.interviewScore")}
              </p>
              <div className={cn("font-display text-[56px] font-bold leading-none tracking-[-0.04em]", scoreColor(overallScore))}>
                {overallScore}
                <span className="ml-1 font-sans text-2xl font-normal tracking-normal text-muted-foreground">
                  {t("interviewPractice.results.outOfTen")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {overallScore >= 8 ? t("messages.interview.scoreExcellent") : overallScore >= 6 ? t("messages.interview.scoreGood") : t("messages.interview.scoreKeepPracticing")}
              </p>
            </div>
            <div
              className="flex items-center gap-1"
              role="img"
              aria-label={t("interviewPractice.results.starsAria", { count: filledStars })}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  aria-hidden="true"
                  className={cn("h-5 w-5", i <= filledStars ? "fill-primary text-primary" : "text-muted-foreground")}
                />
              ))}
            </div>
          </div>

          {avgBreakdown && <ScoreMetricGrid breakdown={avgBreakdown} />}
        </CardContent>
      </Card>

      {/* Per-question tabs */}
      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-semibold text-foreground">{t("headings.interview.questionBreakdown")}</p>
        <div className="flex flex-wrap gap-2">
          {questions.map((q, i) => {
            const r = results[i];
            const active = selectedIdx === i;
            return (
              <button
                key={q.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedIdx(i)}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/50",
                )}
              >
                {t("labels.interview.qShort", { number: i + 1 })}
                {r && (
                  <span className={cn("ml-1.5 font-mono text-xs", active ? "text-primary-foreground/80" : scoreColor(r.score))}>
                    {r.score}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold leading-snug">{questions[selectedIdx]?.question}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ScoreMetricGrid breakdown={selected.scoreBreakdown} size="md" />

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
              {/* Strengths */}
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 font-sans text-sm font-semibold text-brand-green-text">
                  <CheckCircle className="h-4 w-4" aria-hidden="true" /> {t("headings.strengths")}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {selected.feedback.strengths.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-green" aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Improvements */}
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 font-sans text-sm font-semibold text-amber-600 dark:text-amber-400">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" /> {t("headings.interview.areasToImprove")}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {selected.feedback.improvements.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* Sample answer */}
            <div className="rounded-xl border border-primary/30 bg-accent p-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-primary">
                <Lightbulb className="h-4 w-4" aria-hidden="true" /> {t("headings.interview.modelAnswer")}
              </div>
              <p className="text-sm leading-relaxed text-accent-foreground">{selected.feedback.suggestedAnswer}</p>
            </div>

            {/* Your transcript */}
            {selected.transcript && (
              <details className="group">
                <summary className="flex min-h-[44px] cursor-pointer items-center text-sm text-muted-foreground hover:text-foreground">
                  {t("labels.interview.yourTranscript")}
                </summary>
                <p className="mt-1 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  {selected.transcript}
                </p>
              </details>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-8 w-8 opacity-40" aria-hidden="true" />
            {t("messages.interview.questionSkipped")}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" onClick={onRestart}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("actions.interview.newSession")}
        </Button>
        <Button size="lg" onClick={() => onRetry(selectedIdx)}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("actions.interview.rePracticeQ", { number: selectedIdx + 1 })}
        </Button>
      </div>
    </div>
  );
}
