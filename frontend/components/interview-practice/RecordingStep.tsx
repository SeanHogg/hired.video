// Step 3 — record (or type) an answer to one question. Owns the camera
// stream, MediaRecorder, speech recognition and the answer timer.

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, Loader2, Mic, RotateCcw, Square, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Question } from "@/lib/interview-practice/types";

export function RecordingStep({
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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {t("labels.interview.questionOfTotal", { current: questionIndex + 1, total: questions.length })}
          </p>
          <div className="flex flex-wrap gap-1" aria-hidden="true">
            {questions.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-8 rounded-full",
                  i < questionIndex ? "bg-primary" : i === questionIndex ? "bg-primary/60" : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>
        <Button variant="ghost" className="min-h-[44px]" onClick={onSkip}>
          {t("actions.skip")}
        </Button>
      </div>

      {/* Question */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs capitalize">{question.category}</Badge>
            <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {t("labels.interview.secondsLimit", { count: question.timeLimit })}
            </span>
          </div>
          <p className="font-display text-[clamp(20px,2.4vw,26px)] font-semibold leading-snug tracking-[-0.015em] text-foreground">
            {question.question}
          </p>
        </CardContent>
      </Card>

      {/* Video preview */}
      <div className="relative aspect-video overflow-hidden rounded-[20px] bg-ink">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />

        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/70">
            <span className="font-display text-7xl font-bold text-ink-foreground animate-ping">
              {countdown || t("status.interview.go")}
            </span>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-4 text-center">
            <VideoOff className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("messages.interview.cameraNotAvailable")}</p>
          </div>
        )}

        {isRecording && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-destructive px-2.5 py-1 font-mono text-xs font-semibold uppercase text-destructive-foreground">
            <span className="h-2 w-2 rounded-full bg-destructive-foreground animate-pulse" aria-hidden="true" />
            {t("status.interview.rec")}
          </div>
        )}

        {isRecording && (
          <div className="absolute right-3 top-3 rounded-lg bg-ink/80 px-2.5 py-1 font-mono text-sm text-ink-foreground" aria-live="off">
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
        <div className="rounded-xl border border-border bg-muted/50 p-4">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {t("labels.interview.liveTranscript")}
          </p>
          <p className="text-sm text-foreground">
            {transcript || <span className="italic text-muted-foreground">{t("status.interview.listening")}</span>}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {!isRecording && !hasRecorded && (
          <Button
            onClick={startRecording}
            disabled={!cameraReady || countdown !== null}
            className="flex-1"
            size="lg"
          >
            {countdown !== null ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />{t("status.interview.startingIn", { count: countdown })}</>
            ) : (
              <><Mic className="mr-2 h-4 w-4" aria-hidden="true" />{t("actions.interview.recordAnswer")}</>
            )}
          </Button>
        )}

        {isRecording && (
          <Button onClick={stopRecording} variant="destructive" className="flex-1" size="lg">
            <Square className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("studio.interviewPractice.stopRecording")}
          </Button>
        )}

        {hasRecorded && (
          <>
            <Button variant="outline" size="lg" onClick={handleReRecord} className="flex-1">
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("actions.interview.reRecord")}
            </Button>
            <Button onClick={handleSubmit} className="flex-1" size="lg">
              {t("actions.interview.submitAnswer")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>

      {/* No camera fallback — allow text-only answer */}
      {cameraError && !hasRecorded && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
            <label htmlFor="interview-text-answer" className="text-sm text-muted-foreground">
              {t("messages.interview.noCameraTypeInstead")}
            </label>
            <Textarea
              id="interview-text-answer"
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
