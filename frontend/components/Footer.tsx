import { Video, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Copyright from "./Copyright";
import LegalLinks from "./LegalLinks";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { cn } from "@/lib/utils";
import { runtimeConfig } from "@/lib/runtime-config";
import { useAuth } from "@/lib/auth";
import { AudienceLinks } from "@/components/landing/AudienceLinks";
import { LocationsSitemap } from "@/components/landing/LocationsSitemap";

/**
 * Footer — self-gates by authenticated state per #1628.
 *
 *   - Authenticated visitors see a COMPACT footer: product + support
 *     links + a short Resource Maps column with the three role pages +
 *     "All resource maps →" link.
 *   - Anonymous visitors (incl. Googlebot, since they're unauthenticated)
 *     see the EXPANDED footer: full audience grid inline for maximum SEO
 *     juice. Indeed/ZipRecruiter playbook.
 *
 * Shared sub-component <AudienceLinks variant="compact|expanded"> backs
 * both modes; no prop-drilled `canX` boolean, per the DRY rule.
 */
export default function Footer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const expanded = !user;
  return (
    // Two tonal bands (plum "B2"): the links band sits on --footer, the
    // copyright strip on the darker --footer-strong. Scoped descendant rules
    // theme every heading/paragraph/link inside — including the shared
    // <AudienceLinks>/<LocationsSitemap> columns — so nothing has to thread a
    // colour variant down. The whole footer renders inside the content column
    // (AppShell), so it never spans under the sidebar.
    <footer
      className={cn(
        "bg-footer text-footer-foreground",
        "[&_h3]:text-footer-foreground [&_p]:text-footer-muted",
        "[&_a]:text-footer-muted [&_a:hover]:text-footer-foreground",
      )}
    >
      {/* Band 1 — links */}
      <div id="footer-wrapper" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className={`grid grid-cols-1 gap-8 ${expanded ? "md:grid-cols-7" : "md:grid-cols-5"}`}>
          {/* Logo + tagline */}
          <div className="md:col-span-2 md:pl-4">
            <Link to="/" className="flex items-center space-x-2 mb-4">
              <div className="relative">
                <Video className="h-8 w-8 text-footer-brand" />
                <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
              </div>
              <span className="text-xl font-bold text-footer-brand">
                Hired.video
              </span>
            </Link>
            <p className="mb-4 max-w-md">
              {t("footer.tagline")}
            </p>
            <p className="text-sm">
              {t("footer.subtagline")}
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold mb-4">{t("labels.product")}</h3>
            <ul className="space-y-2">
              <li><Link to="/features" className="transition-colors">{t("labels.features")}</Link></li>
              <li><Link to="/pricing" className="transition-colors">{t("labels.pricing")}</Link></li>
              <li><Link to="/vs-competitors" className="transition-colors">{t("labels.vsCompetitors")}</Link></li>
              <li><Link to="/resumes" className="transition-colors">{t("labels.videoResumes")}</Link></li>
              <li><Link to="/jobs" className="transition-colors">{t("labels.jobBoard")}</Link></li>
              <li><Link to="/companies" className="transition-colors">{t("labels.forCompanies")}</Link></li>
              <li><Link to="/affiliate-program" className="transition-colors">{t("labels.affiliateProgram")}</Link></li>
              <li><Link to="/articles" className="transition-colors">{t("labels.articles", "Articles")}</Link></li>
              <li><Link to="/blog" className="transition-colors">{t("labels.blog")}</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold mb-4">{t("labels.support")}</h3>
            <ul className="space-y-2">
              <li><Link to="/help" className="transition-colors">{t("labels.helpCenter")}</Link></li>
              <li><Link to="/contact" className="transition-colors">{t("labels.contactUs")}</Link></li>
              <li><Link to="/about" className="transition-colors">{t("labels.aboutUs")}</Link></li>
              <li><Link to="/careers" className="transition-colors">{t("labels.careers")}</Link></li>
            </ul>
          </div>

          {/* Audience links — compact (3 roles + see all) for authed users,
              expanded (full grid) for anonymous visitors. Self-gates layout by
              `variant`; inherits the footer's scoped link/heading colours. */}
          <AudienceLinks variant={expanded ? "expanded" : "compact"} />

          {/* Locations column — expanded (anon) mode only. */}
          {expanded ? <LocationsSitemap variant="footer-grid" /> : null}
        </div>
      </div>

      {/* Band 2 — copyright strip (darker tone) */}
      <div className="bg-footer-strong text-footer-strong-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <Copyright />
            <p className="text-xs mt-1">
              {t("footer.build", { build: runtimeConfig.build })}
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6">
            <LocaleSwitcher variant="labeled" align="end" />
            <LegalLinks />
          </div>
        </div>
      </div>
    </footer>
  );
}
