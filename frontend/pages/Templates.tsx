/**
 * /templates — browse every template (resume + video) in one place.
 * Tabs / search / industry / sort live in the URL (?tab=video&industry=…&q=…)
 * so any view is shareable. Data: unified template registry via
 * useTemplateBrowse (no page-level fetch logic).
 *
 * Layout follows the Templates mockup: header row (title + Resume|Video
 * switch) → search + sort → industry chips → upload banner → count → grid →
 * creator line.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { useBreadcrumbs, useSEO } from "@/lib/seo";
import BrowseControls, { BrowseTabs } from "@/components/templates-browse/BrowseControls";
import TemplateResults from "@/components/templates-browse/TemplateResults";
import { useTemplateBrowse } from "@/components/templates-browse/use-template-browse";

export default function TemplatesPage() {
  const { t } = useTranslation();
  useSEO("/templates");
  useBreadcrumbs([
    { name: t("marketplaceTemplate.breadcrumb.home"), url: "/" },
    { name: t("marketplaceTemplate.breadcrumb.templates"), url: "/templates" },
  ]);

  const { state, update, industries, results, loading } = useTemplateBrowse();

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-6 pb-[72px] pt-8">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex max-w-[40em] flex-col gap-2.5">
            <h1 className="font-display text-[clamp(36px,4.4vw,56px)] font-bold leading-none tracking-[-0.03em] text-foreground">
              {t("templates.browse.title")}
            </h1>
            <p className="text-[17px] text-muted-foreground">{t("templates.browse.subtitle")}</p>
          </div>
          <BrowseTabs tab={state.tab} onChange={update} />
        </header>

        <BrowseControls state={state} industries={industries} onChange={update} />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent px-[18px] py-4">
          <p className="flex-[1_1_320px] text-[15px] text-accent-foreground">
            {t("templates.browse.uploadBanner")}
          </p>
          <Link
            to={NEW_KIT_PATH}
            className="inline-flex min-h-[44px] items-center rounded-[10px] bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("templates.browse.uploadCta")}
          </Link>
        </div>

        <TemplateResults
          tab={state.tab}
          results={results}
          loading={loading}
          onClear={() => update({ industry: "", q: "" })}
        />

        <p className="mt-2 text-sm text-muted-foreground">
          {t("templates.browse.creatorLine")}{" "}
          <Link to="/services?wizard=open" className="text-primary hover:underline">
            {t("templates.browse.creatorLink")}
          </Link>
        </p>
      </main>
    </AppShell>
  );
}
