// Step 1 — paste a job description and pick an interview type.

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ToolTitleBlock } from "@/components/tools/ToolTitleBlock";
import { cn } from "@/lib/utils";
import type { InterviewType } from "@/lib/interview-practice/types";

const TYPES: { value: InterviewType; labelKey: string; descriptionKey: string }[] = [
  { value: "behavioral", labelKey: "studio.interviewPractice.category.behavioral", descriptionKey: "labels.interview.typeBehavioralDesc" },
  { value: "technical", labelKey: "studio.interviewPractice.category.technical", descriptionKey: "labels.interview.typeTechnicalDesc" },
  { value: "system-design", labelKey: "labels.interview.typeSystemDesign", descriptionKey: "labels.interview.typeSystemDesignDesc" },
  { value: "product", labelKey: "labels.product", descriptionKey: "labels.interview.typeProductDesc" },
  { value: "general", labelKey: "labels.tabGroupGeneral", descriptionKey: "labels.interview.typeGeneralDesc" },
];

export function SetupStep({
  onStart,
  loading,
}: {
  onStart: (jobDescription: string, type: InterviewType) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [jobDescription, setJobDescription] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType>("behavioral");
  const jdId = useId();
  const typeLabelId = useId();

  return (
    <div className="flex flex-col gap-6">
      <ToolTitleBlock
        icon={<Mic className="h-6 w-6" />}
        title={t("headings.interview.practiceTitle")}
        description={t("messages.interview.setupSubtitle")}
      />

      <Card>
        <CardContent className="flex flex-col gap-6 p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <label htmlFor={jdId} className="text-sm font-semibold text-foreground">
              {t("headings.jobDescription")}
            </label>
            <Textarea
              id={jdId}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder={t("labels.interview.jdPlaceholder")}
              className="min-h-[200px] font-mono text-sm"
            />
            <p className="font-mono text-xs text-muted-foreground">
              {t("labels.interview.charCount", { count: jobDescription.length })}
            </p>
          </div>

          <div className="flex flex-col gap-3" role="group" aria-labelledby={typeLabelId}>
            <span id={typeLabelId} className="text-sm font-semibold text-foreground">
              {t("labels.interview.interviewType")}
            </span>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-2.5">
              {TYPES.map((ty) => {
                const active = interviewType === ty.value;
                return (
                  <button
                    key={ty.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setInterviewType(ty.value)}
                    className={cn(
                      "min-h-[44px] rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary bg-accent"
                        : "border-border bg-card hover:border-primary/50 hover:bg-muted",
                    )}
                  >
                    <div className={cn("text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
                      {t(ty.labelKey)}
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(ty.descriptionKey)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={() => onStart(jobDescription, interviewType)}
            disabled={jobDescription.trim().length < 20 || loading}
            className="w-full sm:w-auto sm:self-start"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t("status.interview.generatingQuestions")}
              </>
            ) : (
              <>
                {t("actions.interview.generateQuestions")}
                <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
