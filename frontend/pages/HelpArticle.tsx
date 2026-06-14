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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import TextNarrator from "@/components/audio/TextNarrator";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useHelpContent } from "@/lib/help/use-help-content";
import { helpKindIcon } from "@/lib/help/kind-icon";

export default function HelpArticle(): JSX.Element {
  const { slug = "" } = useParams();
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  const help = useHelpContent();
  const item = help ? help.getHelpItem(slug, i18n.language) : null;

  useSEO(pathname);
  useBreadcrumbs([
    { name: t("headings.help.helpAndSupport", "Help & Support"), url: "/help" },
    { name: item?.title ?? t("headings.help.notFound", "Not found"), url: pathname },
  ]);

  // Catalog still loading — show a spinner, not the not-found state.
  if (!help) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-2">
            {t("headings.help.notFound", "Help article not found")}
          </h1>
          <p className="text-muted-foreground mb-6">
            {t("messages.help.notFound", "This help article doesn't exist or has moved.")}
          </p>
          <Button asChild>
            <Link to="/help">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("actions.help.backToHelp", "Back to Help Center")}
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const Icon = helpKindIcon(item.kind);

  return (
    <AppShell bgClassName="bg-background">
      <article className="container mx-auto max-w-2xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 gap-2">
          <Link to="/help">
            <ArrowLeft className="h-4 w-4" />
            {t("actions.help.backToHelp", "Back to Help Center")}
          </Link>
        </Button>

        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span>{item.category}</span>
          {item.kind === "guide" && (
            <Badge variant="secondary" className="text-[10px] uppercase">
              guide
            </Badge>
          )}
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-2">{item.title}</h1>
        {item.summary && <p className="text-lg text-muted-foreground mb-4">{item.summary}</p>}

        <div className="mb-6">
          <TextNarrator
            text={`${item.title}. ${item.summary}\n\n${item.body}`}
            preferenceKey={`help.${item.slug}`}
          />
        </div>

        <Markdown className="prose dark:prose-invert max-w-none">{item.body}</Markdown>
      </article>
    </AppShell>
  );
}
