import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createAsyncInterview } from "@/lib/services/studio-features-service";
import {
  MAX_QUESTIONS,
  emptyForm,
  emptyQuestion,
  type CreatedInterview,
  type InterviewForm,
  type QuestionDraft,
} from "./helpers";

/** Draft state + create mutation for the recruiter "new interview" form. */
export function useInterviewForm(onCreated: (interview: CreatedInterview) => void) {
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
    if (form.questions.length >= MAX_QUESTIONS) return;
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

  return {
    form,
    creating,
    error,
    canSubmit,
    updateField,
    addQuestion,
    removeQuestion,
    updateQuestion,
    handleCreate,
  };
}
