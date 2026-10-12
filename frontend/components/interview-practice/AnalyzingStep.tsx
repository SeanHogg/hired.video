// Interstitial shown while an answer is saved + analyzed.

import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

export function AnalyzingStep({ questionIndex, total }: { questionIndex: number; total: number }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-6 px-5 py-16 text-center sm:px-6" role="status" aria-live="polite">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" aria-hidden="true" />
          <div className="absolute inset-2 flex items-center justify-center rounded-xl bg-accent text-primary">
            <BarChart3 className="h-8 w-8" aria-hidden="true" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{t("status.interview.analyzingAnswer")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("status.interview.evaluatingQuestion", { current: questionIndex, total })}
          </p>
        </div>
        <Progress value={(questionIndex / total) * 100} className="h-2 w-full max-w-md" />
      </CardContent>
    </Card>
  );
}
