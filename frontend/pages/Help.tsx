import { ArrowRight, BookOpen, SearchX } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useHelpContent } from "@/lib/help/use-help-content";
import Markdown from "@/components/Markdown";
import TextNarrator from "@/components/audio/TextNarrator";
import { textFromFAQ } from "@/lib/audio/narrator-text";
import ContentHero from "@/components/content/ContentHero";
import { CONTENT_CARD, ICON_TILE, INDEX_COLUMN, PROSE_CLASS } from "@/components/content/content-ui";
import HelpContactPanel from "@/components/help/HelpContactPanel";
import { MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { cn } from "@/lib/utils";

export default function Help() {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("headings.help.helpAndSupport"), url: "/help" }]);
  // Gate at 2 chars so single-keystroke ?q=A doesn't narrow the FAQ
  // list to noise — Help renders the full catalogue until the query is
  // meaningful.
  const { effective: searchQuery } = useSearchQueryParam();

  // FAQs + guides come from the lazily-loaded bundled content catalog
  // (locale-resolved, EN fallback) — ZERO DB, zero fetch (#2074/#2075).
  // Grouped by category for the accordion.
  const help = useHelpContent();
  const faqs = useMemo(() => {
    if (!help) return [];
    const byCat = new Map<string, { category: string; questions: { question: string; answer: string; slug: string }[] }>();
    for (const item of help.listHelpItems(i18n.language, { kind: "faq" })) {
      const group = byCat.get(item.category) ?? { category: item.category, questions: [] };
      group.questions.push({ question: item.title, answer: item.body, slug: item.slug });
      byCat.set(item.category, group);
    }
    return [...byCat.values()];
  }, [help, i18n.language]);

  const guides = useMemo(
    () => (help ? help.listHelpItems(i18n.language, { kind: "guide" }) : []),
    [help, i18n.language],
  );

  // Inject FAQPage JSON-LD for all visible Q&As
  const faqSchema = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.flatMap((cat) =>
      cat.questions.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: { "@type": "Answer", text: q.answer },
      })),
    ),
  }), [faqs]);

  useEffect(() => {
    const scriptId = "help-faq-jsonld";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(faqSchema);
    return () => { document.getElementById(scriptId)?.remove(); };
  }, [faqSchema]);

  const filteredFaqs = faqs
    .map((category) => ({
      ...category,
      questions: category.questions.filter(
        (q) =>
          searchQuery === "" ||
          q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.answer.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((category) => category.questions.length > 0);

  return (
    <AppShell bgClassName="bg-background">
      <main className="pb-[72px]">
        <ContentHero
          eyebrow={t("headings.help.helpAndSupport")}
          title={t("headings.help.howCanWeHelp")}
          lede={t("messages.help.intro")}
        />

        <div className={cn(INDEX_COLUMN, "flex flex-col gap-6")}>
          {/* Active search query indicator */}
          {searchQuery && (
            <p className="font-mono text-xs uppercase text-muted-foreground" aria-live="polite">
              {t("messages.help.showingResultsPrefix")} &quot;{searchQuery}&quot;{" "}
              {t("messages.help.showingResultsSuffix")}
            </p>
          )}

          <Tabs defaultValue="faq" className="flex flex-col gap-8">
            <TabsList className="self-start">
              <TabsTrigger value="faq" className="min-h-[36px] px-4">{t("labels.help.tabFaq")}</TabsTrigger>
              <TabsTrigger value="guides" className="min-h-[36px] px-4">{t("labels.help.tabGuides")}</TabsTrigger>
              <TabsTrigger value="contact" className="min-h-[36px] px-4">{t("labels.help.tabContact")}</TabsTrigger>
            </TabsList>

            {/* FAQ Tab */}
            <TabsContent value="faq" className="mt-0 flex flex-col gap-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <MarketingSectionIntro title={t("headings.help.faq")} subtitle={t("messages.help.faq")} />
                {/* Listen to every visible Q&A. Self-gates: returns null
                    when no FAQs match the active search. */}
                <TextNarrator
                  text={textFromFAQ(filteredFaqs.flatMap((c) => c.questions))}
                  preferenceKey={`help.faq${searchQuery ? `.${searchQuery}` : ""}`}
                  label={t("labels.help.listenToFaqs")}
                />
              </div>

              {filteredFaqs.length > 0 ? (
                <div className="flex flex-col gap-5">
                  {filteredFaqs.map((category, categoryIndex) => (
                    <section key={category.category} className={cn(CONTENT_CARD, "px-6 pb-2 pt-5")}>
                      <MonoChip>{category.category}</MonoChip>
                      <Accordion type="single" collapsible className="mt-2 w-full">
                        {category.questions.map((faq, faqIndex) => (
                          <AccordionItem key={faq.slug} value={`${categoryIndex}-${faqIndex}`} className="last:border-b-0">
                            <AccordionTrigger className="text-left text-base font-semibold">
                              {faq.question}
                            </AccordionTrigger>
                            <AccordionContent>
                              <Markdown className={PROSE_CLASS}>{faq.answer}</Markdown>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
                  <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <p className="font-medium text-foreground">{t("headings.help.noResults")}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{t("messages.help.noResults")}</p>
                </div>
              )}
            </TabsContent>

            {/* Guides Tab */}
            <TabsContent value="guides" className="mt-0 flex flex-col gap-6">
              <MarketingSectionIntro title={t("headings.help.helpfulGuides")} subtitle={t("messages.help.helpfulGuides")} />
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-5">
                {guides.map((guide) => (
                  <li key={guide.slug} className="flex">
                    <Link
                      to={`/help/${guide.slug}`}
                      className={cn(CONTENT_CARD, "group flex w-full gap-4 p-6 transition-colors hover:border-primary/50")}
                    >
                      <span className={ICON_TILE}>
                        <BookOpen className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="text-[17px] font-semibold leading-snug text-foreground group-hover:text-primary">
                          {guide.title}
                        </span>
                        <span className="line-clamp-3 text-sm text-muted-foreground">{guide.summary}</span>
                        <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                          {t("actions.help.readGuide")}
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </TabsContent>

            {/* Contact Tab */}
            <TabsContent value="contact" className="mt-0 flex flex-col gap-6">
              <MarketingSectionIntro title={t("headings.help.getInTouch")} subtitle={t("messages.help.getInTouch")} />
              <HelpContactPanel />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </AppShell>
  );
}
