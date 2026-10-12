/**
 * Predictive Assessments tool — HireVue/PI/DISC-inspired psychometric
 * battery. Free tier ships Big Five + cognitive sample; Pro unlocks SJT,
 * EQ, DISC, and the resume → predictive-index match.
 *
 * Single-page UX:
 *   - No active run                  → render the kind picker
 *   - Active run (started/in_progress) → render the question stream
 *   - Completed run               → render the dimensions + narrative results
 *
 * History (previous completed runs) lives in the right rail so a candidate
 * can compare today's Big Five against the one they took three months ago.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles, Lock, CheckCircle2, ClipboardCheck, Clock } from "lucide-react";

import { ToolShell } from "@/components/tools/ToolShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { toast } from "@/components/ui/use-toast";

import {
  predictiveAssessmentsService,
  type AssessmentRun,
} from "@/lib/services/predictive-assessments-service";
import type { AssessmentDescriptor, AssessmentKind } from "@shared/assessments/kinds";
import type { AssessmentQuestion } from "@shared/assessments/question-banks";
import { scoreBand } from "@shared/assessments/scoring";

/** i18n key per score band — resolved through `t` at the call site so the
 *  band label tracks the active locale. */
const BAND_LABEL_KEY: Record<ReturnType<typeof scoreBand>, string> = {
  "very-low": "tools.predictiveAssessments.bandVeryLow",
  low: "tools.predictiveAssessments.bandLow",
  average: "tools.predictiveAssessments.bandAverage",
  high: "tools.predictiveAssessments.bandHigh",
  "very-high": "tools.predictiveAssessments.bandVeryHigh",
};

