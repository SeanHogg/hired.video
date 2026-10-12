/**
 * EngagementFormDialog — the fillable version of a video form widget,
 * opened from the playback overlay (#1586). Renders the form's real
 * `VideoFormField[]` as inputs and posts to `submitVideoForm`; the overlay
 * owns the open state and the `requireToContinue` playback gate.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { submitVideoForm, type PublicVideoForm, type VideoFormField } from "@/lib/services/studio-features-service";

interface EngagementFormDialogProps {
  form: PublicVideoForm | null;
  /** Playhead when the viewer opened the form — stored with the submission. */
  timestampSec: number;
  onOpenChange: (open: boolean) => void;
  /** Fires after the server accepted the submission. */
  onSubmitted: (formId: string) => void;
}

const INPUT_TYPE: Record<Exclude<VideoFormField["type"], "select">, string> = {
  email: "email",
  text: "text",
  tel: "tel",
};

export default function EngagementFormDialog({ form, timestampSec, onOpenChange, onSubmitted }: EngagementFormDialogProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setError(false);
    try {
      const result = await submitVideoForm(form.id, { answers, timestampSec });
      setAnswers({});
      onSubmitted(form.id);
      if (result.redirectUrl) window.open(result.redirectUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!form} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {form && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle>{form.title}</DialogTitle>
              <DialogDescription>
                {form.description || t("studio.engagementPlayback.formDescription")}
              </DialogDescription>
            </DialogHeader>
            {form.fields.map((field) => {
              const id = `engagement-form-${form.id}-${field.key}`;
              const value = answers[field.key] ?? "";
              const set = (next: string) => setAnswers((prev) => ({ ...prev, [field.key]: next }));
              return (
                <div key={field.key} className="flex flex-col gap-1">
                  <Label htmlFor={id}>
                    {field.label}
                    {field.required && <span aria-hidden="true"> *</span>}
                  </Label>
                  {field.type === "select" ? (
                    <select
                      id={id}
                      required={field.required}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    >
                      <option value="">{t("studio.engagementPlayback.selectPlaceholder")}</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={id}
                      type={INPUT_TYPE[field.type]}
                      required={field.required}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}
                </div>
              );
            })}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t("studio.engagementPlayback.submitFailed")}
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {form.submitButtonText || t("studio.engagementPlayback.submit")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
