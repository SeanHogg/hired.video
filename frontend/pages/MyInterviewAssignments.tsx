// /interview-assignments — shows both:
//   • interviews assigned to me as a job seeker (with my answers)
//   • interviews I created as a recruiter / employer (with candidate responses + resend)
//
// Detail view is reached at /interview-assignments/:id.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Type,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import {
  compareInterviews,
  getInterviewReport,
  listMyInterviewAssignments,
  resendInterviewInvite,
  scoreAllAnswers,
  scoreSingleAnswer,
  setInterviewDecision,
  type AnswerScoreBreakdown,
  type InterviewAssignmentRow,
  type AssignmentResponse,
  type InterviewDecision,
} from "@/lib/services/interview-assignments-service";
import {
  buildInterviewCompareHref,
  parseCompareIds,
  toggleCompareSelection,
} from "@/lib/interview-compare-href";
import { toast } from "sonner";
import { TranscriptionStatus } from "@/components/transcription/TranscriptionStatus";

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    pending: "bg-accent text-accent-foreground",
    in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    submitted: "bg-brand-green/15 text-brand-green-text",
    reviewed: "bg-accent text-accent-foreground",
    expired: "bg-destructive/10 text-destructive",
  };
  return (
    <Badge className={styles[status] ?? ""}>
      {t(`status.interviewAssignments.${status}`, { defaultValue: status.replace("_", " ") })}
    </Badge>
  );
}

