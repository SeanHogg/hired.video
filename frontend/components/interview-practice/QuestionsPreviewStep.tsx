// Step 2 — review the generated questions, then start (or regenerate).

import { useTranslation } from "react-i18next";
import { Clock, Loader2, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import MonoChip from "@/components/templates/MonoChip";
import type { InterviewType, Question } from "@/lib/interview-practice/types";

export function QuestionsPreviewStep({
  questions,
  interviewType,
  onBegin,
  onRegenerate,
  loading,
}: {
  questions: Question[];
  interviewType: InterviewType;
  onBegin: () => void;
  onRegenerate: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const totalSeconds = questions.reduce((s, q) => s + q.timeLimit, 0);
  const totalMinutes = Math.round(totalSeconds / 60);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <MonoChip>{t(`labels.interview.typeName.${interviewType}`)}</MonoChip>
          <span className="font-mono text-xs text-muted-foreground">
            {t("labels.interview.questionsCountMins", { count: questions.length, minutes: totalMinutes })}
          </span>
        </div>
        <h2 className="font-display text-[clamp(26px,3.2vw,36px)] font-bold leading-[1.05] tracking-[-0.03em]">
          {t("headings.interview.yourQuestions")}
        </h2>
        <p className="max-w-[40em] text-base leading-relaxed text-muted-foreground">
          {t("messages.interview.reviewThenStart")}
        </p>
      </header>

      <Card>
        <CardContent className="p-0">
          <ol className="divide-y divide-border">
            {questions.map((q, i) => (
              <li key={q.id} className="flex gap-4 p-4 sm:p-5">
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent font-mono text-sm font-semibold text-primary"
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug text-foreground">{q.question}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs capitalize">{q.category}</Badge>
                    <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {t("labels.interview.seconds", { count: q.timeLimit })}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" onClick={onRegenerate} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {t("actions.regenerate")}
        </Button>
        <Button size="lg" onClick={onBegin}>
          {t("studio.interviewPractice.startPractice")}
          <Play className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
