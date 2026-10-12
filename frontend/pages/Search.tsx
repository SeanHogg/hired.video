import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import MarketplaceHero from "@/components/MarketplaceHero";
import UnifiedSearch from "@/components/UnifiedSearch";
import CreatorPromoCard from "@/components/marketing/CreatorPromoCard";
import ContentHero from "@/components/content/ContentHero";
import { AppShell } from "@/components/AppShell";

export default function SearchPage() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useDefaultBreadcrumbs();

  return (
    <AppShell bgClassName="bg-background">
      <ContentHero
        className="pb-4 pt-8 sm:pt-10"
        eyebrow={t("searchPage.eyebrow")}
        title={t("headings.marketplaceAndSearch")}
        lede={t("searchPage.lede")}
      />
      <UnifiedSearch stickySearch promoCard={<CreatorPromoCard variant="result" />} />
      <MarketplaceHero />
    </AppShell>
  );
}
