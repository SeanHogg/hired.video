// /chrome-extension "one engine" explainer: every action pairs the entity on
// the page with one of yours, then applies a verb (Create → Strengthen →
// Target → Promote). The same engine drives all three lenses.

import { useTranslation } from "react-i18next";
import { Globe, Plus, UserRound } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";

interface Verb {
  id: string;
  step: number;
  title: string;
  body: string;
}

export default function ExtensionPairVerb({ verbs }: { verbs: Verb[] }) {
  const { t } = useTranslation();
  const sides = [
    { id: "page", icon: Globe },
    { id: "yours", icon: UserRound },
  ];
  return (
    <MarketingBand tone="page" labelledBy="chrome-engine-heading" className="flex flex-col gap-8">
      <MarketingSectionIntro
        id="chrome-engine-heading"
        title={t("chromeExtension.one.engineTitle")}
        subtitle={t("chromeExtension.one.engineBody")}
      />

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {sides.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.id} className="contents">
              {i > 0 && (
                <Plus className="mx-auto h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="flex flex-1 items-start gap-3 rounded-2xl border border-border bg-card p-5">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-foreground">{t(`chromeExtension.one.pair.${s.id}`)}</span>
                  <span className="text-sm text-muted-foreground">{t(`chromeExtension.one.pair.${s.id}Body`)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        {verbs.map((v) => (
          <li key={v.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-primary">
              {t("chromeExtension.one.verbStep", { n: v.step })}
            </span>
            <span className="font-display text-xl font-bold text-foreground">{v.title}</span>
            <p className="text-sm leading-relaxed text-muted-foreground">{v.body}</p>
          </li>
        ))}
      </ol>
    </MarketingBand>
  );
}
