// Score colour rule + the five-metric breakdown grid, shared by the overall
// summary and the per-question card on the results step.

import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ScoreBreakdown } from "@/lib/interview-practice/types";

/** Token colour for a 0–10 score: green ≥ 8, amber ≥ 6, destructive below. */
export function scoreColor(s: number): string {
  if (s >= 8) return "text-brand-green-text";
  if (s >= 6) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export function ScoreMetricGrid({
  breakdown,
  size = "sm",
}: {
  breakdown: ScoreBreakdown;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-3">
      {(Object.entries(breakdown) as [keyof ScoreBreakdown, number][]).map(([k, v]) => (
        <div key={k} className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 px-2 py-3 text-center">
          <span className="text-xs text-muted-foreground">{t(`labels.interview.metric.${k}`)}</span>
          <span className={cn("font-mono font-semibold", size === "md" ? "text-lg" : "text-base", scoreColor(v))}>{v}</span>
          <Progress value={v * 10} className="mt-1 h-1 w-full" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
