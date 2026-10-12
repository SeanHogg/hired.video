/**
 * AudienceHiringCTA — shared geo/hiring call-to-action band for every
 * /for/[audience] landing page (profession + life-stage). Bridges the
 * "build it" surface to the "use it" surfaces (jobs + profile),
 * reinforcing the platform's region-agnostic, remote-friendly reach.
 *
 * Self-contained per the DRY rule: reads its own copy from i18n and
 * decides its own layout — consumers just mount `<AudienceHiringCTA />`.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";

export function AudienceHiringCTA({ tone = "card" }: { tone?: "page" | "card" }): JSX.Element {
  const { t } = useTranslation();
  return (
    <MarketingBand
      tone={tone}
      labelledBy="audience-hiring-title"
      className="flex flex-wrap items-end justify-between gap-8"
    >
      <div className="flex flex-col gap-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
          <MapPin className="h-6 w-6" />
        </span>
        <MarketingSectionIntro
          id="audience-hiring-title"
          title={t("audienceHiring.heading")}
          subtitle={t("audienceHiring.body")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button asChild size="lg">
          <Link to="/jobs">{t("audienceHiring.browseJobs")}</Link>
        </Button>
        <Link to="/signup" className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
          {t("audienceHiring.getDiscovered")}
        </Link>
      </div>
    </MarketingBand>
  );
}
