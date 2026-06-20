import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Play,
  Square,
  RotateCcw,
  ChevronRight,
  CheckCircle,
  CheckCircle2,
  Clock,
  Star,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  BarChart3,
  RefreshCw,
  Loader2,
  Sparkles,
  Zap,
  Target,
  Users,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  question: string;
  category: string;
  timeLimit: number;
}

interface ScoreBreakdown {
  clarity: number;
  confidence: number;
  structure: number;
  relevance: number;
  impact: number;
}

interface Feedback {
  strengths: string[];
  improvements: string[];
  suggestedAnswer: string;
}

interface AnswerResult {
  answerId: string;
  questionId: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  feedback: Feedback;
  transcript: string;
}

type InterviewType = "behavioral" | "technical" | "system-design" | "product" | "general";

// ─── Step 1 — Setup ──────────────────────────────────────────────────────────

function SetupStep({
  onStart,
  loading,
}: {
  onStart: (jobDescription: string, type: InterviewType) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [jobDescription, setJobDescription] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType>("behavioral");

  const types: { value: InterviewType; labelKey: string; descriptionKey: string }[] = [
    { value: "behavioral", labelKey: "studio.interviewPractice.category.behavioral", descriptionKey: "labels.interview.typeBehavioralDesc" },
    { value: "technical", labelKey: "studio.interviewPractice.category.technical", descriptionKey: "labels.interview.typeTechnicalDesc" },
    { value: "system-design", labelKey: "labels.interview.typeSystemDesign", descriptionKey: "labels.interview.typeSystemDesignDesc" },
    { value: "product", labelKey: "labels.product", descriptionKey: "labels.interview.typeProductDesc" },
    { value: "general", labelKey: "labels.tabGroupGeneral", descriptionKey: "labels.interview.typeGeneralDesc" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t("headings.interview.practiceTitle")}</h1>
        <p className="text-muted-foreground">
          {t("messages.interview.setupSubtitle")}
        </p>
      </div>

      <div className="space-y-4">
        <label className="text-sm font-medium">{t("headings.jobDescription")}</label>
        <Textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder={t("labels.interview.jdPlaceholder")}
          className="min-h-[200px] font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">{t("labels.interview.charCount", { count: jobDescription.length })}</p>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium">{t("labels.interview.interviewType")}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {types.map((ty) => (
            <button
              key={ty.value}
              onClick={() => setInterviewType(ty.value)}
              className={`text-left p-3 rounded-lg border-2 transition-colors ${
                interviewType === ty.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-medium text-sm">{t(ty.labelKey)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t(ty.descriptionKey)}</div>
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={() => onStart(jobDescription, interviewType)}
        disabled={jobDescription.trim().length < 20 || loading}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("status.interview.generatingQuestions")}
          </>
        ) : (
          <>
            {t("actions.interview.generateQuestions")}
            <ChevronRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Step 2 — Questions Preview ──────────────────────────────────────────────

function QuestionsPreviewStep({
  questions,
  interviewType,
  onBegin,
  onRegenerate,
  loading,
}: {
  questions: Question[];
  interviewType: InterviewType;
  onBegin: () => void;
  onRegenerate: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const totalSeconds = questions.reduce((s, q) => s + q.timeLimit, 0);
  const totalMinutes = Math.round(totalSeconds / 60);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="capitalize">{t(`labels.interview.typeName.${interviewType}`)}</Badge>
          <span className="text-sm text-muted-foreground">
            {t("labels.interview.questionsCountMins", { count: questions.length, minutes: totalMinutes })}
          </span>
        </div>
        <h2 className="text-2xl font-bold">{t("headings.interview.yourQuestions")}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("messages.interview.reviewThenStart")}
        </p>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div
            key={q.id}
            className="flex gap-3 p-4 rounded-lg border bg-card"
          >
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{q.question}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="secondary" className="text-xs capitalize">{q.category}</Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t("labels.interview.seconds", { count: q.timeLimit })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onRegenerate} disabled={loading} className="flex-1">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {t("actions.regenerate")}
        </Button>
        <Button onClick={onBegin} className="flex-1">
          {t("studio.interviewPractice.startPractice")}
          <Play className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3 — Recording ──────────────────────────────────────────────────────

function RecordingStep({
  questions,
  questionIndex,
  onAnswerComplete,
  onSkip,
}: {
  questions: Question[];
  questionIndex: number;
  onAnswerComplete: (transcript: string, videoBlob: Blob | null) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const question = questions[questionIndex];
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(question.timeLimit);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start camera on mount
  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraReady(true);
      })
      .catch(() => setCameraError(true));

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Reset state when question changes
  useEffect(() => {
    setIsRecording(false);
    setCountdown(null);
    setTimeLeft(question.timeLimit);
    setHasRecorded(false);
    setTranscript("");
    recordedBlobRef.current = null;
  }, [question]);

  const startRecording = useCallback(() => {
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count === 0) {
        clearInterval(interval);
        setCountdown(null);
        beginCapture();
      }
    }, 1000);
  }, []);

  const beginCapture = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";

    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {});
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      recordedBlobRef.current = new Blob(chunksRef.current, { type: "video/webm" });
      setHasRecorded(true);
    };
    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);

    // Timer countdown
    setTimeLeft(question.timeLimit);
    let remaining = question.timeLimit;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) stopRecording();
    }, 1000);

    // Speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recog = new SpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.onresult = (event: any) => {
        let full = "";
        for (let i = 0; i < event.results.length; i++) {
          full += event.results[i][0].transcript;
        }
        setTranscript(full);
      };
      recog.start();
      recognitionRef.current = recog;
    }
  };

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    setIsRecording(false);
  }, []);

  const handleSubmit = () => {
    onAnswerComplete(transcript, recordedBlobRef.current);
  };

  const handleReRecord = () => {
    setHasRecorded(false);
    setTranscript("");
    setTimeLeft(question.timeLimit);
    recordedBlobRef.current = null;
  };

  const progressPct = ((question.timeLimit - timeLeft) / question.timeLimit) * 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("labels.interview.questionOfTotal", { current: questionIndex + 1, total: questions.length })}
          </p>
          <div className="flex gap-1 mt-1">
            {questions.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-8 rounded-full ${i < questionIndex ? "bg-primary" : i === questionIndex ? "bg-primary/60" : "bg-muted"}`}
              />
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          {t("actions.skip")}
        </Button>
      </div>

      {/* Question */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-2 mb-2">
            <Badge variant="secondary" className="capitalize text-xs">{question.category}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />{t("labels.interview.secondsLimit", { count: question.timeLimit })}
            </span>
          </div>
          <p className="font-medium text-lg leading-snug">{question.question}</p>
        </CardContent>
      </Card>

      {/* Video preview */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-7xl font-bold text-white animate-ping">{countdown || t("status.interview.go")}</span>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
            <VideoOff className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("messages.interview.cameraNotAvailable")}</p>
          </div>
        )}

        {isRecording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded-full">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            {t("status.interview.rec")}
          </div>
        )}

        {isRecording && (
          <div className="absolute top-3 right-3 bg-black/70 text-white text-sm font-mono px-2 py-1 rounded">
            {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </div>
        )}

        {isRecording && (
          <div className="absolute bottom-0 left-0 right-0">
            <Progress value={progressPct} className="h-1 rounded-none" />
          </div>
        )}
      </div>

      {/* Live transcript */}
      {(isRecording || hasRecorded) && transcript && (
        <div className="p-3 rounded-lg bg-muted/50 border">
          <p className="text-xs text-muted-foreground mb-1 font-medium">{t("labels.interview.liveTranscript")}</p>
          <p className="text-sm">{transcript || <span className="text-muted-foreground italic">{t("status.interview.listening")}</span>}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        {!isRecording && !hasRecorded && (
          <Button
            onClick={startRecording}
            disabled={!cameraReady || countdown !== null}
            className="flex-1"
            size="lg"
          >
            {countdown !== null ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("status.interview.startingIn", { count: countdown })}</>
            ) : (
              <><Mic className="mr-2 h-4 w-4" />{t("actions.interview.recordAnswer")}</>
            )}
          </Button>
        )}

        {isRecording && (
          <Button onClick={stopRecording} variant="destructive" className="flex-1" size="lg">
            <Square className="mr-2 h-4 w-4" />
            {t("studio.interviewPractice.stopRecording")}
          </Button>
        )}

        {hasRecorded && (
          <>
            <Button variant="outline" onClick={handleReRecord} className="flex-1">
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("actions.interview.reRecord")}
            </Button>
            <Button onClick={handleSubmit} className="flex-1" size="lg">
              {t("actions.interview.submitAnswer")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* No camera fallback — allow text-only answer */}
      {cameraError && !hasRecorded && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("messages.interview.noCameraTypeInstead")}</p>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={t("labels.interview.typeAnswerPlaceholder")}
            className="min-h-[100px]"
          />
          <Button
            onClick={() => { setHasRecorded(true); recordedBlobRef.current = null; }}
            disabled={transcript.trim().length < 10}
            className="w-full"
          >
            {t("actions.interview.submitTextAnswer")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Analysis Loading ─────────────────────────────────────────────────────────

function AnalyzingStep({ questionIndex, total }: { questionIndex: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div className="text-center space-y-6 py-16">
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
        <div className="absolute inset-0 flex items-center justify-center">
          <BarChart3 className="h-8 w-8 text-primary" />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t("status.interview.analyzingAnswer")}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("status.interview.evaluatingQuestion", { current: questionIndex, total })}
        </p>
      </div>
      <Progress value={(questionIndex / total) * 100} className="h-2" />
    </div>
  );
}

// ─── Step 4 — Results ─────────────────────────────────────────────────────────

function ResultsStep({
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

  function scoreColor(s: number) {
    if (s >= 8) return "text-green-600";
    if (s >= 6) return "text-yellow-600";
    return "text-red-500";
  }

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <Card className="border-2 border-primary/20">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">{t("headings.interview.interviewScore")}</p>
              <div className={`text-5xl font-bold mt-1 ${scoreColor(overallScore)}`}>
                {overallScore}<span className="text-2xl text-muted-foreground font-normal"> / 10</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {overallScore >= 8 ? t("messages.interview.scoreExcellent") : overallScore >= 6 ? t("messages.interview.scoreGood") : t("messages.interview.scoreKeepPracticing")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={`h-5 w-5 ${i <= Math.round(overallScore / 2) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`}
                />
              ))}
            </div>
          </div>

          {avgBreakdown && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              {(Object.entries(avgBreakdown) as [keyof ScoreBreakdown, number][]).map(([k, v]) => (
                <div key={k} className="text-center">
                  <div className={`text-sm font-semibold ${scoreColor(v)}`}>{v}</div>
                  <div className="text-xs text-muted-foreground">{t(`labels.interview.metric.${k}`)}</div>
                  <Progress value={v * 10} className="h-1 mt-1" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-question tabs */}
      <div>
        <p className="text-sm font-medium mb-2">{t("headings.interview.questionBreakdown")}</p>
        <div className="flex gap-2 flex-wrap">
          {questions.map((q, i) => {
            const r = results[i];
            return (
              <button
                key={q.id}
                onClick={() => setSelectedIdx(i)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedIdx === i ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
                }`}
              >
                {t("labels.interview.qShort", { number: i + 1 })}
                {r && (
                  <span className={`ml-1.5 text-xs ${selectedIdx === i ? "text-primary-foreground/80" : scoreColor(r.score)}`}>
                    {r.score}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div className="space-y-4">
          {/* Question */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">{questions[selectedIdx]?.question}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Score breakdown */}
              <div className="grid grid-cols-5 gap-2">
                {(Object.entries(selected.scoreBreakdown) as [keyof ScoreBreakdown, number][]).map(([k, v]) => (
                  <div key={k} className="text-center">
                    <div className={`text-base font-bold ${scoreColor(v)}`}>{v}</div>
                    <div className="text-xs text-muted-foreground">{t(`labels.interview.metric.${k}`)}</div>
                    <Progress value={v * 10} className="h-1 mt-1" />
                  </div>
                ))}
              </div>

              {/* Strengths */}
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-green-700 mb-1.5">
                  <CheckCircle className="h-4 w-4" /> {t("headings.strengths")}
                </div>
                <ul className="space-y-1">
                  {selected.feedback.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-green-500 mt-0.5">•</span> {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700 mb-1.5">
                  <TrendingUp className="h-4 w-4" /> {t("headings.interview.areasToImprove")}
                </div>
                <ul className="space-y-1">
                  {selected.feedback.improvements.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-amber-500 mt-0.5">•</span> {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Sample answer */}
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-400 mb-1.5">
                  <Lightbulb className="h-4 w-4" /> {t("headings.interview.modelAnswer")}
                </div>
                <p className="text-sm text-muted-foreground">{selected.feedback.suggestedAnswer}</p>
              </div>

              {/* Your transcript */}
              {selected.transcript && (
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    {t("labels.interview.yourTranscript")}
                  </summary>
                  <p className="text-sm text-muted-foreground mt-2 p-3 bg-muted/50 rounded-lg">
                    {selected.transcript}
                  </p>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {t("messages.interview.questionSkipped")}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onRestart} className="flex-1">
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("actions.interview.newSession")}
        </Button>
        <Button onClick={() => onRetry(selectedIdx)} className="flex-1">
          <RotateCcw className="mr-2 h-4 w-4" />
          {t("actions.interview.rePracticeQ", { number: selectedIdx + 1 })}
        </Button>
      </div>
    </div>
  );
}

// ─── Landing (unauthenticated) ───────────────────────────────────────────────

function Landing() {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-16">

        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 mb-6">
            <div className="relative">
              <Mic className="h-12 w-12 text-primary" />
              <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
            </div>
            <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
              {t("studio.interviewPractice.heading")}
            </span>
          </div>
          <h1 className="text-5xl font-bold mb-6">
            {t("headings.interview.landingHero")}
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            {t("messages.interview.landingHeroSub")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup">
              <Button
                size="lg"
                className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
              >
                {t("actions.interview.startPracticingFree")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                {t("actions.signIn")}
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
          {[
            { statKey: "labels.interview.stat1Value", labelKey: "labels.interview.stat1Label" },
            { statKey: "labels.interview.stat2Value", labelKey: "labels.interview.stat2Label" },
            { statKey: "labels.interview.stat3Value", labelKey: "labels.interview.stat3Label" },
            { statKey: "labels.interview.stat4Value", labelKey: "labels.interview.stat4Label" },
          ].map((s) => (
            <div key={s.statKey} className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">{t(s.statKey)}</div>
              <p className="text-sm text-muted-foreground">{t(s.labelKey)}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t("headings.interview.featuresTitle")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
              <CardHeader>
                <Zap className="h-10 w-10 text-brand-purple mb-4" />
                <CardTitle>{t("headings.interview.feature1Title")}</CardTitle>
                <CardDescription>
                  {t("messages.interview.feature1Desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature1Bullet1")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature1Bullet2")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature1Bullet3")}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
              <CardHeader>
                <Video className="h-10 w-10 text-brand-blue mb-4" />
                <CardTitle>{t("headings.interview.feature2Title")}</CardTitle>
                <CardDescription>
                  {t("messages.interview.feature2Desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature2Bullet1")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature2Bullet2")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature2Bullet3")}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 hover:border-primary/40 transition-colors">
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-primary mb-4" />
                <CardTitle>{t("headings.interview.feature3Title")}</CardTitle>
                <CardDescription>
                  {t("messages.interview.feature3Desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature3Bullet1")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature3Bullet2")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.interview.feature3Bullet3")}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How it works */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">{t("headings.interview.howItWorks")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { icon: Target, stepKey: "headings.interview.step1Title", descKey: "messages.interview.step1Desc" },
              { icon: Sparkles, stepKey: "headings.interview.step2Title", descKey: "messages.interview.step2Desc" },
              { icon: Mic, stepKey: "headings.interview.step3Title", descKey: "messages.interview.step3Desc" },
              { icon: TrendingUp, stepKey: "headings.interview.step4Title", descKey: "messages.interview.step4Desc" },
            ].map(({ icon: Icon, stepKey, descKey }) => (
              <div key={stepKey} className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{t(stepKey)}</h3>
                <p className="text-sm text-muted-foreground">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">{t("headings.interview.testimonialsTitle")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                quoteKey: "messages.interview.testimonial1Quote",
                name: "James Park",
                titleKey: "labels.interview.testimonial1Title",
              },
              {
                quoteKey: "messages.interview.testimonial2Quote",
                name: "Priya Mehta",
                titleKey: "labels.interview.testimonial2Title",
              },
              {
                quoteKey: "messages.interview.testimonial3Quote",
                name: "Marcus Williams",
                titleKey: "labels.interview.testimonial3Title",
              },
            ].map((item) => (
              <Card key={item.name}>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm mb-4">"{t(item.quoteKey)}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{t(item.titleKey)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
          <h3 className="text-2xl font-bold mb-4">
            {t("headings.interview.ctaTitle")}
          </h3>
          <p className="text-muted-foreground mb-6">
            {t("messages.interview.ctaSubtitle")}
          </p>
          <Link to="/signup">
            <Button
              size="lg"
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
            >
              {t("actions.interview.startPracticingFree")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>

    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Step = "setup" | "preview" | "recording" | "analyzing" | "results";

export default function InterviewPractice() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useSEO(location.pathname, {
    title: t("messages.interview.seoTitle"),
    description: t("messages.interview.seoDescription"),
  });
  useBreadcrumbs([{ name: t("studio.interviewPractice.heading"), url: "/interview" }]);

  const [step, setStep] = useState<Step>("setup");
  const [loading, setLoading] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType>("behavioral");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [analyzingIdx, setAnalyzingIdx] = useState(0);

  async function generateQuestions(jd: string, type: InterviewType) {
    setLoading(true);
    setJobDescription(jd);
    setInterviewType(type);
    try {
      const res = await apiClient.post<{ questions: Question[] }>("/api/interview/questions", {
        jobDescription: jd,
        type,
        count: 5,
      });
      setQuestions(res.data.questions);
      setStep("preview");
    } catch (err: any) {
      toast.error(err.message ?? t("errors.interview.generateQuestions"));
    } finally {
      setLoading(false);
    }
  }

  async function createSession(): Promise<string | null> {
    try {
      const res = await apiClient.post<{ id: string }>("/api/interview/sessions", {
        jobDescription,
        interviewType,
        questions,
      });
      return res.data.id;
    } catch (err: any) {
      toast.error(err.message ?? t("studio.interviewPractice.errors.startSession"));
      return null;
    }
  }

  async function handleBegin() {
    const sid = await createSession();
    if (!sid) return;
    setSessionId(sid);
    setQuestionIndex(0);
    setResults([]);
    setStep("recording");
  }

  async function handleAnswerComplete(transcript: string, videoBlob: Blob | null) {
    const q = questions[questionIndex];
    setStep("analyzing");
    setAnalyzingIdx(questionIndex + 1);

    // 1. Save the answer
    let savedAnswerId: string | null = null;
    try {
      if (sessionId) {
        const body: FormData | { questionId: string; question: string; transcript: string } =
          videoBlob && canUploadVideo()
            ? (() => {
                const form = new FormData();
                form.append("questionId", q.id);
                form.append("question", q.question);
                form.append("transcript", transcript);
                form.append("video", videoBlob, "answer.webm");
                return form;
              })()
            : { questionId: q.id, question: q.question, transcript };
        const saveRes = await apiClient.request<{ id: string }>(
          `/api/interview/sessions/${sessionId}/answers`,
          { method: "POST", body },
        );
        savedAnswerId = saveRes.data.id;
      }
    } catch {
      // Non-fatal — we can still analyze
    }

    // 2. Analyze
    let result: AnswerResult | null = null;
    if (transcript.trim().length > 5 && savedAnswerId) {
      try {
        const analyzeRes = await apiClient.post<{ score?: string; feedback?: any }>(
          `/api/interview/answers/${savedAnswerId}/analyze`,
          { jobDescription },
        );
        if (analyzeRes.data.feedback) {
          const fb = analyzeRes.data.feedback as any;
          result = {
            answerId: savedAnswerId,
            questionId: q.id,
            score: parseFloat(analyzeRes.data.score ?? "0"),
            scoreBreakdown: fb.scoreBreakdown,
            feedback: fb.feedback,
            transcript,
          };
        }
      } catch {
        // Fall through to mock
      }
    }

    if (!result && transcript.trim().length > 5) {
      // Client-side fallback scoring (no API needed)
      result = buildClientFeedback(t, q.question, transcript, q.id);
    }

    const newResults = [...results];
    if (result) newResults[questionIndex] = result;
    setResults(newResults);

    // Next question or results
    const next = questionIndex + 1;
    if (next < questions.length) {
      setQuestionIndex(next);
      setStep("recording");
    } else {
      // Complete the session
      if (sessionId) {
        apiClient
          .patch(`/api/interview/sessions/${sessionId}/complete`)
          .catch(() => {});
      }
      setStep("results");
    }
  }

  function handleSkip() {
    const next = questionIndex + 1;
    if (next < questions.length) {
      setQuestionIndex(next);
    } else {
      setStep("results");
    }
  }

  function handleRestart() {
    setStep("setup");
    setQuestions([]);
    setSessionId(null);
    setQuestionIndex(0);
    setResults([]);
    setJobDescription("");
  }

  function handleRetry(idx: number) {
    setQuestionIndex(idx);
    setStep("recording");
  }

  if (!isAuthenticated || !user) {
    return (
      <AppShell>
        <Landing />
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 py-8">
        {step === "setup" && (
          <SetupStep onStart={generateQuestions} loading={loading} />
        )}

        {step === "preview" && (
          <QuestionsPreviewStep
            questions={questions}
            interviewType={interviewType}
            onBegin={handleBegin}
            onRegenerate={() => generateQuestions(jobDescription, interviewType)}
            loading={loading}
          />
        )}

        {step === "recording" && (
          <RecordingStep
            key={questionIndex}
            questions={questions}
            questionIndex={questionIndex}
            onAnswerComplete={handleAnswerComplete}
            onSkip={handleSkip}
          />
        )}

        {step === "analyzing" && (
          <AnalyzingStep questionIndex={analyzingIdx} total={questions.length} />
        )}

        {step === "results" && (
          <ResultsStep
            questions={questions}
            results={results}
            onRestart={handleRestart}
            onRetry={handleRetry}
          />
        )}
      </div>
    </AppShell>
  );
}

// ─── Client-side fallback feedback ───────────────────────────────────────────

function canUploadVideo(): boolean {
  return false; // Disable video upload for now — transcripts only
}

function buildClientFeedback(t: TFunction, question: string, transcript: string, questionId: string): AnswerResult {
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const hasNumbers = /\d/.test(transcript);
  const hasExample = /example|when i|i led|i built|i managed|project|result/i.test(transcript);
  const hasStar = /situation|task|action|result/i.test(transcript);
  const hasFillers = (transcript.match(/\b(um|uh|like|you know)\b/gi) ?? []).length;

  const clarity = Math.min(9.5, 5 + (wordCount > 60 ? 1.5 : 0) + (wordCount < 250 ? 0.5 : 0) - (hasFillers > 5 ? 1 : 0));
  const confidence = Math.min(9.5, 5.5 + (wordCount > 40 ? 0.8 : 0) - (hasFillers > 3 ? 0.5 : 0));
  const structure = Math.min(9.5, 5 + (hasStar ? 2 : hasExample ? 1 : 0));
  const relevance = Math.min(9.5, 5.5 + (hasExample ? 1.5 : 0));
  const impact = Math.min(9.5, 5 + (hasNumbers ? 2 : 0));

  const round = (n: number) => Math.round(n * 10) / 10;
  const score = round((clarity + confidence + structure + relevance + impact) / 5);

  return {
    answerId: "",
    questionId,
    score,
    scoreBreakdown: {
      clarity: round(clarity),
      confidence: round(confidence),
      structure: round(structure),
      relevance: round(relevance),
      impact: round(impact),
    },
    feedback: {
      strengths: [
        wordCount > 60 ? t("messages.interview.fbStrengthDetail") : t("messages.interview.fbStrengthDirect"),
        hasExample ? t("messages.interview.fbStrengthExample") : t("messages.interview.fbStrengthCore"),
        hasNumbers ? t("messages.interview.fbStrengthMetrics") : t("messages.interview.fbStrengthKnowledge"),
      ].slice(0, 2),
      improvements: [
        !hasStar ? t("messages.interview.fbImproveStar") : t("messages.interview.fbImproveStarGood"),
        !hasNumbers ? t("messages.interview.fbImproveNumbers") : t("messages.interview.fbImproveMoreMetrics"),
        hasFillers > 3 ? t("messages.interview.fbImproveFillers", { count: hasFillers }) : t("messages.interview.fbImprovePace"),
      ].filter(Boolean).slice(0, 3),
      suggestedAnswer: t("messages.interview.fbSuggestedAnswer"),
    },
    transcript,
  };
}
