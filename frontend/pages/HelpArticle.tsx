/**
 * HelpArticle — renders one bundled help item at /help/:slug.
 *
 * Content of record is the bundled Markdown catalog (`lib/help/content.ts`),
 * resolved to the active locale with EN fallback — ZERO DB, zero fetch. The
 * HelpDrawer + /help cards + search all deep-link here.
 */

import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import Markdown from "@/components/Markdown";
import TextNarrator from "@/components/audio/TextNarrator";
import { ReadingBackLink, ReadingHeader } from "@/components/content/ReadingLayout";
import { PROSE_CLASS, READING_COLUMN } from "@/components/content/content-ui";
import { HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useHelpContent } from "@/lib/help/use-help-content";
import { helpKindIcon } from "@/lib/help/kind-icon";
import { cn } from "@/lib/utils";

export default function HelpArticle(): JSX.Element {
  const { slug = "" } = useParams();
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  const help = useHelpContent();
  const item = help ? help.getHelpItem(slug, i18n.language) : null;

  useSEO(pathname);
  useBreadcrumbs([
    { name: t("headings.help.helpAndSupport"), url: "/help" },
    { name: item?.title ?? t("headings.help.notFound"), url: pathname },
  ]);

  // Catalog still loading — show a spinner, not the not-found state.
  if (!help) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex items-center justify-center py-24 text-muted-foreground" role="status">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell bgClassName="bg-background">
        <div className={cn(READING_COLUMN, "flex flex-col items-center gap-3 py-20 text-center")}>
          <h1 className="font-display text-[clamp(28px,3.4vw,40px)] font-bold tracking-[-0.03em] text-foreground">
            {t("headings.help.notFound")}
          </h1>
          <p className="text-muted-foreground">{t("messages.help.notFound")}</p>
          <Link to="/help" className={cn(HERO_CTA_PRIMARY, "mt-3")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("actions.help.backToHelp")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const Icon = helpKindIcon(item.kind);

  return (
    <AppShell bgClassName="bg-background">
      <article className={cn(READING_COLUMN, "flex flex-col gap-8 pb-[72px] pt-6")}>
        <ReadingBackLink to="/help">{t("actions.help.backToHelp")}</ReadingBackLink>

        <ReadingHeader
          eyebrow={
            <>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.kind === "guide" ? `${item.category} · ${t("helpArticle.kindGuide")}` : item.category}
            </>
          }
          title={item.title}
          lede={item.summary}
        >
          <TextNarrator
            text={`${item.title}. ${item.summary}\n\n${item.body}`}
            preferenceKey={`help.${item.slug}`}
          />
        </ReadingHeader>

        <Markdown className={PROSE_CLASS}>{item.body}</Markdown>
      </article>
    </AppShell>
  );
}
