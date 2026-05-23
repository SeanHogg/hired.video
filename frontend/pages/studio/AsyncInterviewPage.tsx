/**
 * AsyncInterviewPage — candidate-facing magic-link page at /interview/:token.
 *
 * Two routes feed it:
 *   - The legacy AsyncInterviewManager (recruiter Studio Features Hub)
 *     creates a token via POST /api/studio/async-interview and lands
 *     candidates here.
 *   - The new Interview Questions tool (POST /api/interview-assignments/assign)
 *     does the same; tokens are stored in the same studio_async_interviews
 *     table, so this page reads them through the new
 *     /api/interview-assignments/invite/:token endpoint.
 *
 * Both flows share this surface: the page is public (no auth required)
 * to fetch the preview, but answering requires the candidate to be
 * signed in as a job_seeker. For "invite" assignments where the
 * candidate doesn't have an account yet, the page redirects to /signup
 * with a `next=/interview/<token>` deep-link so they return here once
 * verified, then auto-claim the assignment.
 */

import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Mic,
  Type,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { USER_ROLES } from "@shared/user-roles";
import {
  claimInterviewInvite,
  finalizeInterviewAssignment,
  getInterviewInvitePreview,
  submitInterviewResponse,
  type GeneratedQuestion,
  type InvitePreview,
} from "@/lib/services/interview-assignments-service";

const WebcamRecorder = lazy(() =>
  import("@/components/studio/WebcamRecorder").then((m) => ({ default: m.WebcamRecorder })),
);

type ResponseMode = "text" | "video";

