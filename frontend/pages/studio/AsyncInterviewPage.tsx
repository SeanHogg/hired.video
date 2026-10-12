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
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
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
import PracticeInterviewButton from "@/components/interview-practice/PracticeInterviewButton";
import {
  claimInterviewInvite,
  finalizeInterviewAssignment,
  getInterviewInvitePreview,
  submitInterviewResponse,
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
  const { t } = useTranslation();
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
      .catch((err) => setError(err?.message ?? t("interviewInvite.notFound")))
      .finally(() => setLoading(false));
  }, [token, t]);

  // 2. Auto-claim once authenticated as a job seeker.
  useEffect(() => {
    if (!token || !preview || claimed || claiming) return;
    if (!isAuthenticated || !user) return;
    if (user.role !== USER_ROLES.JOB_SEEKER) return;
    setClaiming(true);
    claimInterviewInvite(token)
      .then(() => setClaimed(true))
      .catch((err) => setError(err?.message ?? t("interviewInvite.claimFailed")))
      .finally(() => setClaiming(false));
  }, [token, preview, claimed, claiming, isAuthenticated, user, t]);

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
        <h2 className="text-xl font-bold mb-2">{t("interviewInvite.unavailableTitle")}</h2>
        <p className="text-muted-foreground">{error ?? t("studio.async.invalidLink")}</p>
      </CenteredCard>
    );
  }
  if (preview.expired) {
    return (
      <CenteredCard>
        <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">{t("interviewInvite.expiredTitle")}</h2>
        <p className="text-muted-foreground mb-4">{t("interviewInvite.expiredBody")}</p>
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
          {isInvite ? t("interviewInvite.createAccountPrompt") : t("interviewInvite.signInPrompt")}
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
            {isInvite ? t("interviewInvite.createAccount") : t("nav.header.signIn")}
          </Button>
          {isInvite && (
            <Button variant="ghost" onClick={() => navigate(`/login?next=${encodeURIComponent(nextHref)}`)}>
              {t("interviewInvite.alreadyHaveAccount")}
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
        <h2 className="text-xl font-bold mb-2">{t("interviewInvite.jobSeekerRequiredTitle")}</h2>
        <p className="text-muted-foreground">{t("interviewInvite.jobSeekerRequiredBody")}</p>
      </CenteredCard>
    );
  }

  if (claiming || (!claimed && preview.assignmentType !== "self")) {
    return (
      <CenteredCard>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-3">{t("interviewInvite.linking")}</p>
      </CenteredCard>
    );
  }

  if (done) {
    return (
      <CenteredCard>
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">{t("interviewInvite.submittedTitle")}</h2>
        <p className="text-muted-foreground">{t("interviewInvite.submittedBody")}</p>
        <Button className="mt-4" onClick={() => navigate("/interview-assignments")}>
          {t("interviewInvite.viewMyAnswers")}
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
  error,
}: ActiveInterviewProps) {
  const { t } = useTranslation();
  const questions = preview.questions ?? [];
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
    const timer = setTimeout(() => {
      setPrepRemaining((s) => s - 1);
      proctoringRef.current.addPrepTime(1);
    }, 1000);
    return () => clearTimeout(timer);
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
        onError(err instanceof Error ? err.message : t("interviewInvite.uploadFailed"));
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
      onError(err instanceof Error ? err.message : t("interviewInvite.saveFailed"));
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
      onError(err instanceof Error ? err.message : t("interviewInvite.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Practise first, with the interview coach (in place) ────────────────
  const practice = useMemo(
    () => ({ questions, targetRole: preview.targetRole, sourceDescription: preview.title }),
    [questions, preview.targetRole, preview.title],
  );

  return (
    <div className="min-h-screen bg-muted/50">
      <div className="px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{preview.title}</h1>
          {preview.instructions && <p className="text-muted-foreground mb-4">{preview.instructions}</p>}
          <div className="flex gap-2 flex-wrap items-center">
            {preview.assignmentType === "screening" && (
              <Badge className="bg-accent text-accent-foreground">
                <Sparkles className="h-3 w-3 mr-1" />
                {t("interviewInvite.jobScreening")}
              </Badge>
            )}
            {preview.targetRole && (
              <Badge variant="outline">{preview.targetRole}</Badge>
            )}
            {preview.questionResponseDeadline && (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {t("studio.async.due", { date: new Date(preview.questionResponseDeadline).toLocaleString() })}
              </Badge>
            )}
            <div className="ml-auto">
              <PracticeInterviewButton handoff={practice} label={t("actions.interviewQuestions.practiseInCoach")} />
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>{t("studio.async.questionOf", { current: currentIdx + 1, total: totalQuestions })}</span>
            <span>{t("studio.async.percent", { pct: Math.round(progress) })}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {currentQuestion && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">
                <span className="text-primary mr-2">{t("studio.async.questionPrefix", { n: currentIdx + 1 })}</span>
                {currentQuestion.text}
              </CardTitle>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  {t("studio.async.maxSec", { sec: currentQuestion.maxDurationSec })}
                </Badge>
                {retakesAllowed > 0 && (
                  <Badge variant="outline">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {t("interviewInvite.retakesUsed", { used: retakesUsed, count: retakesAllowed })}
                  </Badge>
                )}
                {currentQuestion.required && <Badge variant="destructive">{t("studio.async.required")}</Badge>}
                {answers[currentQuestion.id] && (
                  <Badge className="bg-green-500/10 text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> {t("labels.saved")}
                  </Badge>
                )}
                {preview.proctoringOn && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Eye className="h-3 w-3" />
                    {t("interviewInvite.proctoredSummary", {
                      blurs: proctoring.flags.tabBlurCount,
                      pastes: proctoring.flags.pasteCount,
                    })}
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
                        {t("labels.interviewAssignments.text")}
                      </TabsTrigger>
                      <TabsTrigger value="video" className="gap-1">
                        <Video className="h-3.5 w-3.5" />
                        {t("labels.interviewAssignments.video")}
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
                      {t("interviewInvite.reRecord", { count: retakesAllowed - retakesUsed })}
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
            {t("studio.async.previous")}
          </Button>
          {currentIdx < totalQuestions - 1 ? (
            <Button onClick={() => setCurrentIdx((i) => Math.min(totalQuestions - 1, i + 1))} className="gap-2">
              {t("studio.async.nextQuestion")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {t("studio.async.submitAll")}
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
              aria-label={t("interviewInvite.goToQuestion", { n: idx + 1 })}
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
  const { t } = useTranslation();
  const pct = total > 0 ? Math.max(0, Math.round(((total - remaining) / total) * 100)) : 100;
  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-4 text-center space-y-3">
      <div className="flex items-center justify-center gap-2 text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span className="text-sm">{t("interviewInvite.prepHint")}</span>
      </div>
      <div className="text-3xl font-bold">{t("interviewInvite.secondsShort", { sec: remaining })}</div>
      <Progress value={pct} className="h-1" />
      <Button variant="ghost" size="sm" onClick={onSkip}>
        {t("interviewInvite.readyStart")}
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
  const { t } = useTranslation();
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
        placeholder={t("interviewInvite.answerPlaceholder", { sec: maxSeconds })}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t("interviewInvite.wordCount", { count: value.split(/\s+/).filter(Boolean).length })}
        </span>
        <Button size="sm" onClick={handleSave} disabled={saving || !value.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t("interviewInvite.saveAnswer")}
        </Button>
      </div>
    </div>
  );
}
