// "There are two kinds of job seekers." — identity framing: name the crowd
// the visitor doesn't want to be part of, then the group they do, and close
// on a choice with a deadline ("this week"). Product-true throughout.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, X } from "lucide-react";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { ReassuranceRow } from "@/components/marketing/persuasion/ReassuranceRow";

const POINTS = ["one", "two", "three"] as const;

export function LandingIdentity() {
  const { t } = useTranslation();
  return (
    <MarketingBand tone="card" id="identity" labelledBy="landing-identity-title" className="flex flex-col gap-10 py-24 sm:py-24">
      <MarketingSectionIntro id="landing-identity-title" title={t("persuasion.identity.title")} className="max-w-[560px]" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-5">
        <section aria-labelledby="identity-crowd" className="flex flex-col gap-4 rounded-[22px] border border-border bg-muted/40 p-7">
          <h3 id="identity-crowd" className="font-display text-2xl font-bold text-muted-foreground">
            {t("persuasion.identity.crowd.title")}
          </h3>
          <ul className="flex flex-col gap-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[15px] text-muted-foreground">
                <X className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                <span>{t(`persuasion.identity.crowd.${p}`)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="identity-seen" className="flex flex-col gap-4 rounded-[22px] border-2 border-primary bg-primary/5 p-7">
          <h3 id="identity-seen" className="font-display text-2xl font-bold text-foreground">
            {t("persuasion.identity.seen.title")}
          </h3>
          <ul className="flex flex-col gap-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[15px] text-foreground">
                <Check className="mt-0.5 h-4 w-4 flex-none text-brand-green-text" aria-hidden="true" />
                <span>{t(`persuasion.identity.seen.${p}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="flex flex-col gap-4">
        <p className="font-display text-[clamp(24px,2.8vw,32px)] font-bold tracking-[-0.02em] text-foreground">
          {t("persuasion.identity.choice")}
        </p>
        <Link to={NEW_KIT_PATH} className={`${HERO_CTA_PRIMARY} self-start`}>
          <span>{t("landing.cta.buildMyResume")}</span>
          <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
        </Link>
        <ReassuranceRow />
      </div>
    </MarketingBand>
  );
}