export default function AsyncInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { mode: ResponseMode; text?: string; videoDurationMs?: number }>>({});
  const [responseMode, setResponseMode] = useState<ResponseMode>("text");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // 1. Public preview fetch — no auth required.
  useEffect(() => {
    if (!token) return;
    getInterviewInvitePreview(token)
      .then((p) => {
        setPreview(p);
        if (p.candidateBound) setClaimed(true);
      })
      .catch((err) => setError(err?.message ?? "Interview not found"))
      .finally(() => setLoading(false));
  }, [token]);

  // 2. Auto-claim once authenticated as a job seeker. Strict-assign rows
  //    arrive pre-bound (preview.candidateBound === true); invite rows
  //    require this explicit claim before /respond will accept us.
  useEffect(() => {
    if (!token || !preview || claimed || claiming) return;
    if (!isAuthenticated || !user) return;
    if (user.role !== USER_ROLES.JOB_SEEKER) return;
    setClaiming(true);
    claimInterviewInvite(token)
      .then(() => setClaimed(true))
      .catch((err) => setError(err?.message ?? "Could not claim invite"))
      .finally(() => setClaiming(false));
  }, [token, preview, claimed, claiming, isAuthenticated, user]);

  // ─── Loading / error / signup gates ──────────────────────────────────────
  if (loading) {
    return (
      <CenteredCard>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </CenteredCard>
    );
  }
  if (error || !preview) {
    return (
      <CenteredCard>
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Interview not available</h2>
        <p className="text-muted-foreground">{error ?? "This interview link is invalid or has expired."}</p>
      </CenteredCard>
    );
  }
  if (preview.expired) {
    return (
      <CenteredCard>
        <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Link expired</h2>
        <p className="text-muted-foreground mb-4">
          This magic link has expired. Ask the recruiter to re-send a fresh one — they have a "Resend link" button on
          their side.
        </p>
      </CenteredCard>
    );
  }

  // Invite flow: candidate isn't logged in yet → bounce to signup with
  // ?next= preserved so the page reloads after they verify.
  if (!isAuthenticated) {
    const nextHref = `/interview/${token}`;
    const isInvite = preview.assignmentType === "invite";
    return (
      <CenteredCard>
        <h2 className="text-xl font-bold mb-2">{preview.title}</h2>
        {preview.instructions && (
          <p className="text-muted-foreground mb-4">{preview.instructions}</p>
        )}
        <p className="text-sm text-muted-foreground mb-4">
          {isInvite
            ? "Create a free job-seeker account to answer the questions."
            : "Sign in to answer the questions."}
        </p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() =>
              navigate(
                isInvite
                  ? `/signup?role=job_seeker&email=${encodeURIComponent(preview.candidateEmail ?? "")}&next=${encodeURIComponent(nextHref)}`
                  : `/login?next=${encodeURIComponent(nextHref)}`,
              )
            }
          >
            {isInvite ? "Create job-seeker account" : "Sign in"}
          </Button>
          {isInvite && (
            <Button variant="ghost" onClick={() => navigate(`/login?next=${encodeURIComponent(nextHref)}`)}>
              Already have an account? Sign in
            </Button>
          )}
        </div>
      </CenteredCard>
    );
  }

  // Authenticated but not as a job_seeker — refuse with a clear error
  // rather than silently letting a recruiter answer their own assignment.
  if (user && user.role !== USER_ROLES.JOB_SEEKER) {
    return (
      <CenteredCard>
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Job-seeker account required</h2>
        <p className="text-muted-foreground">
          Interview assignments can only be answered by a job-seeker account. Sign out and sign in with the address
          that received the invite, or create a new job-seeker account.
        </p>
      </CenteredCard>
    );
  }

  if (claiming || (!claimed && preview.assignmentType !== "self")) {
    return (
      <CenteredCard>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-3">Linking this interview to your account…</p>
      </CenteredCard>
    );
  }

  if (done) {
    return (
      <CenteredCard>
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Interview submitted</h2>
        <p className="text-muted-foreground">
          Your responses are with the recruiter. You can review them anytime under your interview assignments.
        </p>
        <Button className="mt-4" onClick={() => navigate("/interview-assignments")}>
          View my answers
        </Button>
      </CenteredCard>
    );
  }

  // ─── Answer flow ─────────────────────────────────────────────────────────
  const questions = (preview.questions ?? []) as GeneratedQuestion[];
  const currentQuestion = questions[currentIdx];
  const totalQuestions = questions.length;
  const progress = (Object.keys(answers).length / totalQuestions) * 100;
  const allAnswered = questions.every((q) => answers[q.id] || !q.required);

  async function saveAnswer(mode: ResponseMode, params: { text?: string; videoDurationMs?: number }) {
    if (!currentQuestion || !preview) return;
    try {
      await submitInterviewResponse(preview.id, {
        questionId: currentQuestion.id,
        responseMode: mode,
        textAnswer: params.text,
        durationMs: params.videoDurationMs,
      });
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: { mode, text: params.text, videoDurationMs: params.videoDurationMs },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answer");
    }
  }

  async function handleSubmit() {
    if (!preview) return;
    setSubmitting(true);
    try {
      await finalizeInterviewAssignment(preview.id);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{preview.title}</h1>
          {preview.instructions && <p className="text-muted-foreground mb-4">{preview.instructions}</p>}
          <div className="flex gap-2 flex-wrap">
            {preview.targetRole && (
              <Badge variant="outline">{preview.targetRole}</Badge>
            )}
            {preview.questionResponseDeadline && (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                Due: {new Date(preview.questionResponseDeadline).toLocaleString()}
              </Badge>
            )}
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>
              Question {currentIdx + 1} of {totalQuestions}
            </span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {currentQuestion && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">
                <span className="text-primary mr-2">Q{currentIdx + 1}.</span>
                {currentQuestion.text}
              </CardTitle>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  Max {currentQuestion.maxDurationSec}s
                </Badge>
                {currentQuestion.required && <Badge variant="destructive">Required</Badge>}
                {answers[currentQuestion.id] && (
                  <Badge className="bg-green-500/10 text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Saved
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={responseMode} onValueChange={(v) => setResponseMode(v as ResponseMode)}>
                <TabsList>
                  <TabsTrigger value="text" className="gap-1">
                    <Type className="h-3.5 w-3.5" />
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="video" className="gap-1">
                    <Mic className="h-3.5 w-3.5" />
                    Video
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {responseMode === "text" ? (
                <TextAnswerEditor
                  key={currentQuestion.id}
                  initial={answers[currentQuestion.id]?.text ?? ""}
                  maxSeconds={currentQuestion.maxDurationSec}
                  onSave={(text) => saveAnswer("text", { text })}
                />
              ) : (
                <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin mx-auto" />}>
                  <WebcamRecorder
                    onRecordingComplete={(_blob, durationMs) => saveAnswer("video", { videoDurationMs: durationMs })}
                    mode="webcam"
                    maxDurationSec={currentQuestion.maxDurationSec}
                  />
                </Suspense>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
          >
            Previous
          </Button>
          {currentIdx < totalQuestions - 1 ? (
            <Button onClick={() => setCurrentIdx((i) => Math.min(totalQuestions - 1, i + 1))} className="gap-2">
              Next Question
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit All Responses
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-center gap-2 mt-8">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrentIdx(idx)}
              className={`w-3 h-3 rounded-full transition-colors ${
                idx === currentIdx
                  ? "bg-primary"
                  : answers[q.id]
                    ? "bg-green-500"
                    : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}

function TextAnswerEditor({
  initial,
  onSave,
  maxSeconds,
}: {
  initial: string;
  onSave: (text: string) => Promise<void> | void;
  maxSeconds: number;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder={`Type your answer (aim for what you'd say out loud in ${maxSeconds}s)…`}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{value.split(/\s+/).filter(Boolean).length} words</span>
        <Button size="sm" onClick={handleSave} disabled={saving || !value.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save answer
        </Button>
      </div>
    </div>
  );
}
