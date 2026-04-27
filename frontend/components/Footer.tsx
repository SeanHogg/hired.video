import { Video, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Copyright from "./Copyright";
import LegalLinks from "./LegalLinks";
import { runtimeConfig } from "@/lib/runtime-config";

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-background border-t border-border">
      <div id="footer-wrapper" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="md:col-span-2">
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

          {/* Quick Links — labels live under chrome.labels.* so Footer and
              Nav share a single canonical name per route. */}
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
        </div>

        {/* Bottom Section */}
        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <Copyright />
            <p className="text-xs text-muted-foreground mt-1">
              {t("footer.build", { build: runtimeConfig.build })}
            </p>
          </div>
          <LegalLinks />
        </div>
      </div>
    </footer>
  );
}
