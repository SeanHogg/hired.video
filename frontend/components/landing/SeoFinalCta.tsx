// "Build my resume" closer for the job-seeker landing pages: the shared
// MarketingFinalCta band with a default primary (→ the kit workspace) and an optional
// secondary link. Page-specific copy comes in via title/body; every closer
// repeats the mantra, real proof and the three promises (persuasion/).

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { HERO_CTA_PRIMARY, INK_CTA_LINK, MarketingFinalCta } from "@/components/marketing/MarketingHero";
import { BuildCtaFooter, MantraKicker } from "@/components/marketing/persuasion/BuildCtaPersuasion";
import type { HeroLink } from "./SeoHero";

interface SeoFinalCtaProps {
  /** Unique per page — used for the band's aria-labelledby. */
  id: string;
  title: string;
  body?: string;
  primary?: HeroLink;
  secondary?: HeroLink;
  /** Replaces the primary link (e.g. a StudioOpenCTA deep link). */
  action?: ReactNode;
}

export function SeoFinalCta({ id, title, body, primary, secondary, action }: SeoFinalCtaProps) {
  const { t } = useTranslation();
  const cta = primary ?? { to: NEW_KIT_PATH, label: t("landing.cta.buildMyResume") };

  return (
    <MarketingFinalCta
      id={id}
      title={title}
      subtitle={body ?? t("persuasion.urgency")}
      kicker={<MantraKicker />}
      footer={<BuildCtaFooter />}
      actions={
        <>
          {action ?? (
            <Link to={cta.to} className={HERO_CTA_PRIMARY}>
              <span>{cta.label}</span>
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          )}
          {secondary && (
            <Link to={secondary.to} className={INK_CTA_LINK}>
              {secondary.label}
            </Link>
          )}
        </>
      }
    />
  );
}