function InterviewRow({
  row,
  perspective,
  onResend,
  selectable,
  selected,
  onToggleSelect,
}: {
  row: InterviewAssignmentRow;
  perspective: "creator" | "candidate";
  onResend?: (id: string) => void;
  /** When true, render a leading checkbox for the multi-select compare flow. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1 flex items-start gap-3">
            {selectable && (
              <Checkbox
                checked={!!selected}
                onCheckedChange={() => onToggleSelect?.(row.id)}
                className="mt-1"
                aria-label={t("labels.interviewAssignments.compareAria", { title: row.title })}
              />
            )}
            <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link to={`/interview-assignments/${row.id}`} className="font-medium text-sm hover:underline">
                {row.title}
              </Link>
              <StatusBadge status={row.status} />
              {row.assignmentType === "invite" && (
                <Badge variant="outline" className="text-[10px]">
                  {t("labels.interviewAssignments.invite")}
                </Badge>
              )}
              {row.targetRole && (
                <Badge variant="secondary" className="text-[10px]">
                  {row.targetRole}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
              <span>
                {t("labels.interviewAssignments.questionCount", { count: row.questions.length })}
              </span>
              {perspective === "creator" && row.candidateEmail && <span>→ {row.candidateEmail}</span>}
              {row.questionResponseDeadline && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t("labels.interviewAssignments.due", { date: new Date(row.questionResponseDeadline).toLocaleDateString() })}
                </span>
              )}
              {row.resendCount > 0 && <span>{t("labels.interviewAssignments.resentCount", { count: row.resendCount })}</span>}
            </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {perspective === "creator" && onResend && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResend(row.id)}
                disabled={row.status === "submitted" || row.status === "reviewed"}
                className="gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("actions.resend")}
              </Button>
            )}
            <Button asChild size="sm" variant={perspective === "candidate" ? "default" : "outline"}>
              <Link to={`/interview-assignments/${row.id}`}>
                {perspective === "candidate" ? t("actions.interviewAssignments.open") : t("actions.view")}
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ListView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [createdByMe, setCreatedByMe] = useState<InterviewAssignmentRow[]>([]);
  const [assignedToMe, setAssignedToMe] = useState<InterviewAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Multi-select state for the creator-side compare flow (#1235). Only
   *  rows in `createdByMe` are selectable — recruiters compare candidates
   *  they assigned, not interviews assigned to themselves. */
  const [selected, setSelected] = useState<string[]>([]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = toggleCompareSelection(prev, id);
      if (next.length === prev.length && !prev.includes(id)) {
        // Cap reached.
        toast.error(t("messages.interviewAssignments.compareCap"));
      }
      return next;
    });
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await listMyInterviewAssignments();
      setCreatedByMe(res.createdByMe);
      setAssignedToMe(res.assignedToMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.interviewAssignments.loadList"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleResend(id: string) {
    try {
      await resendInterviewInvite(id);
      toast.success(t("messages.interviewAssignments.magicLinkResent"));
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.interviewAssignments.resend"));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      {assignedToMe.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("headings.interviewAssignments.assignedToMe")}</h2>
          {assignedToMe.map((row) => (
            <InterviewRow key={row.id} row={row} perspective="candidate" />
          ))}
        </section>
      )}

      {createdByMe.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Send className="h-4 w-4" />
              {t("headings.interviewAssignments.sentByMe")}
            </h2>
            {createdByMe.length >= 2 && (
              <span className="text-xs text-muted-foreground">
                {t("messages.interviewAssignments.tickToCompare")}
              </span>
            )}
          </div>
          {createdByMe.map((row) => (
            <InterviewRow
              key={row.id}
              row={row}
              perspective="creator"
              onResend={handleResend}
              selectable={createdByMe.length >= 2}
              selected={selected.includes(row.id)}
              onToggleSelect={toggleSelected}
            />
          ))}
          {selected.length >= 2 && (
            <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-2 rounded-md border bg-background/95 backdrop-blur p-3 shadow">
              <span className="text-sm font-medium">{t("labels.interviewAssignments.selectedCount", { count: selected.length })}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                  {t("actions.clear")}
                </Button>
                <Button size="sm" onClick={() => navigate(buildInterviewCompareHref(selected))}>
                  {t("actions.interviewAssignments.compareCount", { count: selected.length })}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {createdByMe.length === 0 && assignedToMe.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Users className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">{t("messages.interviewAssignments.empty")}</p>
            <Button asChild>
              <Link to="/tools/interview-questions">{t("actions.interviewAssignments.generateQuestions")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailView({ id }: { id: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    interview: InterviewAssignmentRow;
    responses: AssignmentResponse[];
    candidate: { id: string; name: string | null; email: string | null } | null;
    viewerRole: "creator" | "candidate";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    return getInterviewReport(id)
      .then((report) => {
        setData(report);
        setError(null);
      })
      .catch((err) => setError(err?.message ?? t("errors.interviewAssignments.loadOne")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const responsesByQuestion = useMemo(() => {
    const map = new Map<string, AssignmentResponse>();
    if (data) data.responses.forEach((r) => map.set(r.questionId, r));
    return map;
  }, [data]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ?? t("errors.interviewAssignments.notFound")}</AlertDescription>
      </Alert>
    );
  }

  const { interview, responses, candidate, viewerRole } = data;
  const isCreator = viewerRole === "creator";

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/interview-assignments">
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("actions.interviewAssignments.allAssignments")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>{interview.title}</span>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={interview.status} />
              {interview.decision && <DecisionBadge decision={interview.decision} />}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {interview.targetRole && (
            <p>
              <span className="font-medium">{t("labels.interviewAssignments.targetRole")}</span> {interview.targetRole}
            </p>
          )}
          {interview.instructions && (
            <p className="text-muted-foreground">{interview.instructions}</p>
          )}
          {isCreator && candidate && (
            <p className="text-muted-foreground">
              <span className="font-medium">{t("labels.interviewAssignments.candidate")}</span> {candidate.name ?? candidate.email ?? t("labels.interviewAssignments.unknown")}
              {candidate.email && candidate.name ? ` · ${candidate.email}` : ""}
            </p>
          )}
          {interview.questionResponseDeadline && (
            <p className="text-muted-foreground">
              <span className="font-medium">{t("labels.interviewAssignments.responseDeadline")}</span>{" "}
              {new Date(interview.questionResponseDeadline).toLocaleString()}
            </p>
          )}
          {viewerRole === "candidate" && interview.status !== "submitted" && interview.inviteToken && (
            <div className="pt-3">
              <Button asChild>
                <Link to={`/interview/${interview.inviteToken}`}>
                  {responses.length > 0 ? t("actions.interviewAssignments.continueAnswering") : t("actions.interviewAssignments.startAnswering")}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isCreator && (
        <RecruiterActionsCard
          interview={interview}
          responses={responses}
          onChanged={refresh}
        />
      )}

      <div className="space-y-3">
        {interview.questions.map((q, i) => {
          const r = responsesByQuestion.get(q.id);
          return (
            <Card key={q.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {t("labels.interviewAssignments.questionNumber", { number: i + 1 })} {q.text}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {q.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {t("labels.interview.seconds", { count: q.maxDurationSec })}
                  </Badge>
                  {r && (
                    <Badge className="bg-brand-green/15 text-brand-green-text text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {r.responseMode === "text" ? (
                        <>
                          <Type className="h-3 w-3 mr-1" /> {t("labels.interviewAssignments.text")}
                        </>
                      ) : (
                        <>
                          <Mic className="h-3 w-3 mr-1" /> {t("labels.interviewAssignments.video")}
                        </>
                      )}
                    </Badge>
                  )}
                  {r && r.attempt > 1 && (
                    <Badge variant="outline" className="text-[10px]">
                      <RotateCcw className="h-2.5 w-2.5 mr-1" />
                      {t("labels.interviewAssignments.take", { number: r.attempt })}
                    </Badge>
                  )}
                  {r && typeof r.aiScore === "number" && (
                    <Badge className="bg-accent text-accent-foreground text-[10px]">
                      <Sparkles className="h-3 w-3 mr-1" />
                      {t("labels.interviewAssignments.aiScore", { score: r.aiScore.toFixed(1) })}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {r ? (
                  <div className="space-y-3">
                    {r.responseMode === "text" ? (
                      <p className="text-sm whitespace-pre-wrap">{r.textAnswer ?? ""}</p>
                    ) : r.videoUrl ? (
                      <>
                        <video
                          src={r.videoUrl}
                          controls
                          className="w-full max-w-md rounded-md"
                          preload="metadata"
                        />
                        {r.transcription && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">{t("labels.interviewAssignments.transcript")}</summary>
                            <p className="whitespace-pre-wrap mt-2">{r.transcription}</p>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        {t("messages.interviewAssignments.videoNotUploaded")}
                      </p>
                    )}
                    {isCreator && <AnswerAIPanel interviewId={interview.id} response={r} onScored={refresh} />}
                    {isCreator && <TranscriptionStatus response={r} onRefresh={refresh} />}
                    {isCreator && <ProctoringStrip response={r} />}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{t("messages.interviewAssignments.noAnswerYet")}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recruiter actions: AI scoring + decision ───────────────────────────────

function RecruiterActionsCard({
  interview,
  responses,
  onChanged,
}: {
  interview: InterviewAssignmentRow;
  responses: AssignmentResponse[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [scoringAll, setScoringAll] = useState(false);
  const [decidingTo, setDecidingTo] = useState<InterviewDecision | null>(null);
  const [reason, setReason] = useState(interview.decisionReason ?? "");
  const [reasonOpen, setReasonOpen] = useState(false);

  const scored = responses.filter((r) => typeof r.aiScore === "number").length;
  const total = responses.length;

  async function handleScoreAll() {
    setScoringAll(true);
    try {
      const { scoredCount, overall, coverage } = await scoreAllAnswers(interview.id);
      toast.success(
        scoredCount > 0
          ? t("messages.interviewAssignments.scoredNew", { count: scoredCount, overall: overall.toFixed(1), coverage })
          : t("messages.interviewAssignments.nothingToScore", { overall: overall.toFixed(1) }),
      );
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.interviewAssignments.scoreAll"));
    } finally {
      setScoringAll(false);
    }
  }

  async function handleDecide(d: InterviewDecision | null) {
    setDecidingTo(d);
    try {
      await setInterviewDecision(interview.id, d, reason.trim() || undefined);
      toast.success(
        d
          ? t("messages.interviewAssignments.markedDecision", { decision: t(`labels.interviewAssignments.decision.${d}`) })
          : t("messages.interviewAssignments.decisionCleared"),
      );
      setReasonOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.interviewAssignments.saveDecision"));
    } finally {
      setDecidingTo(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-primary" />
          {t("headings.interviewAssignments.recruiterReview")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleScoreAll} disabled={scoringAll || total === 0}>
            {scoringAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {t("actions.interviewAssignments.scoreEveryAnswer")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("labels.interviewAssignments.scoredOfTotal", { scored, total })}
          </span>
          {typeof interview.aiOverallScore === "number" && (
            <Badge className="bg-accent text-accent-foreground">
              {t("labels.interviewAssignments.overallScore", { score: interview.aiOverallScore.toFixed(1) })}
            </Badge>
          )}
        </div>
        {interview.aiOverallSummary && (
          <p className="text-xs text-muted-foreground italic">{interview.aiOverallSummary}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap border-t pt-3">
          <span className="text-xs font-medium">{t("labels.interviewAssignments.decisionLabel")}</span>
          <Button
            size="sm"
            variant={interview.decision === "shortlist" ? "default" : "outline"}
            onClick={() => handleDecide("shortlist")}
            disabled={decidingTo === "shortlist"}
            className="gap-1"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {t("labels.interviewAssignments.decision.shortlist")}
          </Button>
          <Button
            size="sm"
            variant={interview.decision === "maybe" ? "default" : "outline"}
            onClick={() => handleDecide("maybe")}
            disabled={decidingTo === "maybe"}
          >
            {t("labels.interviewAssignments.decision.maybe")}
          </Button>
          <Button
            size="sm"
            variant={interview.decision === "reject" ? "destructive" : "outline"}
            onClick={() => handleDecide("reject")}
            disabled={decidingTo === "reject"}
            className="gap-1"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {t("actions.reject")}
          </Button>
          {interview.decision && (
            <Button size="sm" variant="ghost" onClick={() => handleDecide(null)}>
              {t("actions.clear")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setReasonOpen((o) => !o)}>
            {reasonOpen ? t("actions.interviewAssignments.hideNote") : t("actions.interviewAssignments.addNote")}
          </Button>
        </div>
        {reasonOpen && (
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("labels.interviewAssignments.decisionReasonPlaceholder")}
            rows={2}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AnswerAIPanel({
  interviewId,
  response,
  onScored,
}: {
  interviewId: string;
  response: AssignmentResponse;
  onScored: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [scoring, setScoring] = useState(false);

  async function handleScore() {
    setScoring(true);
    try {
      await scoreSingleAnswer(interviewId, response.id);
      await onScored();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.interviewAssignments.scoreOne"));
    } finally {
      setScoring(false);
    }
  }

  if (typeof response.aiScore !== "number") {
    return (
      <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("messages.interviewAssignments.noAiScoreYet")}</span>
        <Button size="sm" variant="outline" onClick={handleScore} disabled={scoring}>
          {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          {t("actions.interviewAssignments.scoreWithAi")}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-accent/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t("labels.interviewAssignments.aiScoreFull", { score: response.aiScore.toFixed(1) })}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={handleScore} disabled={scoring}>
          {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {t("actions.interviewAssignments.reScore")}
        </Button>
      </div>
      {response.aiSummary && (
        <p className="text-xs italic text-muted-foreground">{response.aiSummary}</p>
      )}
      {response.aiScoreBreakdown && <BreakdownGrid breakdown={response.aiScoreBreakdown} />}
      {(response.aiStrengths?.length ?? 0) > 0 && (
        <div className="text-xs">
          <span className="font-medium text-brand-green-text">{t("labels.interviewAssignments.strengthsLabel")} </span>
          <span className="text-muted-foreground">{response.aiStrengths!.join(" · ")}</span>
        </div>
      )}
      {(response.aiConcerns?.length ?? 0) > 0 && (
        <div className="text-xs">
          <span className="font-medium text-destructive">{t("labels.interviewAssignments.concernsLabel")} </span>
          <span className="text-muted-foreground">{response.aiConcerns!.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

function BreakdownGrid({ breakdown }: { breakdown: AnswerScoreBreakdown }) {
  const { t } = useTranslation();
  const rows: Array<{ label: string; value: number }> = [
    { label: t("studio.interviewPractice.star.situation.title"), value: breakdown.situation },
    { label: t("studio.interviewPractice.star.task.title"), value: breakdown.task },
    { label: t("studio.interviewPractice.star.action.title"), value: breakdown.action },
    { label: t("studio.interviewPractice.star.result.title"), value: breakdown.result },
    { label: t("labels.interviewAssignments.skillProbe"), value: breakdown.skillProbe },
  ];
  return (
    <div className="grid grid-cols-5 gap-2 text-[10px]">
      {rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium">{r.value.toFixed(0)}</span>
          </div>
          <Progress value={r.value * 10} className="h-1" />
        </div>
      ))}
    </div>
  );
}

function ProctoringStrip({ response }: { response: AssignmentResponse }) {
  const { t } = useTranslation();
  const p = response.proctoringFlags ?? { tabBlurCount: 0, pasteCount: 0, copyCount: 0, fullscreenExits: 0, prepUsedSec: 0, retakesUsed: 0 };
  const hasFlags =
    p.tabBlurCount > 0 ||
    p.pasteCount > 0 ||
    p.copyCount > 0 ||
    p.fullscreenExits > 0 ||
    p.retakesUsed > 0;
  if (!hasFlags) return null;
  const tone = p.tabBlurCount > 3 || p.pasteCount > 2 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";
  return (
    <div className={`flex items-center gap-3 text-[11px] ${tone}`}>
      <AlertTriangle className="h-3 w-3" />
      <span>
        {t("labels.interviewAssignments.proctoring", {
          tabBlurs: p.tabBlurCount,
          pastes: p.pasteCount,
          copies: p.copyCount,
          retakes: p.retakesUsed,
          prepSec: p.prepUsedSec,
        })}
      </span>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: InterviewDecision }) {
  const { t } = useTranslation();
  const styles: Record<InterviewDecision, string> = {
    shortlist: "bg-brand-green/15 text-brand-green-text",
    maybe: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    reject: "bg-destructive/10 text-destructive",
  };
  return <Badge className={styles[decision]}>{t(`labels.interviewAssignments.decision.${decision}`)}</Badge>;
}

// ─── Compare view (#1235) ──────────────────────────────────────────────────

function CompareView({ ids }: { ids: string[] }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Awaited<ReturnType<typeof compareInterviews>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    compareInterviews(ids)
      .then(setData)
      .catch((err) => setError(err?.message ?? t("errors.interviewAssignments.loadComparison")))
      .finally(() => setLoading(false));
  }, [ids.join(",")]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return <Alert variant="destructive"><AlertDescription>{error ?? t("messages.interviewAssignments.noData")}</AlertDescription></Alert>;
  }
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/interview-assignments">
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("actions.interviewAssignments.backToAssignments")}
        </Link>
      </Button>
      <div className="overflow-x-auto">
        <div
          className="grid gap-4 min-w-fit"
          style={{ gridTemplateColumns: `repeat(${data.interviews.length}, minmax(260px, 1fr))` }}
        >
          {data.interviews.map(({ interview, responses }) => (
            <Card key={interview.id} className="min-w-[260px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">{interview.title}</span>
                  <StatusBadge status={interview.status} />
                </CardTitle>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {interview.decision && <DecisionBadge decision={interview.decision} />}
                  {typeof interview.aiOverallScore === "number" && (
                    <Badge className="bg-accent text-accent-foreground text-[10px]">
                      <Sparkles className="h-3 w-3 mr-1" />
                      {interview.aiOverallScore.toFixed(1)}/10
                    </Badge>
                  )}
                </div>
                {interview.candidateEmail && (
                  <p className="text-xs text-muted-foreground mt-1">{interview.candidateEmail}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {responses.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">{t("messages.interviewAssignments.noAnswersYet")}</p>
                ) : (
                  responses.map((r, i) => (
                    <div key={r.id} className="border-t pt-2 first:border-t-0 first:pt-0">
                      <div className="text-xs font-medium">{t("labels.interview.qShort", { number: i + 1 })}</div>
                      {typeof r.aiScore === "number" ? (
                        <Badge className="bg-accent text-accent-foreground text-[10px]">
                          {t("labels.interviewAssignments.aiScoreShort", { score: r.aiScore.toFixed(1) })}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">{t("labels.interviewAssignments.notScored")}</span>
                      )}
                      {r.aiSummary && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{r.aiSummary}</p>
                      )}
                    </div>
                  ))
                )}
                <Link
                  to={`/interview-assignments/${interview.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  {t("actions.interviewAssignments.openFullReview")}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MyInterviewAssignments() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const compareIds = useMemo(
    () => parseCompareIds(searchParams.get("ids")),
    [searchParams],
  );
  // The compare route lives at /interview-assignments/compare. React-Router
  // resolves it via the same component as the list view; we branch on the
  // `:id` param string.
  const isCompareRoute = id === "compare";

  useEffect(() => {
    if (!isAuthenticated) navigate("/login?next=/interview-assignments");
  }, [isAuthenticated, navigate]);

  return (
    <AppShell bgClassName="bg-background">
      <div className={APP_PAGE_COLUMN}>
        <PageHeader
          title={isCompareRoute ? t("headings.interviewAssignments.compareTitle") : t("headings.interviewAssignments.pageTitle")}
          actions={
            !isCompareRoute ? (
              <Button asChild variant="outline">
                <Link to="/tools/interview-questions">
                  <Copy className="h-4 w-4 mr-1.5" />
                  {t("actions.interviewAssignments.newQuestionSet")}
                </Link>
              </Button>
            ) : undefined
          }
        />
        {isCompareRoute ? (
          compareIds.length >= 2 ? (
            <CompareView ids={compareIds} />
          ) : (
            <Alert>
              <AlertDescription>
                {t("messages.interviewAssignments.pickToComparePrefix")}{" "}
                <Link to="/interview-assignments" className="underline">{t("messages.interviewAssignments.pickToCompareLink")}</Link>{" "}
                {t("messages.interviewAssignments.pickToCompareSuffix")}
              </AlertDescription>
            </Alert>
          )
        ) : id ? (
          <DetailView id={id} />
        ) : (
          <ListView />
        )}
      </div>
    </AppShell>
  );
}
