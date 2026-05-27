import { Video, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Copyright from "./Copyright";
import LegalLinks from "./LegalLinks";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
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
    <footer className="bg-background border-t border-border">
      <div id="footer-wrapper" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className={`grid grid-cols-1 gap-8 ${expanded ? "md:grid-cols-6" : "md:grid-cols-4"}`}>
          {/* Logo + tagline */}
          <div className="md:col-span-2 md:pl-4">
            <Link to="/" className="flex items-center space-x-2 mb-4">
              <div className="relative">
                <Video className="h-8 w-8 text-primary" />
                <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                Hired.video
              </span>
            </Link>
            <p className="text-muted-foreground mb-4 max-w-md">
              {t("footer.tagline")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("footer.subtagline")}
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("labels.product")}</h3>
            <ul className="space-y-2">
              <li><Link to="/features" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.features")}</Link></li>
              <li><Link to="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.pricing")}</Link></li>
              <li><Link to="/vs-competitors" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.vsCompetitors")}</Link></li>
              <li><Link to="/resumes" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.videoResumes")}</Link></li>
              <li><Link to="/jobs" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.jobBoard")}</Link></li>
              <li><Link to="/companies" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.forCompanies")}</Link></li>
              <li><Link to="/affiliate-program" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.affiliateProgram")}</Link></li>
              <li><Link to="/articles" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.articles", "Articles")}</Link></li>
              <li><Link to="/blog" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.blog")}</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("labels.support")}</h3>
            <ul className="space-y-2">
              <li><Link to="/help" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.helpCenter")}</Link></li>
              <li><Link to="/contact" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.contactUs")}</Link></li>
              <li><Link to="/about" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.aboutUs")}</Link></li>
              <li><Link to="/careers" className="text-muted-foreground hover:text-foreground transition-colors">{t("labels.careers")}</Link></li>
            </ul>
          </div>

          {/* Audience links — compact (3 roles + see all) for authed users,
              expanded (full grid) for anonymous visitors. Component
              self-gates layout by `variant` so the consumer doesn't pass
              per-audience props. */}
          <AudienceLinks variant={expanded ? "expanded" : "compact"} />

          {/* Locations column — expanded mode only. Anonymous visitors
              (incl. Googlebot) see a curated top-countries grid + a link
              to /sitemap/locations for the full tree. Per the
              Indeed/ZipRecruiter SEO playbook (#1628). */}
          {expanded ? <LocationsSitemap variant="footer-grid" /> : null}
        </div>

        {/* Bottom Section */}
        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row md:px-4 justify-between items-center gap-4">
          <div className="mb-4 md:mb-0">
            <Copyright />
            <p className="text-xs text-muted-foreground mt-1">
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
