// /pricing B2B support band ("Talk to us", demo, non-profit pricing). Every
// CTA opens the shared <ContactPanel> slide-out so inquiries land in
// marketing_leads + notify every super_admin. Hiring-persona only.

import { useTranslation } from "react-i18next";
import { Heart, MessageCircle, Play } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import IconCard from "@/components/marketing/IconCard";
import { Button } from "@/components/ui/button";
import { useContactPanel } from "@/components/ContactPanel";

export default function PricingSupportCards() {
  const { t } = useTranslation();
  const { openContactPanel } = useContactPanel();

  const cards = [
    {
      key: "info",
      icon: MessageCircle,
      title: t("marketing.pricing.support.infoTitle"),
      body: t("marketing.pricing.support.infoBody"),
      action: t("marketing.pricing.support.talkToUs"),
      onClick: () =>
        openContactPanel({
          inquiryType: "sales",
          title: t("messages.pricing.contact.salesTitle"),
          description: t("messages.pricing.contact.salesDescription"),
        }),
    },
    {
      key: "demo",
      icon: Play,
      title: t("marketing.pricing.support.demoTitle"),
      body: t("marketing.pricing.support.demoBody"),
      action: t("marketing.pricing.support.requestDemo"),
      onClick: () => openContactPanel({ inquiryType: "demo", subjectLocked: true }),
    },
    {
      key: "startup",
      icon: Heart,
      title: t("marketing.pricing.support.startupTitle"),
      body: t("marketing.pricing.support.startupBody"),
      action: t("marketing.pricing.support.contactReduced"),
      onClick: () =>
        openContactPanel({
          inquiryType: "nonprofit_discount",
          subjectLocked: true,
          prefillMessage: t("messages.pricing.contact.nonprofitPrefill"),
        }),
    },
  ];

  return (
    <MarketingBand labelledBy="pricing-support-heading" className="flex flex-col gap-8">
      <MarketingSectionIntro id="pricing-support-heading" title={t("pricing.support.title")} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
        {cards.map((c) => (
          <IconCard key={c.key} icon={c.icon} title={c.title} body={c.body}>
            <Button variant="outline" size="lg" className="mt-auto self-start" onClick={c.onClick}>
              {c.action}
            </Button>
          </IconCard>
        ))}
      </div>
    </MarketingBand>
  );
}
