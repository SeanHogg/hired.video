// Signed-out view of /people: hero, headline figures, a "meet the community"
// preview (cards rendered by the page from real public profiles) and the
// closing ink band. Composed from the shared marketing primitives.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

export default function PeopleMarketing({ featured }: { featured: ReactNode }) {
  const { t } = useTranslation();

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <SeoHero
          eyebrow={t("labels.professionalNetwork")}
          title={t("messages.connectCollaborateGrow")}
          // Recruiter / industry-leader framing follows the hiring persona switch.
          lede={t(HIRING_PERSONAS_ENABLED ? "messages.networkingValueProp" : "peopleMarketing.seeker.lede")}
          primary={{ to: "/signup", label: t("actions.joinNetwork") }}
          secondary={{ to: "/signup", label: t("actions.exploreProfiles") }}
        />

        <MarketingBand tone="card" labelledBy="people-community-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="people-community-title" title={t("headings.meetOurCommunity")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-6">{featured}</div>
          <Link to="/signup" className="inline-flex min-h-[44px] items-center gap-2 self-start font-semibold text-primary hover:underline">
            {t("actions.viewAllProfessionals")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </MarketingBand>

        <SeoFinalCta
          id="people"
          title={t("headings.expandNetworkPrompt")}
          body={t("peopleMarketing.finalBody")}
          primary={{ to: "/signup", label: t("actions.startNetworkingToday") }}
        />
      </main>
    </AppShell>
  );
}
