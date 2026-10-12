/**
 * "How I read this" — the facts behind the insights card, shown on request.
 * The pattern row ("Has a career break") is a rule applied to dates; this
 * shows the dates and the rule, so a visitor can check the reading (and fix a
 * missing date) without asking the AI. No model call: it renders the same
 * `analyzeResume` result the card does.
 */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { CAREER_BREAK_MONTHS, type ResumeInsights } from "@shared/resume-insights";
import { cn } from "@/lib/utils";

/** "2024-12" → "Dec 2024" in the visitor's language. */
function useMonthLabel() {
  const { i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(i18n.language, { month: "short", year: "numeric", timeZone: "UTC" });
  return (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return fmt.format(new Date(Date.UTC(y, m - 1, 1)));
  };
}

export default function InsightsDetails({ insights }: { insights: ResumeInsights }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const month = useMonthLabel();
  const gap = insights.longestGap;

  const facts = [
    t("build.insights.details.years", { years: insights.yearsExperience }),
    gap
      ? t("build.insights.details.gap", { count: gap.months, from: month(gap.from), to: month(gap.to) })
      : t("build.insights.details.noGap"),
    t("build.insights.details.rule", { count: CAREER_BREAK_MONTHS }),
    ...(insights.undatedRoles > 0
      ? [t("build.insights.details.undated", { count: insights.undatedRoles })]
      : []),
  ];

  return (
    <div className="text-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[32px] items-center gap-1 font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t("build.insights.details.toggle")}
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul id={panelId} className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-foreground/80">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
