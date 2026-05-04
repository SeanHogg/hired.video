import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO } from "@/lib/seo";
import MarketplaceHero from "@/components/MarketplaceHero";
import UnifiedSearch from "@/components/UnifiedSearch";
import { AppShell } from "@/components/AppShell";

export default function SearchPage() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);

  return (
    <AppShell bgClassName="bg-background">
<div className="pt-16">
          <h1 className="sr-only">{t("headings.marketplaceAndSearch")}</h1>
          <UnifiedSearch hideSearchInput />
          <MarketplaceHero />
        </div>
</AppShell>
  );
}
