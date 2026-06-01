// eslint-page-chrome: skip - full-screen studio surface - composes its own chrome (pre-existing; #1869).
/**
 * AsyncInterviewPage — candidate-facing magic-link page at /interview/:token.
 *
 * Three entry paths land here:
 *   1. Legacy AsyncInterviewManager (recruiter Studio Features Hub) creates a
 *      token via POST /api/studio/async-interview.
 *   2. The Interview Questions tool (POST /api/interview-assignments/assign).
 *   3. The job apply flow (POST /api/jobs/:id/apply) when the job has a
 *      screening question set attached — assignmentType === 'screening'.
 *
 * Recorder + proctoring upgrades shipped in 0120:
 *   - Per-question prep timer (defaults to set.prepTimeSec, or 10s)
 *   - Per-question countdown timer + auto-submit on time-up
 *   - Re-record affordance bounded by interview.maxRetakes
 *   - Tab-blur / paste / copy / fullscreen-exit counters via
 *     useProctoringSignals, surfaced as a discreet status pill but stored
 *     against the response so the recruiter can see them at review time
 *   - "Practise with AI Coach" link inline so candidates have a low-stakes
 *     dry-run option before they submit a real take
 *
 * The page is public (no auth) so the preview can render. Answering still
 * requires a signed-in job_seeker; invite-type rows redirect to /signup
 * with a `next=` deep-link, and screening rows auto-claim through the same
 * mechanism since the candidate is already authenticated from the apply flow.
 */

import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  MessageSquare,
  RotateCcw,
  Sparkles,
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
import { useProctoringSignals } from "@/hooks/use-proctoring-signals";
import {
  buildAICoachPracticeHref,
  claimInterviewInvite,
  finalizeInterviewAssignment,
  getInterviewInvitePreview,
  submitInterviewResponse,
  type GeneratedQuestion,
  type InvitePreview,
} from "@/lib/services/interview-assignments-service";
import { uploadRecording } from "@/lib/services/studio-features-service";

const WebcamRecorder = lazy(() =>
  import("@/components/studio/WebcamRecorder").then((m) => ({ default: m.WebcamRecorder })),
);

type ResponseMode = "text" | "video";

interface AnswerSaved {
  mode: ResponseMode;
  text?: string;
  videoDurationMs?: number;
  attempt: number;
}

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
  const [answers, setAnswers] = useState<Record<string, AnswerSaved>>({});
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

  // 2. Auto-claim once authenticated as a job seeker.
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

  // ─── Gates ────────────────────────────────────────────────────────────────
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
          This magic link has expired. Ask the recruiter to re-send a fresh one.
        </p>
      </CenteredCard>
    );
  }

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

  // ─── Active interview ────────────────────────────────────────────────────
  return (
    <ActiveInterview
      preview={preview}
      currentIdx={currentIdx}
      setCurrentIdx={setCurrentIdx}
      responseMode={responseMode}
      setResponseMode={setResponseMode}
      answers={answers}
      setAnswers={setAnswers}
      submitting={submitting}
      setSubmitting={setSubmitting}
      onSubmitted={() => setDone(true)}
      onError={setError}
      navigate={navigate}
      error={error}
    />
  );
}

// ─── ActiveInterview — split out so the per-question proctoring hook key changes ───

interface ActiveInterviewProps {
  preview: InvitePreview;
  currentIdx: number;
  setCurrentIdx: (n: number | ((p: number) => number)) => void;
  responseMode: ResponseMode;
  setResponseMode: (m: ResponseMode) => void;
  answers: Record<string, AnswerSaved>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, AnswerSaved>>>;
  submitting: boolean;
  setSubmitting: (b: boolean) => void;
  onSubmitted: () => void;
  onError: (s: string) => void;
  navigate: (path: string) => void;
  error: string | null;
}

