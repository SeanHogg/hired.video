import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_QUESTION_DURATION_SEC,
  MIN_QUESTION_DURATION_SEC,
  clampQuestionDuration,
  type QuestionDraft,
} from "./helpers";

interface QuestionDraftRowProps {
  question: QuestionDraft;
  index: number;
  canRemove: boolean;
  onRemove: (id: string) => void;
  onUpdate: (
    id: string,
    field: keyof QuestionDraft,
    value: string | number | boolean,
  ) => void;
}

export function QuestionDraftRow({
  question: q,
  index,
  canRemove,
  onRemove,
  onUpdate,
}: QuestionDraftRowProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="mt-1.5 text-sm font-medium text-muted-foreground">
          {t("studio.asyncInterview.questionNumberShort", { num: index + 1 })}
        </span>
        <div className="flex-1">
          <Input
            placeholder={t("studio.asyncInterview.questionPlaceholder")}
            value={q.text}
            onChange={(e) => onUpdate(q.id, "text", e.target.value)}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          disabled={!canRemove}
          onClick={() => onRemove(q.id)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="flex items-center gap-4 pl-7">
        <div className="flex items-center gap-2">
          <Label
            htmlFor={`duration-${q.id}`}
            className="text-xs text-muted-foreground whitespace-nowrap"
          >
            {t("studio.asyncInterview.maxDurationSec")}
          </Label>
          <Input
            id={`duration-${q.id}`}
            type="number"
            min={MIN_QUESTION_DURATION_SEC}
            max={MAX_QUESTION_DURATION_SEC}
            className="w-24"
            value={q.maxDurationSec}
            onChange={(e) =>
              onUpdate(
                q.id,
                "maxDurationSec",
                clampQuestionDuration(Number(e.target.value)),
              )
            }
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-input"
            checked={q.required}
            onChange={(e) => onUpdate(q.id, "required", e.target.checked)}
          />
          {t("labels.required")}
        </label>
      </div>
    </div>
  );
}
