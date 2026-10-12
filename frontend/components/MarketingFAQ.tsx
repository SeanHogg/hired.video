import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";
import TextNarrator from "@/components/audio/TextNarrator";
import { textFromFAQ } from "@/lib/audio/narrator-text";
import type { MarketingFAQItem } from "@/lib/landing/marketing-faq";

interface MarketingFAQProps {
  heading?: string;
  subheading?: string;
  items: MarketingFAQItem[];
  /** Stable id used as the schema script element id — must be unique per page. */
  schemaId: string;
  className?: string;
  /** "default" = centred block with FAQ eyebrow + narrator; "plain" = the
   *  left-aligned "Questions" list used by the job-seeker marketing pages. */
  variant?: "default" | "plain";
  /** Index of the item that starts expanded (none by default). */
  defaultOpenIndex?: number;
}

/**
 * Shared marketing FAQ block. Renders a Radix accordion and injects a
 * schema.org FAQPage JSON-LD script so each question is eligible for
 * Google / Bing / AI-Overview rich results (GEO).
 *
 * The schema script is keyed on `schemaId` so multiple FAQ blocks on the
 * same page (or consecutive page navigations) cleanly replace each other.
 */
export default function MarketingFAQ({
  heading,
  subheading,
  items,
  schemaId,
  className,
  variant = "default",
  defaultOpenIndex,
}: MarketingFAQProps) {
  const { t } = useTranslation();
  const structuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    }),
    [items],
  );

  useEffect(() => {
    const scriptId = `faq-jsonld-${schemaId}`;
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(structuredData);

    return () => {
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();
    };
  }, [schemaId, structuredData]);

  const accordion = (
    <Accordion
      type="single"
      collapsible
      className="w-full"
      defaultValue={defaultOpenIndex === undefined ? undefined : `faq-${schemaId}-${defaultOpenIndex}`}
    >
      {items.map((item, index) => (
        <AccordionItem key={index} value={`faq-${schemaId}-${index}`}>
          <AccordionTrigger className="text-left text-base font-semibold">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-base leading-relaxed">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  if (variant === "plain") {
    return (
      <section className={className ?? "mx-auto max-w-[820px] px-6 pb-20"}>
        <h2 className="mb-3 font-display text-[clamp(28px,3.2vw,40px)] font-bold tracking-[-0.03em] text-foreground">
          {heading ?? t("marketingFaq.questions")}
        </h2>
        {subheading && <p className="mb-4 text-muted-foreground">{subheading}</p>}
        <div className="border-t border-border">{accordion}</div>
      </section>
    );
  }

  return (
    <section className={className ?? "py-16 px-4 sm:px-6 lg:px-8"}>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3 text-primary">
            <HelpCircle className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {t("marketingFaq.eyebrow")}
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">{heading ?? t("marketingFaq.defaultHeading")}</h2>
          {subheading && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {subheading}
            </p>
          )}
        </div>

        {/* Audio modality — narrate every Q&A in order. Self-gates: the
            narrator returns null when speechSynthesis isn't available
            or the items list is empty. */}
        <div className="flex justify-center mb-6">
          <TextNarrator
            text={textFromFAQ(items)}
            preferenceKey={`faq.${schemaId}`}
            label={t("marketingFaq.listen")}
          />
        </div>

        {accordion}
      </div>
    </section>
  );
}
