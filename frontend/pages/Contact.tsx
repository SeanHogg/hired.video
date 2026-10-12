import { Mail, MessageCircle, Clock, ArrowRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { TIER_NAME } from "@shared/tier-copy";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { AppShell } from "@/components/AppShell";
import IconCard from "@/components/marketing/IconCard";
import { MarketingHero, HERO_CTA_PRIMARY, HERO_CTA_LINK } from "@/components/marketing/MarketingHero";
import { ContactForm } from "@/components/contact/ContactForm";
import { useAI } from "@/lib/ai-context";

const FAQ_COUNT = 4;

const CARD_ACTION =
  "inline-flex min-h-[44px] items-center gap-2 self-start font-semibold text-primary hover:underline";

export default function Contact() {
  const location = useLocation();
  const { t } = useTranslation();
  // SEO for contact page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.contactUs"), url: "/contact" }]);

  const { openAIChat } = useAI();

  const contactInfo = [
    {
      key: "email",
      icon: Mail,
      value: "info@hired.video",
      action: (
        <a href="mailto:info@hired.video" className={CARD_ACTION}>
          {t("contactPage.email.action")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      ),
    },
    {
      key: "chat",
      icon: MessageCircle,
      value: t("contactPage.chat.value"),
      action: (
        <button type="button" onClick={openAIChat} className={CARD_ACTION}>
          {t("contactPage.chat.action")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ),
    },
    {
      key: "response",
      icon: Clock,
      value: t("contactPage.response.value"),
      action: null,
    },
  ];

  const tiers = { free: TIER_NAME.free, pro: TIER_NAME.pro };
  const faqs = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    question: t(`contactPage.faq${i + 1}Q`, tiers),
    answer: t(`contactPage.faq${i + 1}A`, tiers),
  }));

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          eyebrow={t("labels.contactUs")}
          title={t("contactPage.hero.title")}
          subtitle={t("contactPage.hero.subtitle")}
          actions={
            <>
              <a href="#contact-form" className={HERO_CTA_PRIMARY}>
                {t("contactPage.form.title")}
              </a>
              <a href="mailto:info@hired.video" className={HERO_CTA_LINK}>
                info@hired.video
              </a>
            </>
          }
        />

        <MarketingBand tone="card" labelledBy="contact-ways-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro id="contact-ways-heading" title={t("contactPage.ways.title")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
            {contactInfo.map((info) => (
              <IconCard
                key={info.key}
                icon={info.icon}
                title={t(`contactPage.${info.key}.title`)}
                body={t(`contactPage.${info.key}.description`)}
              >
                <p className="font-mono text-base font-semibold text-foreground">{info.value}</p>
                {info.action}
              </IconCard>
            ))}
          </div>
        </MarketingBand>

        <MarketingBand id="contact-form" labelledBy="contact-form-heading" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="contact-form-heading"
            title={t("contactPage.form.title")}
            subtitle={t("contactPage.form.subtitle")}
          />
          <div className="w-full max-w-[760px] rounded-[20px] border border-border bg-card p-6">
            <ContactForm idPrefix="contact-page" />
          </div>
        </MarketingBand>

        {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
        <MarketingFAQ variant="plain" schemaId="contact" items={faqs} />
      </main>
    </AppShell>
  );
}
