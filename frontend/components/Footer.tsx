import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { runtimeConfig } from "@/lib/runtime-config";
import { getCopyrightString } from "@/lib/utils/date";
import BuiltWithBuilderForce from "@/components/BuiltWithBuilderForce";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";

/**
 * Site footer (SiteFooter mockup): one quiet row on the page background —
 * mono copyright + "Built with BuilderForce.ai" on the left, plain links on
 * the right. The build id rides
 * along as the copyright's tooltip for support/debugging.
 */
const FOOTER_LINKS = [
  { to: "/templates", labelKey: "nav.links.templates" },
  { to: "/rewards", labelKey: "labels.rewards" },
  { to: "/pricing", labelKey: "labels.pricing" },
  { to: "/chrome-extension", labelKey: "footer.links.chromeExtension" },
  { to: "/services?wizard=open", labelKey: "footer.links.sellTemplates" },
  { to: "/help", labelKey: "footer.links.help" },
  { to: "/privacy", labelKey: "labels.privacy" },
  { to: "/terms", labelKey: "footer.links.terms" },
] as const;

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-background text-muted-foreground">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 pb-10 pt-8 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span
            className="font-mono text-xs"
            title={t("footer.build", { build: runtimeConfig.build })}
          >
            {getCopyrightString("hired.video")}
          </span>
          <BuiltWithBuilderForce />
        </div>
        <div className="flex flex-wrap items-center gap-x-6">
          <nav aria-label={t("footer.navLabel")}>
            <ul className="flex flex-wrap gap-x-6">
              {FOOTER_LINKS.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="inline-flex min-h-[44px] items-center text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                  >
                    {t(l.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <LocaleSwitcher variant="labeled" className="h-11" />
        </div>
      </div>
    </footer>
  );
}
