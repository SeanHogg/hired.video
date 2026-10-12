/**
 * CreatorPromoCard — the reusable "Generate & Get Paid" creator promo.
 *
 * One component, two shapes:
 *   • variant="hero"   — full-width marketplace header (the MarketplaceHero block).
 *   • variant="result" — a single grid cell that wears the SAME chrome as the
 *                        real search-result cards (BaseCard + header/icon/badge,
 *                        the promo art as media, and a CardActions footer). Drop
 *                        it into the /search results grid and it reads as one of
 *                        the cards instead of an out-of-place sidebar ad.
 *
 * Extracted from MarketplaceHero so the hero block and the in-grid promo share
 * one source of truth (copy, CTAs, links) instead of drifting (DRY).
 */
import { Sparkles, Store } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { CardActions } from "@/components/ui/CardActions";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import { cn } from "@/lib/utils";
import CreatorPromoArt from "./CreatorPromoArt";

interface Props {
  variant?: "hero" | "result";
  className?: string;
}

const PRIMARY = { to: "/studio", label: "Become a Creator" };
const SECONDARY = { to: "/pricing", label: "See Creator Split" };

export default function CreatorPromoCard({ variant = "hero", className }: Props) {
  const navigate = useNavigate();

  if (variant === "result") {
    // Mirrors ContentCard's structure so the promo sits flush in the results
    // grid: primary CTA is the visible footer button, the split link folds into
    // the ⋯ overflow exactly like every other card's secondary actions.
    const cardActions: DynamicCardAction[] = [
      {
        id: "become-creator",
        label: PRIMARY.label,
        icon: Sparkles,
        onClick: () => navigate(PRIMARY.to),
      },
      {
        id: "creator-split",
        label: SECONDARY.label,
        variant: "secondary",
        onClick: () => navigate(SECONDARY.to),
      },
    ];

    return (
      <BaseCard className={cn("flex flex-col h-full", className)}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 flex-shrink-0">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <Badge variant="outline" className="mb-1">
                Marketplace
              </Badge>
              <CardTitle className="text-base leading-snug line-clamp-2">
                Generate &amp; Get Paid
              </CardTitle>
            </div>
          </div>
          <CardDescription className="pt-2 line-clamp-3">
            Publish templates, voices, and services — and keep 95% of every sale.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-auto">
          <CreatorPromoArt className="w-full rounded-lg" />
        </CardContent>
        <CardActions actions={cardActions} />
      </BaseCard>
    );
  }

  // hero
  return (
    <section className={cn("border-b bg-muted/30", className)}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Store className="w-5 h-5 text-primary" />
              <Badge variant="secondary">Marketplace</Badge>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">Generate &amp; Get Paid</h1>
            <p className="text-muted-foreground max-w-2xl">
              Browse templates, voices, and services from creators on hired.video — or publish your
              own and earn. Every asset plugs into the resume and studio tools you already use.
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              <Button asChild>
                <Link to={PRIMARY.to}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {PRIMARY.label}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={SECONDARY.to}>{SECONDARY.label}</Link>
              </Button>
            </div>
          </div>
          <CreatorPromoArt className="hidden lg:block w-64 h-auto rounded-2xl shadow-lg" />
        </div>
      </div>
    </section>
  );
}
