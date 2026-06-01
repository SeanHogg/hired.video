import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import MarketplaceHero from "@/components/MarketplaceHero";
import UnifiedSearch from "@/components/UnifiedSearch";
import CreatorPromoCard from "@/components/marketing/CreatorPromoCard";
import { AppShell } from "@/components/AppShell";

export default function SearchPage() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useDefaultBreadcrumbs();

  return (
    <AppShell bgClassName="bg-background">
      <h1 className="sr-only">{t("headings.marketplaceAndSearch")}</h1>
      <UnifiedSearch stickySearch sidebar={<CreatorPromoCard variant="banner" />} />
      <MarketplaceHero />
    </AppShell>
  );
}
