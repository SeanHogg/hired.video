// "Your resume gets seconds." — the stakes band. Loss framing first (what
// staying a PDF costs you), anchored by one cited, real study, then the turn
// to hope. Every claim here is either cited or a plain description of how
// applying works; nothing is invented.

import { useTranslation } from "react-i18next";
import { EyeOff, Copy, PhoneOff } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";

const LOSSES = [
  { id: "blend", icon: Copy },
  { id: "silence", icon: EyeOff },
  { id: "someoneElse", icon: PhoneOff },
] as const;

export function LandingStakes() {
  const { t } = useTranslation();
  return (
    <MarketingBand id="stakes" labelledBy="landing-stakes-title" className="flex flex-col gap-10 py-24 sm:py-24">
      <div className="flex flex-col gap-4">
        <p className="font-mono text-[13px] uppercase tracking-[0.08em] text-destructive">
          {t("persuasion.stakes.eyebrow")}
        </p>
        <MarketingSectionIntro
          id="landing-stakes-title"
          title={t("persuasion.stakes.title")}
          subtitle={t("persuasion.stakes.body")}
          className="max-w-[640px]"
        />
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
        {LOSSES.map(({ id, icon: Icon }) => (
          <li key={id} className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="font-display text-xl font-bold tracking-[-0.01em] text-foreground">
              {t(`persuasion.stakes.${id}.title`)}
            </h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{t(`persuasion.stakes.${id}.body`)}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <p className="max-w-[40em] font-display text-[clamp(22px,2.4vw,28px)] font-bold leading-snug tracking-[-0.02em] text-foreground">
          {t("persuasion.stakes.turn")}
        </p>
        <p className="text-xs text-muted-foreground">{t("persuasion.stakes.source")}</p>
      </div>
    </MarketingBand>
  );
}
