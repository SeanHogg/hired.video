// Slots for the closing ink band on every job-seeker page: the mantra above
// the title (the one line we repeat everywhere) and real proof + the three
// promises under the actions. Pass to MarketingFinalCta's `kicker`/`footer`.

import { useTranslation } from "react-i18next";
import { ProofFigure } from "./ProofFigure";
import { ReassuranceRow } from "./ReassuranceRow";

/** "Don't just apply. Get seen." — the brand mantra, repeated site-wide. */
export function MantraKicker() {
  const { t } = useTranslation();
  return (
    <p className="font-mono text-[13px] uppercase tracking-[0.08em] text-ink-accent">{t("persuasion.mantra")}</p>
  );
}

export function BuildCtaFooter() {
  return (
    <div className="flex w-full flex-col gap-3 border-t border-ink-raised pt-6">
      <ProofFigure surface="ink" />
      <ReassuranceRow surface="ink" />
    </div>
  );
}
