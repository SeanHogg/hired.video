"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Send,
  Plus,
  Trash2,
  Copy,
  Check,
  Clock,
  Users,
  Video,
  ChevronRight,
  ChevronLeft,
  Loader2,
  RotateCcw,
} from "lucide-react";
import {
  createAsyncInterview,
  getAsyncInterviewInvite,
  submitAsyncResponse,
  finalizeAsyncInterview,
  getAsyncInterviews,
  getAsyncInterviewResponses,
  uploadRecording,
  type AsyncInterview,
} from "@/lib/services/studio-features-service";
import { resendInterviewInvite } from "@/lib/services/interview-assignments-service";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AsyncInterviewManagerProps {
  isRecruiter?: boolean;
  inviteToken?: string;
  onComplete?: () => void;
}

interface QuestionDraft {
  id: string;
  text: string;
  maxDurationSec: number;
  required: boolean;
}

interface InterviewForm {
  title: string;
  instructions: string;
  candidateEmail: string;
  jobId: string;
  deadline: string;
  questions: QuestionDraft[];
}

type RecruiterTab = "create" | "list";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateDraftId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function statusColor(status: string): string {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "in_progress":
      return "bg-accent text-accent-foreground";
    case "submitted":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "reviewed":
      return "bg-accent text-accent-foreground";
    default:
      return "bg-muted text-foreground";
  }
}

function statusLabel(t: TFunction, status: string): string {
  switch (status) {
    case "pending":
      return t("studio.asyncInterview.status.pending");
    case "in_progress":
      return t("studio.asyncInterview.status.inProgress");
    case "submitted":
      return t("studio.asyncInterview.status.submitted");
    case "reviewed":
      return t("studio.asyncInterview.status.reviewed");
    default:
      return status;
  }
}

