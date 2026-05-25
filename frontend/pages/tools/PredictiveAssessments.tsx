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
import { useLocation } from "react-router-dom";
import { Loader2, Sparkles, Lock, CheckCircle2, BarChart3, Clock } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
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

const BAND_LABEL: Record<ReturnType<typeof scoreBand>, string> = {
  "very-low": "Very Low",
  low: "Low",
  average: "Average",
  high: "High",
  "very-high": "Very High",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function PredictiveAssessments() {
  const location = useLocation();
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

  useSEO(location.pathname, {
    title: "Predictive Assessments (Big Five, Cognitive, EQ, DISC) — hired.video",
    description:
      "Validated-inspired psychometric assessments: Big Five personality, cognitive ability, situational judgment, EQ, and DISC. Free Big Five + cognitive sample; Pro unlocks the full battery and resume → predictive-index match.",
    canonical: "https://hired.video/tools/predictive-assessments",
  });
  useBreadcrumbs([
    { name: "Tools", url: "/tools" },
    { name: "Predictive Assessments", url: location.pathname },
  ]);

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
      toast({ title: "Sign in to take an assessment", description: "Free Big Five + cognitive sample take 5 minutes total." });
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
      const message = err?.message ?? "Couldn't start the assessment.";
      toast({ title: "Couldn't start", description: message, variant: "destructive" });
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
      toast({ title: "Couldn't record answer", description: err?.message ?? "Try again.", variant: "destructive" });
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
      <AppShell bgClassName="bg-background">
        <div className="max-w-5xl mx-auto p-6 space-y-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Predictive Assessments</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Validated-inspired psychometric instruments — Big Five, cognitive ability,
              situational judgment, EQ, and DISC. Take the free Big Five + cognitive sample
              in 8 minutes total; upgrade to Pro for the full battery and the resume →
              predictive-index match.
            </p>
          </div>
        </header>

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
                      Save & exit
                    </Button>
                  </div>
                  <Progress value={progress} className="mt-3" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Question {(activeRun.responses?.length ?? 0) + 1} of {activeQuestions.length}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-lg font-medium leading-snug">{currentQuestion.prompt}</p>
                  {currentQuestion.scale === "agreement_5" && (
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { v: 1, l: "Strongly Disagree" },
                        { v: 2, l: "Disagree" },
                        { v: 3, l: "Neutral" },
                        { v: 4, l: "Agree" },
                        { v: 5, l: "Strongly Agree" },
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
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        {activeDescriptor.title} — Results
                      </CardTitle>
                      <CardDescription>{activeRun.results?.narrative}</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={exitToCatalog}>
                      Take another
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activeDescriptor.dimensions.map((dim) => {
                      const score = activeRun.scores!.scores[dim.key] ?? 0;
                      const band = scoreBand(score);
                      const pct = Math.round(score * 100);
                      return (
                        <div key={dim.key}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{dim.label}</span>
                            <span className="text-muted-foreground">
                              {pct}% · <span className="font-medium text-foreground">{BAND_LABEL[band]}</span>
                            </span>
                          </div>
                          <Progress value={pct} className="mt-1" />
                          <p className="text-xs text-muted-foreground mt-1">{dim.blurb}</p>
                        </div>
                      );
                    })}
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
                              {isLocked && <Lock className="w-3 h-3" />} Pro
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs">{d.oneLiner}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground line-clamp-3">{d.longDescription}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> ~{d.estimatedMinutes} min
                          </span>
                          <span>{d.questionCount > 0 ? `${d.questionCount} items` : "Résumé-driven"}</span>
                        </div>
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={submitting || isLocked}
                          onClick={() => handlePickKind(d.kind)}
                        >
                          {isLocked ? (
                            <>
                              <Lock className="w-4 h-4 mr-1" /> Upgrade to take
                            </>
                          ) : submitting ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-1" /> Start
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
                <CardTitle className="text-base">Your history</CardTitle>
                <CardDescription>Every start + complete is captured.</CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assessments yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {history.slice(0, 10).map((run) => {
                      const descriptor = catalog?.find((c) => c.kind === run.assessmentKind);
                      return (
                        <li key={run.id} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{descriptor?.title ?? run.assessmentKind}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {run.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {run.status === "completed"
                              ? `Completed ${fmtDate(run.completedAt)}`
                              : `Started ${fmtDate(run.startedAt)}`}
                            {run.scores && run.status === "completed" && (
                              <> · Overall {Math.round((run.scores.overall ?? 0) * 100)}%</>
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
      </div>
    </AppShell>
  );
}
