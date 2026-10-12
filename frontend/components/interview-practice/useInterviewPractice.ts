/**
 * The interview-practice state machine (setup → preview → recording →
 * analyzing → results), shell-free so the coach runs on any surface. Talks to
 * the API only through interviewPracticeService. A `start` opens on the
 * question preview with questions another surface already has; a `resumeText`
 * makes generated questions about this candidate. An answer the API can't
 * score falls back to client-side STAR feedback.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { interviewPracticeService } from "@/lib/services/interview-practice-service";
import { buildClientFeedback, canUploadVideo } from "./client-feedback";
import type { PracticeStart } from "./practice-start";
import type { AnswerResult, Feedback, InterviewStep, InterviewType, Question, ScoreBreakdown } from "@/lib/interview-practice/types";

interface Args {
  start?: PracticeStart;
  /** The candidate's résumé as text, for questions about them. */
  resumeText?: () => Promise<string | null>;
}

const MIN_TRANSCRIPT = 5;

export function useInterviewPractice({ start, resumeText }: Args = {}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<InterviewStep>(start ? "preview" : "setup");
  const [loading, setLoading] = useState(false);
  const [jobDescription, setJobDescription] = useState(start?.jobDescription ?? "");
  const [interviewType, setInterviewType] = useState<InterviewType>(start?.type ?? "behavioral");
  const [questions, setQuestions] = useState<Question[]>(start?.questions ?? []);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [analyzingIdx, setAnalyzingIdx] = useState(0);

  const generateQuestions = useCallback(
    async (jd: string, type: InterviewType) => {
      setLoading(true);
      setJobDescription(jd);
      setInterviewType(type);
      try {
        const resume = (await resumeText?.().catch(() => null)) ?? undefined;
        setQuestions(await interviewPracticeService.generateQuestions({ jobDescription: jd, type, resumeText: resume }));
        setStep("preview");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errors.interview.generateQuestions"));
      } finally {
        setLoading(false);
      }
    },
    [resumeText, t],
  );

  const begin = useCallback(async () => {
    try {
      const sid = await interviewPracticeService.createSession({ jobDescription, interviewType, questions });
      setSessionId(sid);
      setQuestionIndex(0);
      setResults([]);
      setStep("recording");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("studio.interviewPractice.errors.startSession"));
    }
  }, [jobDescription, interviewType, questions, t]);

  const scoreAnswer = useCallback(
    async (q: Question, transcript: string, video: Blob | null): Promise<AnswerResult | null> => {
      let answerId: string | null = null;
      if (sessionId) {
        try {
          answerId = await interviewPracticeService.saveAnswer(sessionId, {
            questionId: q.id,
            question: q.question,
            transcript,
            video: video && canUploadVideo() ? video : undefined,
          });
        } catch {
          // Non-fatal: the answer can still be scored on the client.
        }
      }
      if (transcript.trim().length <= MIN_TRANSCRIPT) return null;
      if (answerId) {
        try {
          const analyzed = await interviewPracticeService.analyzeAnswer(answerId, jobDescription);
          const fb = analyzed.feedback as { scoreBreakdown?: ScoreBreakdown; feedback?: Feedback } | undefined;
          if (fb?.scoreBreakdown && fb.feedback) {
            return {
              answerId,
              questionId: q.id,
              score: parseFloat(analyzed.score ?? "0"),
              scoreBreakdown: fb.scoreBreakdown,
              feedback: fb.feedback,
              transcript,
            };
          }
        } catch {
          // Fall through to client-side scoring.
        }
      }
      return buildClientFeedback(t, q.question, transcript, q.id);
    },
    [sessionId, jobDescription, t],
  );

  const answer = useCallback(
    async (transcript: string, video: Blob | null) => {
      const q = questions[questionIndex];
      if (!q) return;
      setStep("analyzing");
      setAnalyzingIdx(questionIndex + 1);
      const result = await scoreAnswer(q, transcript, video);
      setResults((prev) => {
        const next = [...prev];
        if (result) next[questionIndex] = result;
        return next;
      });
      const nextIndex = questionIndex + 1;
      if (nextIndex < questions.length) {
        setQuestionIndex(nextIndex);
        setStep("recording");
      } else {
        if (sessionId) void interviewPracticeService.completeSession(sessionId).catch(() => {});
        setStep("results");
      }
    },
    [questions, questionIndex, scoreAnswer, sessionId],
  );

  const skip = useCallback(() => {
    const nextIndex = questionIndex + 1;
    if (nextIndex < questions.length) setQuestionIndex(nextIndex);
    else setStep("results");
  }, [questionIndex, questions.length]);

  const restart = useCallback(() => {
    setStep("setup");
    setQuestions([]);
    setSessionId(null);
    setQuestionIndex(0);
    setResults([]);
    setJobDescription("");
  }, []);

  const retry = useCallback((idx: number) => {
    setQuestionIndex(idx);
    setStep("recording");
  }, []);

  return {
    step,
    loading,
    interviewType,
    questions,
    questionIndex,
    results,
    analyzingIdx,
    generateQuestions,
    regenerate: () => generateQuestions(jobDescription, interviewType),
    begin,
    answer,
    skip,
    restart,
    retry,
  };
}