function formatDeadline(t: TFunction, deadline?: string): string {
  if (!deadline) return t("studio.asyncInterview.noDeadline");
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return t("studio.asyncInterview.invalidDate");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const emptyQuestion = (): QuestionDraft => ({
  id: generateDraftId(),
  text: "",
  maxDurationSec: 120,
  required: true,
});

const emptyForm = (): InterviewForm => ({
  title: "",
  instructions: "",
  candidateEmail: "",
  jobId: "",
  deadline: "",
  questions: [emptyQuestion()],
});

// ─── Recruiter: Create Interview ────────────────────────────────────────────

function CreateInterviewPanel({
  onCreated,
}: {
  onCreated: (interview: AsyncInterview & { inviteUrl: string }) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<InterviewForm>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = <K extends keyof InterviewForm>(
    key: K,
    value: InterviewForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addQuestion = () => {
    if (form.questions.length >= 10) return;
    setForm((prev) => ({
      ...prev,
      questions: [...prev.questions, emptyQuestion()],
    }));
  };

  const removeQuestion = (id: string) => {
    if (form.questions.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== id),
    }));
  };

  const updateQuestion = (
    id: string,
    field: keyof QuestionDraft,
    value: string | number | boolean,
  ) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === id ? { ...q, [field]: value } : q,
      ),
    }));
  };

  const canSubmit =
    form.title.trim().length > 0 &&
    form.questions.every((q) => q.text.trim().length > 0);

  const handleCreate = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createAsyncInterview({
        title: form.title.trim(),
        instructions: form.instructions.trim() || undefined,
        candidateEmail: form.candidateEmail.trim() || undefined,
        jobId: form.jobId.trim() || undefined,
        questions: form.questions.map((q) => ({
          id: q.id,
          text: q.text.trim(),
          maxDurationSec: q.maxDurationSec,
          required: q.required,
        })),
        deadline: form.deadline || undefined,
      });
      onCreated(result);
      setForm(emptyForm());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("studio.asyncInterview.errors.createFailed"),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plus className="h-5 w-5" />
          {t("studio.asyncInterview.createHeading")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="interview-title">
            {t("studio.asyncInterview.titleLabel")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="interview-title"
            placeholder={t("studio.asyncInterview.titlePlaceholder")}
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
          />
        </div>

        {/* Instructions */}
        <div className="space-y-2">
          <Label htmlFor="interview-instructions">
            {t("studio.asyncInterview.instructionsLabel")}
          </Label>
          <Textarea
            id="interview-instructions"
            placeholder={t("studio.asyncInterview.instructionsPlaceholder")}
            rows={3}
            value={form.instructions}
            onChange={(e) => updateField("instructions", e.target.value)}
          />
        </div>

        {/* Candidate Email & Job */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="candidate-email">{t("studio.asyncInterview.candidateEmailLabel")}</Label>
            <Input
              id="candidate-email"
              type="email"
              placeholder="candidate@example.com"
              value={form.candidateEmail}
              onChange={(e) => updateField("candidateEmail", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-id">{t("studio.asyncInterview.jobIdLabel")}</Label>
            <Input
              id="job-id"
              placeholder={t("studio.asyncInterview.jobIdPlaceholder")}
              value={form.jobId}
              onChange={(e) => updateField("jobId", e.target.value)}
            />
          </div>
        </div>

        {/* Deadline */}
        <div className="space-y-2">
          <Label htmlFor="deadline">{t("studio.asyncInterview.deadlineLabel")}</Label>
          <Input
            id="deadline"
            type="datetime-local"
            value={form.deadline}
            onChange={(e) => updateField("deadline", e.target.value)}
          />
        </div>

        {/* Questions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>
              {t("studio.asyncInterview.questionsLabel")} <span className="text-destructive">*</span>
            </Label>
            <span className="text-xs text-muted-foreground">
              {form.questions.length} / 10
            </span>
          </div>

          {form.questions.map((q, idx) => (
            <div
              key={q.id}
              className="rounded-lg border bg-muted/30 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="mt-1.5 text-sm font-medium text-muted-foreground">
                  {t("studio.asyncInterview.questionNumberShort", { num: idx + 1 })}
                </span>
                <div className="flex-1">
                  <Input
                    placeholder={t("studio.asyncInterview.questionPlaceholder")}
                    value={q.text}
                    onChange={(e) =>
                      updateQuestion(q.id, "text", e.target.value)
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={form.questions.length <= 1}
                  onClick={() => removeQuestion(q.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="flex items-center gap-4 pl-7">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={`duration-${q.id}`}
                    className="text-xs text-muted-foreground whitespace-nowrap"
                  >
                    {t("studio.asyncInterview.maxDurationSec")}
                  </Label>
                  <Input
                    id={`duration-${q.id}`}
                    type="number"
                    min={15}
                    max={600}
                    className="w-24"
                    value={q.maxDurationSec}
                    onChange={(e) =>
                      updateQuestion(
                        q.id,
                        "maxDurationSec",
                        Math.max(15, Math.min(600, Number(e.target.value))),
                      )
                    }
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={q.required}
                    onChange={(e) =>
                      updateQuestion(q.id, "required", e.target.checked)
                    }
                  />
                  {t("labels.required")}
                </label>
              </div>
            </div>
          ))}

          {form.questions.length < 10 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={addQuestion}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("studio.asyncInterview.addQuestion")}
            </Button>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          className="w-full"
          disabled={!canSubmit || creating}
          onClick={handleCreate}
        >
          {creating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("studio.asyncInterview.creating")}
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              {t("studio.asyncInterview.createAction")}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Recruiter: Invite Link Toast ───────────────────────────────────────────

function InviteLinkCard({
  inviteUrl,
  onDismiss,
}: {
  inviteUrl: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = inviteUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center gap-2 text-green-800 dark:text-green-300">
          <Check className="h-5 w-5" />
          <span className="font-medium">{t("studio.asyncInterview.createdSuccess")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={inviteUrl}
            className="flex-1 text-sm bg-card dark:bg-green-950/50"
          />
          <Button variant="outline" size="icon" onClick={copyLink}>
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("studio.asyncInterview.shareLinkHint")}
        </p>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t("actions.dismiss")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Recruiter: Interview List ──────────────────────────────────────────────

function InterviewListPanel() {
  const { t } = useTranslation();
  const [interviews, setInterviews] = useState<AsyncInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<{
    interview: AsyncInterview;
    responses: any[];
  } | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAsyncInterviews();
      setInterviews(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("studio.asyncInterview.errors.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  const viewResponses = async (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      setResponses(null);
      return;
    }
    setSelectedId(id);
    setLoadingResponses(true);
    try {
      const data = await getAsyncInterviewResponses(id);
      setResponses(data);
    } catch {
      setResponses(null);
    } finally {
      setLoadingResponses(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            {t("studio.asyncInterview.loadingInterviews")}
          </span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={fetchInterviews}>
            {t("actions.tryAgain")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (interviews.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("studio.asyncInterview.emptyState")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {interviews.map((iv) => (
        <Card key={iv.id}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-medium">{iv.title}</h3>
                  <Badge
                    variant="secondary"
                    className={statusColor(iv.status)}
                  >
                    {statusLabel(t, iv.status)}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    {t("studio.asyncInterview.questionCount", { count: iv.questions.length })}
                  </span>
                  {iv.deadline && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDeadline(t, iv.deadline)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {iv.inviteUrl && (
                  <CopyInviteButton url={iv.inviteUrl} />
                )}
                <ResendInviteButton
                  interviewId={iv.id}
                  status={iv.status}
                  onResent={fetchInterviews}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => viewResponses(iv.id)}
                >
                  {selectedId === iv.id
                    ? t("studio.asyncInterview.hideResponses")
                    : t("studio.asyncInterview.viewResponses")}
                </Button>
              </div>
            </div>

            {/* Expanded responses */}
            {selectedId === iv.id && (
              <div className="mt-4 border-t pt-4">
                {loadingResponses ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("studio.asyncInterview.loadingResponses")}
                  </div>
                ) : responses && responses.responses.length > 0 ? (
                  <div className="space-y-3">
                    {responses.responses.map((resp: any, i: number) => (
                      <div
                        key={resp.id ?? i}
                        className="rounded-lg border bg-muted/20 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {t("studio.asyncInterview.questionNumberLabel", {
                              num: i + 1,
                              text: iv.questions[i]?.text ?? t("studio.asyncInterview.questionFallback"),
                            })}
                          </span>
                          {resp.durationMs && (
                            <span className="text-xs text-muted-foreground">
                              {t("studio.asyncInterview.durationSec", { sec: Math.round(resp.durationMs / 1000) })}
                            </span>
                          )}
                        </div>
                        {resp.videoUrl ? (
                          <video
                            src={resp.videoUrl}
                            controls
                            className="w-full max-w-md rounded-md"
                            preload="metadata"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            {t("studio.asyncInterview.noRecording")}
                          </p>
                        )}
                        {resp.transcription && (
                          <p className="text-xs text-muted-foreground">
                            {resp.transcription}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t("studio.asyncInterview.noResponsesYet")}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ResendInviteButton({
  interviewId,
  status,
  onResent,
}: {
  interviewId: string;
  status: string;
  onResent: () => void;
}) {
  const [resending, setResending] = useState(false);
  const disabled = status === "submitted" || status === "reviewed";
  async function handle() {
    setResending(true);
    try {
      await resendInterviewInvite(interviewId);
      onResent();
    } catch {
      // toast is owned by the parent's fetchInterviews → error path
    } finally {
      setResending(false);
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handle}
      disabled={disabled || resending}
      title="Re-send magic link"
    >
      {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
    </Button>
  );
}

function CopyInviteButton({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" onClick={copy} title={t("studio.asyncInterview.copyInviteLink")}>
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}

// ─── Recruiter View ─────────────────────────────────────────────────────────

function RecruiterView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<RecruiterTab>("list");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const handleCreated = (
    interview: AsyncInterview & { inviteUrl: string },
  ) => {
    setInviteUrl(interview.inviteUrl);
    setTab("list");
  };

  return (
    <div className="space-y-6">
      {/* Tab toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={tab === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("list")}
        >
          <Users className="mr-2 h-4 w-4" />
          {t("studio.asyncInterview.tabInterviews")}
        </Button>
        <Button
          variant={tab === "create" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("create")}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("studio.asyncInterview.tabNew")}
        </Button>
      </div>

      {/* Invite link banner */}
      {inviteUrl && (
        <InviteLinkCard
          inviteUrl={inviteUrl}
          onDismiss={() => setInviteUrl(null)}
        />
      )}

      {/* Active panel */}
      {tab === "create" ? (
        <CreateInterviewPanel onCreated={handleCreated} />
      ) : (
        <InterviewListPanel />
      )}
    </div>
  );
}

// ─── Candidate View ─────────────────────────────────────────────────────────

function CandidateView({
  inviteToken,
  onComplete,
}: {
  inviteToken: string;
  onComplete?: () => void;
}) {
  const { t } = useTranslation();
  const [interview, setInterview] = useState<AsyncInterview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [recordings, setRecordings] = useState<Map<string, Blob>>(new Map());
  const [uploadedMap, setUploadedMap] = useState<
    Map<string, { recordingId: string; videoUrl?: string }>
  >(new Map());
  const [isRecording, setIsRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch the interview by invite token
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAsyncInterviewInvite(inviteToken);
        if (!cancelled) setInterview(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : t("studio.asyncInterview.errors.loadInviteFailed"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, t]);

  // Cleanup media on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tk) => tk.stop());
      streamRef.current = null;
    }
  }, []);

  const currentQuestion = interview?.questions[currentIdx] ?? null;
  const totalQuestions = interview?.questions.length ?? 0;
  const progressPercent =
    totalQuestions > 0 ? ((currentIdx + 1) / totalQuestions) * 100 : 0;
  const hasRecordingForCurrent = currentQuestion
    ? recordings.has(currentQuestion.id)
    : false;

  const startRecording = async () => {
    if (!currentQuestion) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.muted = true;
        videoPreviewRef.current.play().catch(() => {});
      }

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : "video/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordings((prev) => {
          const next = new Map(prev);
          next.set(currentQuestion.id, blob);
          return next;
        });
        stopStream();
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= (currentQuestion.maxDurationSec || 120)) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch {
      setError(t("studio.asyncInterview.errors.mediaAccess"));
    }
  };

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const retakeRecording = () => {
    if (!currentQuestion) return;
    setRecordings((prev) => {
      const next = new Map(prev);
      next.delete(currentQuestion.id);
      return next;
    });
    setUploadedMap((prev) => {
      const next = new Map(prev);
      next.delete(currentQuestion.id);
      return next;
    });
  };

  const goNext = () => {
    if (currentIdx < totalQuestions - 1) setCurrentIdx((i) => i + 1);
  };

  const goPrev = () => {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  };

  const handleSubmitAll = async () => {
    if (!interview) return;
    setSubmitting(true);
    setError(null);

    try {
      // Upload all recordings that haven't been uploaded yet
      for (const question of interview.questions) {
        const blob = recordings.get(question.id);
        if (!blob) continue;

        if (!uploadedMap.has(question.id)) {
          const file = new File([blob], `response_${question.id}.webm`, {
            type: "video/webm",
          });
          const uploadResult = await uploadRecording(file, "webcam");
          setUploadedMap((prev) => {
            const next = new Map(prev);
            next.set(question.id, {
              recordingId: uploadResult.id,
              videoUrl: uploadResult.videoUrl ?? undefined,
            });
            return next;
          });

          await submitAsyncResponse(interview.id, {
            questionId: question.id,
            recordingId: uploadResult.id,
            videoUrl: uploadResult.videoUrl ?? undefined,
            durationMs: blob.size, // approximate, backend handles properly
          });
        }
      }

      await finalizeAsyncInterview(interview.id);
      setSubmitted(true);
      onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("studio.asyncInterview.errors.submitFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            {t("studio.asyncInterview.loadingInterview")}
          </span>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error && !interview) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Submitted state
  if (submitted) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold">{t("studio.asyncInterview.submittedHeading")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("studio.asyncInterview.submittedBody")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!interview || !currentQuestion) return null;

  const maxDuration = currentQuestion.maxDurationSec || 120;
  const answeredCount = recordings.size;
  const requiredQuestions = interview.questions.filter((q) => q.required);
  const allRequiredAnswered = requiredQuestions.every((q) =>
    recordings.has(q.id),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{interview.title}</CardTitle>
          {interview.instructions && (
            <p className="text-sm text-muted-foreground">
              {interview.instructions}
            </p>
          )}
          {interview.deadline && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t("studio.asyncInterview.deadlinePrefix", { date: formatDeadline(t, interview.deadline) })}
            </div>
          )}
        </CardHeader>
        <CardContent className="pb-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("studio.asyncInterview.questionOfTotal", { current: currentIdx + 1, total: totalQuestions })}
              </span>
              <span className="text-muted-foreground">
                {t("studio.asyncInterview.answeredOfTotal", { answered: answeredCount, total: totalQuestions })}
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Question & Recording */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Question text */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {t("studio.asyncInterview.questionNumberShort", { num: currentIdx + 1 })}
              </Badge>
              {currentQuestion.required && (
                <Badge variant="secondary" className="text-xs">
                  {t("labels.required")}
                </Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {t("studio.asyncInterview.maxSeconds", { sec: maxDuration })}
              </span>
            </div>
            <p className="text-base font-medium">{currentQuestion.text}</p>
          </div>

          {/* Video area */}
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
            {isRecording ? (
              <>
                <video
                  ref={videoPreviewRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                />
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs text-white">
                  <span className="h-2 w-2 rounded-full bg-card animate-pulse" />
                  {t("studio.asyncInterview.recIndicator", { current: recordingTime, max: maxDuration })}
                </div>
              </>
            ) : hasRecordingForCurrent ? (
              <video
                src={URL.createObjectURL(recordings.get(currentQuestion.id)!)}
                controls
                className="h-full w-full"
                preload="metadata"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Video className="h-12 w-12 opacity-40" />
                <p className="text-sm">
                  {t("studio.asyncInterview.clickToRecord")}
                </p>
              </div>
            )}
          </div>

          {/* Recording controls */}
          <div className="flex items-center justify-center gap-3">
            {isRecording ? (
              <Button variant="destructive" onClick={stopRecording}>
                {t("studio.asyncInterview.stopRecording")}
              </Button>
            ) : hasRecordingForCurrent ? (
              <Button variant="outline" onClick={retakeRecording}>
                <Video className="mr-2 h-4 w-4" />
                {t("studio.asyncInterview.retake")}
              </Button>
            ) : (
              <Button onClick={startRecording}>
                <Video className="mr-2 h-4 w-4" />
                {t("studio.asyncInterview.startRecording")}
              </Button>
            )}
          </div>

          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={currentIdx === 0}
          onClick={goPrev}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("actions.previous")}
        </Button>

        {currentIdx < totalQuestions - 1 ? (
          <Button variant="outline" size="sm" onClick={goNext}>
            {t("actions.next")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            disabled={!allRequiredAnswered || submitting}
            onClick={handleSubmitAll}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("studio.asyncInterview.submitting")}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {t("studio.asyncInterview.submitAll")}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AsyncInterviewManager({
  isRecruiter = true,
  inviteToken,
  onComplete,
}: AsyncInterviewManagerProps) {
  if (!isRecruiter && inviteToken) {
    return (
      <CandidateView inviteToken={inviteToken} onComplete={onComplete} />
    );
  }

  return <RecruiterView />;
}