function ActiveInterview({
  preview,
  currentIdx,
  setCurrentIdx,
  responseMode,
  setResponseMode,
  answers,
  setAnswers,
  submitting,
  setSubmitting,
  onSubmitted,
  onError,
  navigate,
  error,
}: ActiveInterviewProps) {
  const questions = (preview.questions ?? []) as GeneratedQuestion[];
  const currentQuestion = questions[currentIdx];
  const totalQuestions = questions.length;
  const progress = (Object.keys(answers).length / totalQuestions) * 100;
  const allAnswered = questions.every((q) => answers[q.id] || !q.required);

  // ─── Per-question prep + retake state ─────────────────────────────────────
  // Reset prep + retake counters every time the question changes.
  const [prepRemaining, setPrepRemaining] = useState<number>(preview.prepTimeSec);
  const [prepDone, setPrepDone] = useState<boolean>(preview.prepTimeSec === 0);
  const [retakesUsed, setRetakesUsed] = useState<number>(0);
  const proctoring = useProctoringSignals({
    enabled: preview.proctoringOn,
    scope: currentQuestion?.id,
  });
  const proctoringRef = useRef(proctoring);
  proctoringRef.current = proctoring;

  // Reset prep / retake whenever the candidate moves to a new question.
  useEffect(() => {
    setPrepRemaining(preview.prepTimeSec);
    setPrepDone(preview.prepTimeSec === 0);
    setRetakesUsed(0);
    proctoringRef.current.reset();
  }, [currentQuestion?.id, preview.prepTimeSec]);

  // Tick the prep countdown.
  useEffect(() => {
    if (prepDone) return;
    if (prepRemaining <= 0) {
      setPrepDone(true);
      return;
    }
    const t = setTimeout(() => {
      setPrepRemaining((s) => s - 1);
      proctoringRef.current.addPrepTime(1);
    }, 1000);
    return () => clearTimeout(t);
  }, [prepDone, prepRemaining]);

  const retakesAllowed = preview.maxRetakes;
  const canRetake = answers[currentQuestion?.id ?? ""] && retakesUsed < retakesAllowed;

  // ─── Save handlers ────────────────────────────────────────────────────────
  async function saveAnswer(
    mode: ResponseMode,
    params: { text?: string; videoBlob?: Blob; videoDurationMs?: number },
  ) {
    if (!currentQuestion) return;
    const attempt = (answers[currentQuestion.id]?.attempt ?? 0) + 1;
    let videoUrl: string | null | undefined;
    let recordingId: string | undefined;
    // #967 — Video answers now actually upload the Blob. The previous
    // path persisted only `durationMs`; the recruiter side saw no video
    // even after the candidate "submitted". Route through the same
    // `uploadRecording` helper the studio recorder uses, then forward
    // the resulting `videoUrl` + `recordingId` to /respond.
    if (mode === "video" && params.videoBlob) {
      try {
        const file = new File([params.videoBlob], `interview-${currentQuestion.id}-${attempt}.webm`, {
          type: params.videoBlob.type || "video/webm",
        });
        const uploaded = await uploadRecording(file, "webcam", undefined, params.videoDurationMs);
        videoUrl = uploaded.videoUrl;
        recordingId = uploaded.id;
      } catch (err) {
        onError(err instanceof Error ? err.message : "Could not upload video answer");
        return;
      }
    }
    try {
      await submitInterviewResponse(preview.id, {
        questionId: currentQuestion.id,
        responseMode: mode,
        textAnswer: params.text,
        durationMs: params.videoDurationMs,
        videoUrl: videoUrl ?? undefined,
        recordingId,
        proctoringFlags: proctoring.snapshot(),
        attempt,
      } as never);
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          mode,
          text: params.text,
          videoDurationMs: params.videoDurationMs,
          attempt,
        },
      }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save answer");
    }
  }

  function handleRetake() {
    if (!currentQuestion) return;
    // Drop the saved answer locally so the recorder/text-editor re-shows the
    // input. The server-side row stays so the AI score on the previous take
    // is overwritten by the next /respond call (the route clears stale AI
    // scoring on every re-record).
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[currentQuestion.id];
      return next;
    });
    setRetakesUsed((n) => n + 1);
    proctoring.recordRetake();
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await finalizeInterviewAssignment(preview.id);
      onSubmitted();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── AI Coach hand-off ───────────────────────────────────────────────────
  const aiCoachHref = useMemo(
    () =>
      buildAICoachPracticeHref({
        questions,
        targetRole: preview.targetRole,
        sourceDescription: preview.title,
      }),
    [questions, preview.targetRole, preview.title],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{preview.title}</h1>
          {preview.instructions && <p className="text-muted-foreground mb-4">{preview.instructions}</p>}
          <div className="flex gap-2 flex-wrap items-center">
            {preview.assignmentType === "screening" && (
              <Badge className="bg-blue-100 text-blue-800">
                <Sparkles className="h-3 w-3 mr-1" />
                Job screening
              </Badge>
            )}
            {preview.targetRole && (
              <Badge variant="outline">{preview.targetRole}</Badge>
            )}
            {preview.questionResponseDeadline && (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                Due: {new Date(preview.questionResponseDeadline).toLocaleString()}
              </Badge>
            )}
            <Button asChild variant="ghost" size="sm" className="gap-1 ml-auto">
              <a href={aiCoachHref}>
                <MessageSquare className="h-3.5 w-3.5" />
                Practise with AI Coach
              </a>
            </Button>
          </div>
        </div>

        {/* Progress */}
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
                {retakesAllowed > 0 && (
                  <Badge variant="outline">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {retakesUsed}/{retakesAllowed} retakes used
                  </Badge>
                )}
                {currentQuestion.required && <Badge variant="destructive">Required</Badge>}
                {answers[currentQuestion.id] && (
                  <Badge className="bg-green-500/10 text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Saved
                  </Badge>
                )}
                {preview.proctoringOn && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Eye className="h-3 w-3" />
                    Proctored: blurs {proctoring.flags.tabBlurCount} · pastes{" "}
                    {proctoring.flags.pasteCount}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!prepDone ? (
                <PrepCountdown
                  remaining={prepRemaining}
                  total={preview.prepTimeSec}
                  onSkip={() => setPrepDone(true)}
                />
              ) : (
                <>
                  <Tabs value={responseMode} onValueChange={(v) => setResponseMode(v as ResponseMode)}>
                    <TabsList>
                      <TabsTrigger value="text" className="gap-1">
                        <Type className="h-3.5 w-3.5" />
                        Text
                      </TabsTrigger>
                      <TabsTrigger value="video" className="gap-1">
                        <Video className="h-3.5 w-3.5" />
                        Video
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {responseMode === "text" ? (
                    <TextAnswerEditor
                      key={`${currentQuestion.id}-${retakesUsed}`}
                      initial={answers[currentQuestion.id]?.text ?? ""}
                      maxSeconds={currentQuestion.maxDurationSec}
                      onSave={(text) => saveAnswer("text", { text })}
                    />
                  ) : (
                    <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin mx-auto" />}>
                      <WebcamRecorder
                        key={`${currentQuestion.id}-${retakesUsed}`}
                        onRecordingComplete={(blob, durationMs) =>
                          // #967 — pass the Blob through so saveAnswer
                          // can upload it via uploadRecording.
                          saveAnswer("video", { videoBlob: blob, videoDurationMs: durationMs })
                        }
                        mode="webcam"
                        maxDurationSec={currentQuestion.maxDurationSec}
                      />
                    </Suspense>
                  )}
                  {canRetake && (
                    <Button variant="outline" size="sm" onClick={handleRetake} className="gap-1">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Re-record this answer ({retakesAllowed - retakesUsed} left)
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Nav */}
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

function PrepCountdown({
  remaining,
  total,
  onSkip,
}: {
  remaining: number;
  total: number;
  onSkip: () => void;
}) {
  const pct = total > 0 ? Math.max(0, Math.round(((total - remaining) / total) * 100)) : 100;
  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-4 text-center space-y-3">
      <div className="flex items-center justify-center gap-2 text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span className="text-sm">Take a moment to think before you start recording</span>
      </div>
      <div className="text-3xl font-bold">{remaining}s</div>
      <Progress value={pct} className="h-1" />
      <Button variant="ghost" size="sm" onClick={onSkip}>
        I'm ready — start now
      </Button>
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
