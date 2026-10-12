// eslint-page-chrome: skip — catch-all 404; noindex, no breadcrumb trail.
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { MarketingHero, HERO_CTA_PRIMARY, HERO_CTA_LINK } from "@/components/marketing/MarketingHero";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  // SEO: mark as noindex and set canonical to homepage to avoid indexation of 404 paths
  useSEO(location.pathname, {
    title: "404 Not Found — hired.video",
    description: "This page could not be found.",
    robots: "noindex, nofollow",
    canonical: "https://hired.video/",
    ogTitle: "404 Not Found — hired.video",
    ogDescription: "This page could not be found.",
  });

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          eyebrow={t("notFound.eyebrow")}
          title={t("notFound.title")}
          subtitle={t("notFound.body")}
          className="pb-24 sm:pb-28 sm:pt-24"
          actions={
            <>
              <Link to={NEW_KIT_PATH} className={HERO_CTA_PRIMARY}>
                {t("landing.cta.buildMyResume")}
              </Link>
              <Link to="/" className={HERO_CTA_LINK}>
                {t("actions.backToHome")}
              </Link>
            </>
          }
        />
      </main>
    </AppShell>
  );
};

export default NotFound;
