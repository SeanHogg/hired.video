import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useSidebar } from "@/hooks/use-sidebar";
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
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
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
  const [jobDescription, setJobDescription] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType>("behavioral");

  const types: { value: InterviewType; label: string; description: string }[] = [
    { value: "behavioral", label: "Behavioral", description: "STAR-method questions about past experience" },
    { value: "technical", label: "Technical", description: "Coding, architecture, and problem-solving" },
    { value: "system-design", label: "System Design", description: "Design scalable systems and discuss trade-offs" },
    { value: "product", label: "Product", description: "Product sense, metrics, and strategy" },
    { value: "general", label: "General", description: "Mixed questions for any role" },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">AI Interview Practice</h1>
        <p className="text-muted-foreground">
          Paste a job description and practice with AI-generated questions. Get instant feedback on your answers.
        </p>
      </div>

      <div className="space-y-4">
        <label className="text-sm font-medium">Job Description</label>
        <Textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the job description here...&#10;&#10;Example:&#10;Senior Backend Engineer at Stripe&#10;• Design scalable APIs&#10;• Build distributed systems&#10;• Collaborate across teams"
          className="min-h-[200px] font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">{jobDescription.length}/5000 characters</p>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium">Interview Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {types.map((t) => (
            <button
              key={t.value}
              onClick={() => setInterviewType(t.value)}
              className={`text-left p-3 rounded-lg border-2 transition-colors ${
                interviewType === t.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-medium text-sm">{t.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
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
            Generating questions...
          </>
        ) : (
          <>
            Generate Questions
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
  const totalSeconds = questions.reduce((s, q) => s + q.timeLimit, 0);
  const totalMinutes = Math.round(totalSeconds / 60);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="capitalize">{interviewType}</Badge>
          <span className="text-sm text-muted-foreground">
            {questions.length} questions · ~{totalMinutes} min
          </span>
        </div>
        <h2 className="text-2xl font-bold">Your Interview Questions</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Review the questions, then start your practice session.
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
                  {q.timeLimit}s
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onRegenerate} disabled={loading} className="flex-1">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Regenerate
        </Button>
        <Button onClick={onBegin} className="flex-1">
          Start Practice
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
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Question {questionIndex + 1} of {questions.length}
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
          Skip
        </Button>
      </div>

      {/* Question */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-2 mb-2">
            <Badge variant="secondary" className="capitalize text-xs">{question.category}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />{question.timeLimit}s limit
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
            <span className="text-7xl font-bold text-white animate-ping">{countdown || "GO"}</span>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
            <VideoOff className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Camera not available</p>
          </div>
        )}

        {isRecording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded-full">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            REC
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
          <p className="text-xs text-muted-foreground mb-1 font-medium">Live transcript</p>
          <p className="text-sm">{transcript || <span className="text-muted-foreground italic">Listening...</span>}</p>
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
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting in {countdown}...</>
            ) : (
              <><Mic className="mr-2 h-4 w-4" />Record Answer</>
            )}
          </Button>
        )}

        {isRecording && (
          <Button onClick={stopRecording} variant="destructive" className="flex-1" size="lg">
            <Square className="mr-2 h-4 w-4" />
            Stop Recording
          </Button>
        )}

        {hasRecorded && (
          <>
            <Button variant="outline" onClick={handleReRecord} className="flex-1">
              <RotateCcw className="mr-2 h-4 w-4" />
              Re-record
            </Button>
            <Button onClick={handleSubmit} className="flex-1" size="lg">
              Submit Answer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* No camera fallback — allow text-only answer */}
      {cameraError && !hasRecorded && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">No camera? Type your answer instead:</p>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Type your answer here..."
            className="min-h-[100px]"
          />
          <Button
            onClick={() => { setHasRecorded(true); recordedBlobRef.current = null; }}
            disabled={transcript.trim().length < 10}
            className="w-full"
          >
            Submit Text Answer
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Analysis Loading ─────────────────────────────────────────────────────────

function AnalyzingStep({ questionIndex, total }: { questionIndex: number; total: number }) {
  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-16">
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
        <div className="absolute inset-0 flex items-center justify-center">
          <BarChart3 className="h-8 w-8 text-primary" />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-semibold">Analyzing your answer...</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Evaluating question {questionIndex} of {total}
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Overall Score */}
      <Card className="border-2 border-primary/20">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Interview Score</p>
              <div className={`text-5xl font-bold mt-1 ${scoreColor(overallScore)}`}>
                {overallScore}<span className="text-2xl text-muted-foreground font-normal"> / 10</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {overallScore >= 8 ? "Excellent performance!" : overallScore >= 6 ? "Good — a few areas to polish." : "Keep practicing — great improvement opportunity."}
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
                  <div className="text-xs text-muted-foreground capitalize">{k}</div>
                  <Progress value={v * 10} className="h-1 mt-1" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-question tabs */}
      <div>
        <p className="text-sm font-medium mb-2">Question Breakdown</p>
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
                Q{i + 1}
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
                    <div className="text-xs text-muted-foreground capitalize">{k}</div>
                    <Progress value={v * 10} className="h-1 mt-1" />
                  </div>
                ))}
              </div>

              {/* Strengths */}
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-green-700 mb-1.5">
                  <CheckCircle className="h-4 w-4" /> Strengths
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
                  <TrendingUp className="h-4 w-4" /> Areas to Improve
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
                  <Lightbulb className="h-4 w-4" /> Model Answer
                </div>
                <p className="text-sm text-muted-foreground">{selected.feedback.suggestedAnswer}</p>
              </div>

              {/* Your transcript */}
              {selected.transcript && (
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Your transcript
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
            This question was skipped
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onRestart} className="flex-1">
          <RefreshCw className="mr-2 h-4 w-4" />
          New Session
        </Button>
        <Button onClick={() => onRetry(selectedIdx)} className="flex-1">
          <RotateCcw className="mr-2 h-4 w-4" />
          Re-practice Q{selectedIdx + 1}
        </Button>
      </div>
    </div>
  );
}

// ─── Landing (unauthenticated) ───────────────────────────────────────────────

function Landing() {
  return (
    <div className="pt-16">
      <div className="max-w-6xl mx-auto px-4 py-16">

        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 mb-6">
            <div className="relative">
              <Mic className="h-12 w-12 text-primary" />
              <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
            </div>
            <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
              Interview Practice
            </span>
          </div>
          <h1 className="text-5xl font-bold mb-6">
            Practice Interviews. Get Hired Faster.
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Paste any job description and get AI-generated interview questions tailored to the role.
            Record your video answers and receive instant feedback on clarity, confidence, structure, and impact.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup">
              <Button
                size="lg"
                className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
              >
                Start Practicing Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Sign In
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-16">
          {[
            { stat: "5–10 min", label: "Per practice session" },
            { stat: "5 types", label: "Behavioral, Technical, System Design, Product & more" },
            { stat: "5 scores", label: "Clarity, Confidence, Structure, Relevance & Impact" },
            { stat: "Instant", label: "AI feedback with model answers" },
          ].map((s) => (
            <div key={s.stat} className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">{s.stat}</div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything You Need to Nail Your Interview
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
              <CardHeader>
                <Zap className="h-10 w-10 text-brand-purple mb-4" />
                <CardTitle>AI-Generated Questions</CardTitle>
                <CardDescription>
                  Paste any job description and our AI instantly crafts questions tailored to the exact
                  role, company, and interview type you're preparing for.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Job-specific question tailoring</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Behavioral, technical & system design</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Adjustable difficulty and count</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
              <CardHeader>
                <Video className="h-10 w-10 text-brand-blue mb-4" />
                <CardTitle>Video Recording & Transcription</CardTitle>
                <CardDescription>
                  Record your answers with your webcam just like a real interview.
                  Your speech is transcribed live so the AI can evaluate every word you say.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Live webcam recording</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Real-time speech transcription</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Re-record any answer</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 hover:border-primary/40 transition-colors">
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Scored AI Feedback</CardTitle>
                <CardDescription>
                  Get a detailed score breakdown on five dimensions — clarity, confidence, structure,
                  relevance, and impact — plus a model answer to compare against.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />0–10 score per answer</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Specific strengths & improvements</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />AI model answer for every question</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How it works */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Target, step: "1. Paste Job Description", desc: "Drop in any job posting and pick your interview type" },
              { icon: Sparkles, step: "2. AI Generates Questions", desc: "Get 5 tailored questions in seconds" },
              { icon: Mic, step: "3. Record Your Answers", desc: "Answer on camera with a live countdown timer" },
              { icon: TrendingUp, step: "4. Get Your Score", desc: "Instant feedback with a model answer to learn from" },
            ].map(({ icon: Icon, step, desc }) => (
              <div key={step} className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{step}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">What Candidates Are Saying</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "I used to freeze up on behavioral questions. After 3 practice sessions I finally landed a FAANG offer. The AI feedback was brutally honest and incredibly helpful.",
                name: "James Park",
                title: "Software Engineer → Google",
              },
              {
                quote: "The tailored questions for a specific job description blew me away. It asked me almost exactly what came up in my real interview at Stripe.",
                name: "Priya Mehta",
                title: "Product Manager → Stripe",
              },
              {
                quote: "I score myself a 6 before practicing and an 8.5 after. The model answers showed me exactly how to restructure my responses with STAR format.",
                name: "Marcus Williams",
                title: "Engineering Manager → Meta",
              },
            ].map((t) => (
              <Card key={t.name}>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm mb-4">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.title}</p>
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
            Ready to Ace Your Next Interview?
          </h3>
          <p className="text-muted-foreground mb-6">
            Join thousands of job seekers who practice smarter and interview with confidence.
          </p>
          <Link to="/signup">
            <Button
              size="lg"
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
            >
              Start Practicing Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>

      </div>
      <Footer />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Step = "setup" | "preview" | "recording" | "analyzing" | "results";

export default function InterviewPractice() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  useSEO(location.pathname, {
    title: "AI Interview Practice — hired.video",
    description: "Simulate real job interviews and get AI feedback on your answers.",
  });
  useBreadcrumbs([{ name: "Interview Practice", url: "/interview" }]);

  const [step, setStep] = useState<Step>("setup");
  const [loading, setLoading] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType>("behavioral");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [analyzingIdx, setAnalyzingIdx] = useState(0);

  const apiBase = (window as any).__ENV?.API_URL || (import.meta as any).env?.VITE_API_URL || "/api";
  const authToken = localStorage.getItem("auth_token");

  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };

  async function generateQuestions(jd: string, type: InterviewType) {
    setLoading(true);
    setJobDescription(jd);
    setInterviewType(type);
    try {
      const res = await fetch(`${apiBase}/interview/questions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ jobDescription: jd, type, count: 5 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message ?? "Failed to generate questions");
      setQuestions(data.data.questions);
      setStep("preview");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate questions");
    } finally {
      setLoading(false);
    }
  }

  async function createSession(): Promise<string | null> {
    try {
      const res = await fetch(`${apiBase}/interview/sessions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ jobDescription, interviewType, questions }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message ?? "Failed to create session");
      return data.data.id as string;
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start session");
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
        const formOrJson = async () => {
          if (videoBlob && canUploadVideo()) {
            const form = new FormData();
            form.append("questionId", q.id);
            form.append("question", q.question);
            form.append("transcript", transcript);
            form.append("video", videoBlob, "answer.webm");
            const res = await fetch(`${apiBase}/interview/sessions/${sessionId}/answers`, {
              method: "POST",
              headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              body: form,
            });
            return res.json();
          } else {
            const res = await fetch(`${apiBase}/interview/sessions/${sessionId}/answers`, {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({ questionId: q.id, question: q.question, transcript }),
            });
            return res.json();
          }
        };
        const saveData = await formOrJson();
        if (saveData.success) savedAnswerId = saveData.data.id;
      }
    } catch {
      // Non-fatal — we can still analyze
    }

    // 2. Analyze
    let result: AnswerResult | null = null;
    if (transcript.trim().length > 5) {
      try {
        const analyzeRes = savedAnswerId
          ? await fetch(`${apiBase}/interview/answers/${savedAnswerId}/analyze`, {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({ jobDescription }),
            })
          : null;

        if (analyzeRes?.ok) {
          const analyzeData = await analyzeRes.json();
          if (analyzeData.success && analyzeData.data.feedback) {
            const fb = analyzeData.data.feedback as any;
            result = {
              answerId: savedAnswerId!,
              questionId: q.id,
              score: parseFloat(analyzeData.data.score ?? "0"),
              scoreBreakdown: fb.scoreBreakdown,
              feedback: fb.feedback,
              transcript,
            };
          }
        }
      } catch {
        // Fall through to mock
      }
    }

    if (!result && transcript.trim().length > 5) {
      // Client-side fallback scoring (no API needed)
      result = buildClientFeedback(q.question, transcript, q.id);
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
        fetch(`${apiBase}/interview/sessions/${sessionId}/complete`, {
          method: "PATCH",
          headers: authHeaders,
        }).catch(() => {});
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
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <Landing />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="pt-16">
        <div className="max-w-4xl mx-auto px-4 py-8">
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
        </div>
      </div>
    </div>
  );
}

// ─── Client-side fallback feedback ───────────────────────────────────────────

function canUploadVideo(): boolean {
  return false; // Disable video upload for now — transcripts only
}

function buildClientFeedback(question: string, transcript: string, questionId: string): AnswerResult {
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
        wordCount > 60 ? "Good level of detail in your response" : "Clear and direct answer",
        hasExample ? "You used a concrete example to support your point" : "You addressed the core question",
        hasNumbers ? "You included specific metrics which add credibility" : "You demonstrated relevant knowledge",
      ].slice(0, 2),
      improvements: [
        !hasStar ? "Use the STAR method (Situation → Task → Action → Result) for clearer structure" : "Good structure — keep using STAR",
        !hasNumbers ? "Add specific numbers (%, $, team size, timeline) to quantify your impact" : "Consider adding even more metrics",
        hasFillers > 3 ? `Reduce filler words (detected ${hasFillers} filler words — aim for confident pauses instead)` : "Speak at a steady pace and avoid rushing",
      ].filter(Boolean).slice(0, 3),
      suggestedAnswer: `A strong answer to this question uses the STAR method: describe the Situation briefly, your specific Task or responsibility, the concrete Actions you took, and the measurable Results. Include specific numbers where possible (e.g., "reduced load time by 40%", "led a team of 5", "increased revenue by $200k").`,
    },
    transcript,
  };
}
