import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import MarketplaceHero from "@/components/MarketplaceHero";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import UnifiedSearch from "@/components/UnifiedSearch";
import { useSidebar } from "@/hooks/use-sidebar";

export default function SearchPage() {
  const location = useLocation();
  const { t } = useTranslation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  useSEO(location.pathname);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16">
          <h1 className="sr-only">{t("headings.marketplaceAndSearch")}</h1>
          <UnifiedSearch hideSearchInput />
          <MarketplaceHero />
        </div>

        <Footer />
      </div>
    </div>
  );
}
