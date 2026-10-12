/**
 * "Here's what I see" — the parsed resume summarized as a definition list,
 * a one-sentence structure recommendation, and the issues we can actually
 * detect. Rendered as part of the assistant's reply (no card chrome).
 */
import { Trans, useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import type { ResumeInsights } from "@shared/resume-insights";
import {
  INDUSTRY_LABEL_KEYS,
  PATTERN_LABEL_KEYS,
  SENIORITY_LABEL_KEYS,
  STRUCTURE_LABEL_KEYS,
} from "@/lib/build/insight-labels";
import InsightsDetails from "./InsightsDetails";

interface InsightsCardProps {
  insights: ResumeInsights;
}

export default function InsightsCard({ insights }: InsightsCardProps) {
  const { t } = useTranslation();
  const notDetected = t("build.insights.notDetected");
  const rows: Array<[string, string]> = [
    [t("build.insights.industry"), insights.industry ? t(INDUSTRY_LABEL_KEYS[insights.industry]) : notDetected],
    [t("build.insights.role"), insights.roleFamily ?? notDetected],
    [
      t("build.insights.level"),
      insights.yearsExperience > 0
        ? t("build.insights.levelWithYears", {
            level: t(SENIORITY_LABEL_KEYS[insights.seniority]),
            years: Math.round(insights.yearsExperience),
          })
        : t(SENIORITY_LABEL_KEYS[insights.seniority]),
    ],
    [t("build.insights.pattern"), t(PATTERN_LABEL_KEYS[insights.pattern])],
  ];

  return (
    <section className="flex flex-col gap-2.5 text-[15px] leading-[1.55] text-foreground">
      <h2 className="sr-only">{t("build.insights.title")}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 rounded-[14px] bg-background p-3.5 text-sm">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="min-w-0 break-words font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <InsightsDetails insights={insights} />
      <p>
        <Trans
          i18nKey="build.insights.recommend"
          values={{ structure: t(STRUCTURE_LABEL_KEYS[insights.recommendedStructure]) }}
          components={{ strong: <strong className="font-semibold" /> }}
        />{" "}
        {t(insights.reasons[0])}
      </p>
      {insights.flags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="font-semibold">{t("build.insights.flagsTitle")}</h3>
          <ul className="flex flex-col gap-1.5">
            {insights.flags.map((flag) => (
              <li key={flag.id} className="flex items-start gap-2 text-sm text-foreground/80">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                <span>{flag.count !== undefined ? t(flag.labelKey, { count: flag.count }) : t(flag.labelKey)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
