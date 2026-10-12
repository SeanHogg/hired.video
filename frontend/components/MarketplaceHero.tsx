// /search footer: the creator promo plus one card per marketplace category
// (resume templates, video templates, voices, services, articles). Copy is
// localized under marketplaceHero.*; layout uses the shared marketing band.

import { ArrowRight, FileText, Film, Mic, Newspaper, ShoppingBag, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CreatorPromoCard from "@/components/marketing/CreatorPromoCard";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { CONTENT_CARD, ICON_TILE } from "@/components/content/content-ui";
import { cn } from "@/lib/utils";

interface Category {
  id: "resumeTemplates" | "videoTemplates" | "voices" | "services" | "articles";
  icon: LucideIcon;
  href: string;
  badge: "earnings" | "beta";
}

const CATEGORIES: Category[] = [
  { id: "resumeTemplates", icon: FileText, href: "/templates", badge: "earnings" },
  { id: "videoTemplates", icon: Film, href: "/studio", badge: "earnings" },
  { id: "voices", icon: Mic, href: "/search?category=voices", badge: "earnings" },
  { id: "services", icon: ShoppingBag, href: "/services", badge: "earnings" },
  { id: "articles", icon: Newspaper, href: "/search?category=articles", badge: "beta" },
];

export default function MarketplaceHero() {
  const { t } = useTranslation();
  return (
    <>
      <CreatorPromoCard variant="hero" />

      <MarketingBand tone="card" labelledBy="marketplace-categories" className="flex flex-col gap-8">
        <MarketingSectionIntro
          id="marketplace-categories"
          title={t("marketplaceHero.title")}
          subtitle={t("marketplaceHero.subtitle")}
        />
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <li key={cat.id} className="flex">
                <Link
                  to={cat.href}
                  className={cn(
                    CONTENT_CARD,
                    "group flex w-full flex-col gap-3 bg-background p-6 transition-colors hover:border-primary/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={ICON_TILE}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <MonoChip tone={cat.badge === "earnings" ? "free" : "neutral"}>
                      {t(`marketplaceHero.badge.${cat.badge}`)}
                    </MonoChip>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground group-hover:text-primary">
                    {t(`marketplaceHero.${cat.id}.title`)}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t(`marketplaceHero.${cat.id}.body`)}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-primary">
                    {t(`marketplaceHero.${cat.id}.cta`)}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </MarketingBand>
    </>
  );
}
