/**
 * /rewards — public guide to the job-seeker points program: hero with a
 * balance card, how you earn (job-seeker rules only), streak track, badges,
 * cash-out options, FAQ, closing CTA. Indexable; reads only public
 * endpoints (`/api/points/badges` + `/api/points/catalog`) plus, for
 * signed-in eligible users, their own summary (`/api/points/me`).
 *
 * Sections live in components/rewards/*; filtering/grouping/streak math in
 * lib/rewards/* (pure, unit-tested).
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import RewardsHero from "@/components/rewards/RewardsHero";
import EarnRulesSection from "@/components/rewards/EarnRulesSection";
import StreakTrack from "@/components/rewards/StreakTrack";
import RewardsBadgesSection from "@/components/rewards/RewardsBadgesSection";
import CashoutSection from "@/components/rewards/CashoutSection";
import { usePointsSummary } from "@/hooks/use-points-summary";
import { isJobSeekerAudience } from "@/lib/rewards/earning-rules";
import { balanceGoal } from "@/lib/rewards/balance-goal";
import {
  isPointsEligible,
  pointsService,
  type PointsCatalog,
  type ShowcaseBadge,
} from "@/lib/services/points-service";

const FAQ_COUNT = 7;

export default function RewardsPage() {
  const { t } = useTranslation();
  useSEO("/rewards");
  useBreadcrumbs([{ name: t("labels.rewards.breadcrumb"), url: "/rewards" }]);

  const { user } = useAuth();
  const eligible = Boolean(user) && isPointsEligible(user);
  // Shares the ["points","me"] cache with the hero card — one request.
  const summary = usePointsSummary(eligible);

  const badges = useQuery<ShowcaseBadge[]>({
    queryKey: ["points", "showcase-badges"],
    queryFn: () => pointsService.listAllBadges(),
    staleTime: 5 * 60 * 1000,
  });

  const catalog = useQuery<PointsCatalog>({
    queryKey: ["points", "catalog"],
    queryFn: () => pointsService.getCatalog(),
    staleTime: 5 * 60 * 1000,
  });

  const faqItems = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    question: t(`messages.rewards.faq${i + 1}Q`),
    answer: t(`messages.rewards.faq${i + 1}A`),
  }));

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <RewardsHero goal={balanceGoal(catalog.data?.redemptions)} />
        <EarnRulesSection actions={catalog.data?.actions} loading={catalog.isLoading} />
        <StreakTrack current={eligible ? (summary.data?.streak.current ?? null) : null} />
        <RewardsBadgesSection
          badges={badges.data?.filter(isJobSeekerAudience)}
          loading={badges.isLoading}
        />
        <CashoutSection redemptions={catalog.data?.redemptions} loading={catalog.isLoading} />

        {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
        <MarketingFAQ variant="plain" schemaId="rewards" items={faqItems} />

        <SeoFinalCta id="rewards" title={t("rewards.cta.title")} />
      </main>
    </AppShell>
  );
}
