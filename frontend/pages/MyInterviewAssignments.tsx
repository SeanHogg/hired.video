// /interview-assignments — shows both:
//   • interviews assigned to me as a job seeker (with my answers)
//   • interviews I created as a recruiter / employer (with candidate responses + resend)
//
// Detail view is reached at /interview-assignments/:id.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
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
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-blue-100 text-blue-800",
    in_progress: "bg-amber-100 text-amber-800",
    submitted: "bg-green-100 text-green-800",
    reviewed: "bg-purple-100 text-purple-800",
    expired: "bg-red-100 text-red-800",
  };
  return <Badge className={styles[status] ?? ""}>{status.replace("_", " ")}</Badge>;
}

function InterviewRow({
  row,
  perspective,
  onResend,
}: {
  row: InterviewAssignmentRow;
  perspective: "creator" | "candidate";
  onResend?: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link to={`/interview-assignments/${row.id}`} className="font-medium text-sm hover:underline">
                {row.title}
              </Link>
              <StatusBadge status={row.status} />
              {row.assignmentType === "invite" && (
                <Badge variant="outline" className="text-[10px]">
                  Invite
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
                {row.questions.length} question{row.questions.length === 1 ? "" : "s"}
              </span>
              {perspective === "creator" && row.candidateEmail && <span>→ {row.candidateEmail}</span>}
              {row.questionResponseDeadline && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Due {new Date(row.questionResponseDeadline).toLocaleDateString()}
                </span>
              )}
              {row.resendCount > 0 && <span>Resent {row.resendCount}×</span>}
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
                Resend
              </Button>
            )}
            <Button asChild size="sm" variant={perspective === "candidate" ? "default" : "outline"}>
              <Link to={`/interview-assignments/${row.id}`}>
                {perspective === "candidate" ? "Open" : "View"}
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ListView() {
  const [createdByMe, setCreatedByMe] = useState<InterviewAssignmentRow[]>([]);
  const [assignedToMe, setAssignedToMe] = useState<InterviewAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listMyInterviewAssignments();
      setCreatedByMe(res.createdByMe);
      setAssignedToMe(res.assignedToMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load interviews");
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
      toast.success("Magic link re-sent");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend");
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
          <h2 className="text-lg font-semibold">Assigned to me</h2>
          {assignedToMe.map((row) => (
            <InterviewRow key={row.id} row={row} perspective="candidate" />
          ))}
        </section>
      )}

      {createdByMe.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Send className="h-4 w-4" />
            Sent by me
          </h2>
          {createdByMe.map((row) => (
            <InterviewRow key={row.id} row={row} perspective="creator" onResend={handleResend} />
          ))}
        </section>
      )}

      {createdByMe.length === 0 && assignedToMe.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Users className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">No interview assignments yet.</p>
            <Button asChild>
              <Link to="/tools/interview-questions">Generate interview questions</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailView({ id }: { id: string }) {
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
      .catch((err) => setError(err?.message ?? "Could not load interview"))
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
        <AlertDescription>{error ?? "Interview not found"}</AlertDescription>
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
          All interview assignments
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
              <span className="font-medium">Target role:</span> {interview.targetRole}
            </p>
          )}
          {interview.instructions && (
            <p className="text-muted-foreground">{interview.instructions}</p>
          )}
          {isCreator && candidate && (
            <p className="text-muted-foreground">
              <span className="font-medium">Candidate:</span> {candidate.name ?? candidate.email ?? "Unknown"}
              {candidate.email && candidate.name ? ` · ${candidate.email}` : ""}
            </p>
          )}
          {interview.questionResponseDeadline && (
            <p className="text-muted-foreground">
              <span className="font-medium">Response deadline:</span>{" "}
              {new Date(interview.questionResponseDeadline).toLocaleString()}
            </p>
          )}
          {viewerRole === "candidate" && interview.status !== "submitted" && interview.inviteToken && (
            <div className="pt-3">
              <Button asChild>
                <Link to={`/interview/${interview.inviteToken}`}>
                  {responses.length > 0 ? "Continue answering" : "Start answering"}
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
                  Q{i + 1}. {q.text}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {q.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {q.maxDurationSec}s
                  </Badge>
                  {r && (
                    <Badge className="bg-green-500/10 text-green-600 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {r.responseMode === "text" ? (
                        <>
                          <Type className="h-3 w-3 mr-1" /> Text
                        </>
                      ) : (
                        <>
                          <Mic className="h-3 w-3 mr-1" /> Video
                        </>
                      )}
                    </Badge>
                  )}
                  {r && r.attempt > 1 && (
                    <Badge variant="outline" className="text-[10px]">
                      <RotateCcw className="h-2.5 w-2.5 mr-1" />
                      Take {r.attempt}
                    </Badge>
                  )}
                  {r && typeof r.aiScore === "number" && (
                    <Badge className="bg-purple-100 text-purple-800 text-[10px]">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI {r.aiScore.toFixed(1)}/10
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
                            <summary className="cursor-pointer">Transcript</summary>
                            <p className="whitespace-pre-wrap mt-2">{r.transcription}</p>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Video recorded but not yet uploaded.
                      </p>
                    )}
                    {isCreator && <AnswerAIPanel interviewId={interview.id} response={r} onScored={refresh} />}
                    {isCreator && <ProctoringStrip response={r} />}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No answer yet.</p>
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
          ? `Scored ${scoredCount} new answer${scoredCount === 1 ? "" : "s"} · overall ${overall.toFixed(1)}/10 (${coverage}% coverage)`
          : `Nothing new to score · overall ${overall.toFixed(1)}/10`,
      );
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not score answers");
    } finally {
      setScoringAll(false);
    }
  }

  async function handleDecide(d: InterviewDecision | null) {
    setDecidingTo(d);
    try {
      await setInterviewDecision(interview.id, d, reason.trim() || undefined);
      toast.success(d ? `Marked ${d}` : "Decision cleared");
      setReasonOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save decision");
    } finally {
      setDecidingTo(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-purple" />
          Recruiter review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleScoreAll} disabled={scoringAll || total === 0}>
            {scoringAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Score every answer with AI
          </Button>
          <span className="text-xs text-muted-foreground">
            {scored}/{total} scored
          </span>
          {typeof interview.aiOverallScore === "number" && (
            <Badge className="bg-purple-100 text-purple-800">
              Overall {interview.aiOverallScore.toFixed(1)}/10
            </Badge>
          )}
        </div>
        {interview.aiOverallSummary && (
          <p className="text-xs text-muted-foreground italic">{interview.aiOverallSummary}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap border-t pt-3">
          <span className="text-xs font-medium">Decision:</span>
          <Button
            size="sm"
            variant={interview.decision === "shortlist" ? "default" : "outline"}
            onClick={() => handleDecide("shortlist")}
            disabled={decidingTo === "shortlist"}
            className="gap-1"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            Shortlist
          </Button>
          <Button
            size="sm"
            variant={interview.decision === "maybe" ? "default" : "outline"}
            onClick={() => handleDecide("maybe")}
            disabled={decidingTo === "maybe"}
          >
            Maybe
          </Button>
          <Button
            size="sm"
            variant={interview.decision === "reject" ? "destructive" : "outline"}
            onClick={() => handleDecide("reject")}
            disabled={decidingTo === "reject"}
            className="gap-1"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Reject
          </Button>
          {interview.decision && (
            <Button size="sm" variant="ghost" onClick={() => handleDecide(null)}>
              Clear
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setReasonOpen((o) => !o)}>
            {reasonOpen ? "Hide note" : "Add note"}
          </Button>
        </div>
        {reasonOpen && (
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this decision? (optional, saved with the decision)"
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
  const [scoring, setScoring] = useState(false);

  async function handleScore() {
    setScoring(true);
    try {
      await scoreSingleAnswer(interviewId, response.id);
      await onScored();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not score this answer");
    } finally {
      setScoring(false);
    }
  }

  if (typeof response.aiScore !== "number") {
    return (
      <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">No AI score yet.</span>
        <Button size="sm" variant="outline" onClick={handleScore} disabled={scoring}>
          {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          Score with AI
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-purple-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-medium">AI score: {response.aiScore.toFixed(1)} / 10</span>
        </div>
        <Button size="sm" variant="ghost" onClick={handleScore} disabled={scoring}>
          {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Re-score
        </Button>
      </div>
      {response.aiSummary && (
        <p className="text-xs italic text-muted-foreground">{response.aiSummary}</p>
      )}
      {response.aiScoreBreakdown && <BreakdownGrid breakdown={response.aiScoreBreakdown} />}
      {(response.aiStrengths?.length ?? 0) > 0 && (
        <div className="text-xs">
          <span className="font-medium text-green-700">Strengths: </span>
          <span className="text-muted-foreground">{response.aiStrengths!.join(" · ")}</span>
        </div>
      )}
      {(response.aiConcerns?.length ?? 0) > 0 && (
        <div className="text-xs">
          <span className="font-medium text-red-700">Concerns: </span>
          <span className="text-muted-foreground">{response.aiConcerns!.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

function BreakdownGrid({ breakdown }: { breakdown: AnswerScoreBreakdown }) {
  const rows: Array<{ label: string; value: number }> = [
    { label: "Situation", value: breakdown.situation },
    { label: "Task", value: breakdown.task },
    { label: "Action", value: breakdown.action },
    { label: "Result", value: breakdown.result },
    { label: "Skill probe", value: breakdown.skillProbe },
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
  const p = response.proctoringFlags ?? { tabBlurCount: 0, pasteCount: 0, copyCount: 0, fullscreenExits: 0, prepUsedSec: 0, retakesUsed: 0 };
  const hasFlags =
    p.tabBlurCount > 0 ||
    p.pasteCount > 0 ||
    p.copyCount > 0 ||
    p.fullscreenExits > 0 ||
    p.retakesUsed > 0;
  if (!hasFlags) return null;
  const tone = p.tabBlurCount > 3 || p.pasteCount > 2 ? "text-amber-700" : "text-muted-foreground";
  return (
    <div className={`flex items-center gap-3 text-[11px] ${tone}`}>
      <AlertTriangle className="h-3 w-3" />
      <span>
        Proctoring: {p.tabBlurCount} tab blurs · {p.pasteCount} pastes · {p.copyCount} copies · {p.retakesUsed} retakes · {p.prepUsedSec}s prep used
      </span>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: InterviewDecision }) {
  const styles: Record<InterviewDecision, string> = {
    shortlist: "bg-green-100 text-green-800",
    maybe: "bg-amber-100 text-amber-800",
    reject: "bg-red-100 text-red-800",
  };
  return <Badge className={styles[decision]}>{decision}</Badge>;
}

export default function MyInterviewAssignments() {
  const { isAuthenticated } = useAuth();
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) navigate("/login?next=/interview-assignments");
  }, [isAuthenticated, navigate]);

  return (
    <AppShell>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
          <h1 className="text-2xl font-bold">Interview assignments</h1>
          <Button asChild variant="outline">
            <Link to="/tools/interview-questions">
              <Copy className="h-4 w-4 mr-1.5" />
              New question set
            </Link>
          </Button>
        </div>
        {id ? <DetailView id={id} /> : <ListView />}
      </div>
    </AppShell>
  );
}
