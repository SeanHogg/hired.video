/**
 * The AI Interview Coach — practice questions out loud (or typed), one at a
 * time, with STAR feedback and a score per answer — as ONE shell-free
 * component that runs on any surface: the /interview page, the kit's slide-out
 * (bound to the open résumé), and the "Practise" sheet beside generated
 * interview questions or an interview assignment (PracticeInterviewButton).
 *
 * Self-contained: owns its flow (useInterviewPractice) and its sign-in gate.
 * A linked résumé (?resumeId, or the draft open in the kit workspace via tool-embed)
 * makes generated questions about this candidate.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import AuthOverlay from "@/components/AuthOverlay";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { readResumeContent } from "@/lib/tools/resume-content";
import { resumeToPlainText } from "@/lib/resume-exporters";
import { SetupStep } from "./SetupStep";
import { QuestionsPreviewStep } from "./QuestionsPreviewStep";
import { RecordingStep } from "./RecordingStep";
import { AnalyzingStep } from "./AnalyzingStep";
import { ResultsStep } from "./ResultsStep";
import { useInterviewPractice } from "./useInterviewPractice";
import type { PracticeStart } from "./practice-start";

interface InterviewCoachProps {
  /** Open on these questions instead of asking for a job description. */
  start?: PracticeStart;
}

export default function InterviewCoach({ start }: InterviewCoachProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { resumeId } = useToolEntityParams();
  const resumeText = useCallback(async () => {
    if (!resumeId) return null;
    const content = await readResumeContent(resumeId);
    return content ? resumeToPlainText(content) : null;
  }, [resumeId]);
  const coach = useInterviewPractice({ start, resumeText });

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-[320px]">
        <AuthOverlay
          contentType="tool"
          title={t("headings.interview.practiceTitle")}
          message={t("messages.interview.signInToPractice")}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {coach.step === "setup" && <SetupStep onStart={coach.generateQuestions} loading={coach.loading} />}
      {coach.step === "preview" && (
        <QuestionsPreviewStep
          questions={coach.questions}
          interviewType={coach.interviewType}
          onBegin={() => void coach.begin()}
          onRegenerate={() => void coach.regenerate()}
          loading={coach.loading}
        />
      )}
      {coach.step === "recording" && (
        <RecordingStep
          key={coach.questionIndex}
          questions={coach.questions}
          questionIndex={coach.questionIndex}
          onAnswerComplete={(transcript, video) => void coach.answer(transcript, video)}
          onSkip={coach.skip}
        />
      )}
      {coach.step === "analyzing" && <AnalyzingStep questionIndex={coach.analyzingIdx} total={coach.questions.length} />}
      {coach.step === "results" && (
        <ResultsStep questions={coach.questions} results={coach.results} onRestart={coach.restart} onRetry={coach.retry} />
      )}
    </div>
  );
}
