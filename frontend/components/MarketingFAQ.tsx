import { useEffect, useMemo } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";
import TextNarrator from "@/components/audio/TextNarrator";
import { textFromFAQ } from "@/lib/audio/narrator-text";

export interface MarketingFAQItem {
  question: string;
  answer: string;
}

interface MarketingFAQProps {
  heading?: string;
  subheading?: string;
  items: MarketingFAQItem[];
  /** Stable id used as the schema script element id — must be unique per page. */
  schemaId: string;
  className?: string;
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
  heading = "Frequently Asked Questions",
  subheading,
  items,
  schemaId,
  className,
}: MarketingFAQProps) {
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

  return (
    <section className={className ?? "py-16 px-4 sm:px-6 lg:px-8"}>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3 text-primary">
            <HelpCircle className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              FAQ
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">{heading}</h2>
          {subheading && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {subheading}
            </p>
          )}
        </div>

        {/* Audio modality — narrate every Q&A in order. Self-gates: the
            narrator returns null when speechSynthesis isn't available
            or the items list is empty. */}
        <TextNarrator
          text={textFromFAQ(items)}
          preferenceKey={`faq.${schemaId}`}
          compact
          className="mb-6"
        />

        <Accordion type="single" collapsible className="w-full">
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
      </div>
    </section>
  );
}
