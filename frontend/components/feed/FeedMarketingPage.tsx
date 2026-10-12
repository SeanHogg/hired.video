// Signed-out /feed: the feed's own job-seeker pitch (post your video resume
// and career wins), four feature cards and a closing sign-up band. Rendered
// by components/feed/FeedRoute.tsx with no session.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, Globe, Lock, MessageSquare, Users, Video } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import ContentHero from "@/components/content/ContentHero";
import { CONTENT_CARD, ICON_TILE, TEXT_LINK } from "@/components/content/content-ui";
import { MarketingBand } from "@/components/marketing/MarketingBand";
import { HERO_CTA_PRIMARY, MarketingFinalCta } from "@/components/marketing/MarketingHero";
import { cn } from "@/lib/utils";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { BuildCtaFooter, MantraKicker } from "@/components/marketing/persuasion/BuildCtaPersuasion";

const FEATURES = [
  // The product loop: build a resume, turn it into a video, post it here.
  { id: "videoResume", icon: Video },
  { id: "milestones", icon: Users },
  { id: "hashtags", icon: Globe },
  { id: "privacy", icon: Lock },
] as const;

const PERKS = ["feed.marketing.perk.realtime", "feed.marketing.perk.ai", "feed.marketing.perk.network"] as const;

export default function FeedMarketingPage() {
  const { t } = useTranslation();
  return (
    <AppShell bgClassName="bg-background">
      <main>
        <ContentHero
          size="marketing"
          className="pb-16"
          eyebrow={
            <>
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {t("feed.marketing.eyebrow")}
            </>
          }
          title={t("feed.marketing.seekerTitle")}
          lede={t("feed.marketing.seekerLede")}
        >
          <Link to={NEW_KIT_PATH} className={HERO_CTA_PRIMARY}>
            {t("landing.cta.buildMyResume")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to="/login" className={TEXT_LINK}>
            {t("feed.marketing.signIn")}
          </Link>
        </ContentHero>

        <MarketingBand tone="card">
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
            {FEATURES.map(({ id, icon: Icon }) => (
              <li key={id} className={cn(CONTENT_CARD, "flex flex-col gap-3 bg-background p-6")}>
                <span className={ICON_TILE}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold text-foreground">{t(`feed.marketing.${id}.title`)}</h2>
                <p className="text-sm text-muted-foreground">{t(`feed.marketing.${id}.body`)}</p>
                <ul className="mt-1 flex flex-col gap-2 text-sm text-foreground">
                  {PERKS.map((perk) => (
                    <li key={perk} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand-green-text" aria-hidden="true" />
                      {t(perk)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </MarketingBand>

        <MarketingFinalCta
          kicker={<MantraKicker />}
          footer={<BuildCtaFooter />}
          id="feed-marketing"
          title={t("feed.marketing.ctaTitle")}
          actions={
            <Link to="/signup" className={HERO_CTA_PRIMARY}>
              {t("feed.marketing.join")}
            </Link>
          }
        />
      </main>
    </AppShell>
  );
}
