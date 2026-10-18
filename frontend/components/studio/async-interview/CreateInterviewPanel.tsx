import { useTranslation } from "react-i18next";
import { Loader2, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MAX_QUESTIONS, type CreatedInterview } from "./helpers";
import { QuestionDraftRow } from "./QuestionDraftRow";
import { useInterviewForm } from "./useInterviewForm";

export function CreateInterviewPanel({
  onCreated,
}: {
  onCreated: (interview: CreatedInterview) => void;
}) {
  const { t } = useTranslation();
  const {
    form,
    creating,
    error,
    canSubmit,
    updateField,
    addQuestion,
    removeQuestion,
    updateQuestion,
    handleCreate,
  } = useInterviewForm(onCreated);

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
              {form.questions.length} / {MAX_QUESTIONS}
            </span>
          </div>

          {form.questions.map((q, idx) => (
            <QuestionDraftRow
              key={q.id}
              question={q}
              index={idx}
              canRemove={form.questions.length > 1}
              onRemove={removeQuestion}
              onUpdate={updateQuestion}
            />
          ))}

          {form.questions.length < MAX_QUESTIONS && (
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