/** i18n key per run status — falls back to the raw status string. */
const STATUS_KEY: Record<string, string> = {
  started: "tools.predictiveAssessments.statusStarted",
  in_progress: "tools.predictiveAssessments.statusInProgress",
  completed: "tools.predictiveAssessments.statusCompleted",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function PredictiveAssessments() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { isPro } = useSubscription();

  const [catalog, setCatalog] = useState<AssessmentDescriptor[] | null>(null);
  const [history, setHistory] = useState<AssessmentRun[]>([]);
  const [activeKind, setActiveKind] = useState<AssessmentKind | null>(null);
  const [activeRun, setActiveRun] = useState<AssessmentRun | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<AssessmentQuestion[]>([]);
  const [activeDescriptor, setActiveDescriptor] = useState<AssessmentDescriptor | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const shellHeader = {
    icon: <ClipboardCheck className="h-6 w-6" />,
    title: t("tools.card.predictive-assessments.title"),
    description: t("tools.predictiveAssessments.description"),
  } as const;

  // Initial load — catalog + history.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      predictiveAssessmentsService.listKinds(),
      isAuthenticated ? predictiveAssessmentsService.listRuns().catch(() => []) : Promise.resolve([]),
    ])
      .then(([kinds, runs]) => {
        if (cancelled) return;
        setCatalog(kinds);
        setHistory(runs);
      })
      .catch((err) => {
        console.error("[PredictiveAssessments] load failed:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const currentResponseFor = useMemo(() => {
    if (!activeRun) return new Map<string, string | number>();
    const map = new Map<string, string | number>();
    for (const r of activeRun.responses ?? []) map.set(r.questionId, r.value);
    return map;
  }, [activeRun]);

  const currentQuestion = activeQuestions[activeRun?.questionIndex ?? 0] ?? null;
  const progress = activeQuestions.length > 0
    ? Math.min(100, Math.round(((activeRun?.responses?.length ?? 0) / activeQuestions.length) * 100))
    : 0;

  async function handlePickKind(kind: AssessmentKind) {
    if (!isAuthenticated) {
      toast({ title: t("tools.predictiveAssessments.signInTitle"), description: t("tools.predictiveAssessments.signInDesc") });
      return;
    }
    try {
      setSubmitting(true);
      const { descriptor, questions } = await predictiveAssessmentsService.getQuestions(kind);
      const run = await predictiveAssessmentsService.start(kind);
      setActiveKind(kind);
      setActiveDescriptor(descriptor);
      setActiveQuestions(questions);
      setActiveRun(run);
    } catch (err: any) {
      const message = err?.message ?? t("tools.predictiveAssessments.startFailDesc");
      toast({ title: t("tools.predictiveAssessments.startFailTitle"), description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespond(value: string | number) {
    if (!activeRun || !currentQuestion) return;
    try {
      setSubmitting(true);
      const updated = await predictiveAssessmentsService.respond(activeRun.id, currentQuestion.id, value);
      setActiveRun(updated);
      // Auto-complete on the last question.
      if (updated.responses.length >= activeQuestions.length) {
        const completed = await predictiveAssessmentsService.complete(activeRun.id);
        setActiveRun(completed);
        const refreshed = await predictiveAssessmentsService.listRuns().catch(() => history);
        setHistory(refreshed);
      }
    } catch (err: any) {
      toast({ title: t("tools.predictiveAssessments.recordFailTitle"), description: err?.message ?? t("tools.predictiveAssessments.recordFailDesc"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function exitToCatalog() {
    setActiveKind(null);
    setActiveRun(null);
    setActiveQuestions([]);
    setActiveDescriptor(null);
  }

  // ── Render branches ────────────────────────────────────────────────

  if (loading) {
    return (
      <ToolShell toolId="predictive-assessments" header={shellHeader}>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ToolShell>
    );
  }

  return (
    <ToolShell toolId="predictive-assessments" header={shellHeader}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Active run — question UI */}
            {activeRun && activeDescriptor && activeRun.status !== "completed" && currentQuestion && (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{activeDescriptor.title}</CardTitle>
                      <CardDescription>{activeDescriptor.oneLiner}</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={exitToCatalog}>
                      {t("tools.predictiveAssessments.saveExit")}
                    </Button>
                  </div>
                  <Progress value={progress} className="mt-3" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("tools.predictiveAssessments.questionProgress", {
                      current: (activeRun.responses?.length ?? 0) + 1,
                      total: activeQuestions.length,
                    })}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-lg font-medium leading-snug">{currentQuestion.prompt}</p>
                  {currentQuestion.scale === "agreement_5" && (
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { v: 1, l: t("tools.predictiveAssessments.agree1") },
                        { v: 2, l: t("tools.predictiveAssessments.agree2") },
                        { v: 3, l: t("tools.predictiveAssessments.agree3") },
                        { v: 4, l: t("tools.predictiveAssessments.agree4") },
                        { v: 5, l: t("tools.predictiveAssessments.agree5") },
                      ].map((opt) => (
                        <Button
                          key={opt.v}
                          variant={currentResponseFor.get(currentQuestion.id) === opt.v ? "default" : "outline"}
                          className="flex flex-col h-auto py-3 gap-1"
                          disabled={submitting}
                          onClick={() => handleRespond(opt.v)}
                        >
                          <span className="text-lg font-bold">{opt.v}</span>
                          <span className="text-[10px] leading-tight text-center">{opt.l}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                  {(currentQuestion.scale === "multiple_choice" || currentQuestion.scale === "forced_choice_pair") &&
                    currentQuestion.options && (
                      <div className="space-y-2">
                        {currentQuestion.options.map((opt) => (
                          <Button
                            key={opt.value}
                            variant={currentResponseFor.get(currentQuestion.id) === opt.value ? "default" : "outline"}
                            className="w-full justify-start text-left h-auto py-3"
                            disabled={submitting}
                            onClick={() => handleRespond(opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {/* Completed run — results */}
            {activeRun && activeDescriptor && activeRun.status === "completed" && activeRun.scores && (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-brand-green-text" />
                        {t("tools.predictiveAssessments.resultsHeading", { title: activeDescriptor.title })}
                      </CardTitle>
                      <CardDescription>{activeRun.results?.narrative}</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={exitToCatalog}>
                      {t("tools.predictiveAssessments.takeAnother")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activeDescriptor.dimensions.map((dim) => {
                      const score = activeRun.scores!.scores[dim.key] ?? 0;
                      const band = scoreBand(score);
                      const pct = Math.round(score * 100);
                      // Calibrated percentile from the platform-wide
                      // norms cache (gap #1232 / migration 0120). Only
                      // shown once the population is large enough for
                      // the norms worker to publish a curve.
                      const percentile = activeRun.results?.percentiles?.[dim.key];
                      return (
                        <div key={dim.key}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{dim.label}</span>
                            <span className="text-muted-foreground">
                              {pct}% · <span className="font-medium text-foreground">{t(BAND_LABEL_KEY[band])}</span>
                              {typeof percentile === "number" && (
                                <span className="ml-2 text-xs text-brand-green-text">
                                  {t("tools.predictiveAssessments.topPercent", { percent: Math.max(1, 100 - percentile) })}
                                </span>
                              )}
                            </span>
                          </div>
                          <Progress value={pct} className="mt-1" />
                          <p className="text-xs text-muted-foreground mt-1">{dim.blurb}</p>
                        </div>
                      );
                    })}
                    {activeRun.results?.normSampleSize && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        {t("tools.predictiveAssessments.normCalibrated", {
                          count: activeRun.results.normSampleSize,
                        })}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Catalog (no active run) */}
            {!activeRun && catalog && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {catalog.map((d) => {
                  const isLocked = d.tier === "pro" && !isPro;
                  return (
                    <Card key={d.kind} className={isLocked ? "opacity-80" : ""}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{d.title}</CardTitle>
                          {d.tier === "pro" && (
                            <Badge variant={isLocked ? "outline" : "secondary"} className="text-xs gap-1">
                              {isLocked && <Lock className="w-3 h-3" />} {t("tools.predictiveAssessments.pro")}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs">{d.oneLiner}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground line-clamp-3">{d.longDescription}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {t("tools.predictiveAssessments.minutes", { minutes: d.estimatedMinutes })}
                          </span>
                          <span>{d.questionCount > 0 ? t("tools.predictiveAssessments.items", { count: d.questionCount }) : t("tools.predictiveAssessments.resumeDriven")}</span>
                        </div>
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={submitting || isLocked}
                          onClick={() => handlePickKind(d.kind)}
                        >
                          {isLocked ? (
                            <>
                              <Lock className="w-4 h-4 mr-1" /> {t("tools.predictiveAssessments.upgradeToTake")}
                            </>
                          ) : submitting ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-1" /> {t("tools.predictiveAssessments.start")}
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* History sidebar */}
          <aside className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("tools.predictiveAssessments.historyTitle")}</CardTitle>
                <CardDescription>{t("tools.predictiveAssessments.historySubtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("tools.predictiveAssessments.historyEmpty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {history.slice(0, 10).map((run) => {
                      const descriptor = catalog?.find((c) => c.kind === run.assessmentKind);
                      return (
                        <li key={run.id} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{descriptor?.title ?? run.assessmentKind}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {STATUS_KEY[run.status] ? t(STATUS_KEY[run.status]) : run.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {run.status === "completed"
                              ? t("tools.predictiveAssessments.completedOn", { date: fmtDate(run.completedAt) })
                              : t("tools.predictiveAssessments.startedOn", { date: fmtDate(run.startedAt) })}
                            {run.scores && run.status === "completed" && (
                              <> · {t("tools.predictiveAssessments.overall", { percent: Math.round((run.scores.overall ?? 0) * 100) })}</>
                            )}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
    </ToolShell>
  );
}
