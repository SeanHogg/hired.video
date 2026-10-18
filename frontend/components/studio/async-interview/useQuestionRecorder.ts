import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncInterview } from "@/lib/services/studio-features-service";
import { DEFAULT_QUESTION_DURATION_SEC } from "./helpers";

type InterviewQuestion = AsyncInterview["questions"][number];

interface UseQuestionRecorderOptions {
  /** Receives the finished take for the question it was started on. */
  onRecorded: (questionId: string, blob: Blob) => void;
  /** Media acquisition failed. */
  onMediaError: () => void;
}

/**
 * Candidate-side webcam capture for one question at a time: stream,
 * MediaRecorder, elapsed-seconds timer with the question's max-duration
 * auto-stop, and unmount cleanup.
 */
export function useQuestionRecorder({ onRecorded, onMediaError }: UseQuestionRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const startRecording = async (question: InterviewQuestion) => {
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
        onRecorded(question.id, blob);
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
          if (next >= (question.maxDurationSec || DEFAULT_QUESTION_DURATION_SEC)) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch {
      onMediaError();
    }
  };

  return {
    isRecording,
    recordingTime,
    videoPreviewRef,
    startRecording,
    stopRecording,
  };
}
