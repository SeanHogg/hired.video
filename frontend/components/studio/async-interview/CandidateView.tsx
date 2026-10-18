import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, Clock, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DEFAULT_QUESTION_DURATION_SEC, formatDeadline } from "./helpers";
import { CandidateQuestionCard } from "./CandidateQuestionCard";
import { useCandidateInterview } from "./useCandidateInterview";

export function CandidateView({
  inviteToken,
  onComplete,
}: {
  inviteToken: string;
  onComplete?: () => void;
}) {
  const { t } = useTranslation();
  const {
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
    isRecording,
    recordingTime,
    videoPreviewRef,
    startRecording,
    stopRecording,
    retakeRecording,
    goNext,
    goPrev,
    handleSubmitAll,
  } = useCandidateInterview(inviteToken, onComplete);

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

  const maxDuration = currentQuestion.maxDurationSec || DEFAULT_QUESTION_DURATION_SEC;
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
      <CandidateQuestionCard
        question={currentQuestion}
        index={currentIdx}
        maxDuration={maxDuration}
        isRecording={isRecording}
        recordingTime={recordingTime}
        recording={recordings.get(currentQuestion.id)}
        error={error}
        videoPreviewRef={videoPreviewRef}
        onStart={startRecording}
        onStop={stopRecording}
        onRetake={retakeRecording}
      />

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
