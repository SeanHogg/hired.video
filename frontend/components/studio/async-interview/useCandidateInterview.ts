import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  finalizeAsyncInterview,
  getAsyncInterviewInvite,
  submitAsyncResponse,
  uploadRecording,
  type AsyncInterview,
} from "@/lib/services/studio-features-service";
import type { UploadedResponse } from "./helpers";
import { useQuestionRecorder } from "./useQuestionRecorder";

function withEntry<V>(prev: Map<string, V>, key: string, value: V): Map<string, V> {
  const next = new Map(prev);
  next.set(key, value);
  return next;
}

function withoutEntry<V>(prev: Map<string, V>, key: string): Map<string, V> {
  const next = new Map(prev);
  next.delete(key);
  return next;
}

/**
 * Candidate flow: load the interview by invite token, step through its
 * questions recording one take each, then upload + submit every take
 * and finalize.
 */
export function useCandidateInterview(inviteToken: string, onComplete?: () => void) {
  const { t } = useTranslation();
  const [interview, setInterview] = useState<AsyncInterview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [recordings, setRecordings] = useState<Map<string, Blob>>(new Map());
  const [uploadedMap, setUploadedMap] = useState<Map<string, UploadedResponse>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  const recorder = useQuestionRecorder({
    onRecorded: (questionId, blob) =>
      setRecordings((prev) => withEntry(prev, questionId, blob)),
    onMediaError: () => setError(t("studio.asyncInterview.errors.mediaAccess")),
  });

  const currentQuestion = interview?.questions[currentIdx] ?? null;
  const totalQuestions = interview?.questions.length ?? 0;
  const progressPercent =
    totalQuestions > 0 ? ((currentIdx + 1) / totalQuestions) * 100 : 0;

  const startRecording = async () => {
    if (!currentQuestion) return;
    await recorder.startRecording(currentQuestion);
  };

  const retakeRecording = () => {
    if (!currentQuestion) return;
    setRecordings((prev) => withoutEntry(prev, currentQuestion.id));
    setUploadedMap((prev) => withoutEntry(prev, currentQuestion.id));
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
          setUploadedMap((prev) =>
            withEntry(prev, question.id, {
              recordingId: uploadResult.id,
              videoUrl: uploadResult.videoUrl ?? undefined,
            }),
          );

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

  return {
    interview,
    loading,
    error,
    submitted,
    submitting,
    currentIdx,
    currentQuestion,
    totalQuestions,
    progressPercent,
    recordings,
    isRecording: recorder.isRecording,
    recordingTime: recorder.recordingTime,
    videoPreviewRef: recorder.videoPreviewRef,
    startRecording,
    stopRecording: recorder.stopRecording,
    retakeRecording,
    goNext,
    goPrev,
    handleSubmitAll,
  };
}
