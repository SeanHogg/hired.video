/**
 * CreatorPromoCard — the reusable "Generate & Get Paid" creator promo.
 *
 * One component, two shapes:
 *   • variant="hero"   — full-width marketplace header (the /search top block).
 *   • variant="banner" — compact, graphic-led card for a side column / sticky
 *                        rail. Use as a "banner ad" anywhere a sidebar exists.
 *
 * Extracted from MarketplaceHero so the hero block and the sidebar ad share
 * one source of truth (copy, CTAs, links) instead of drifting (DRY).
 */
import { Sparkles, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import CreatorPromoArt from "./CreatorPromoArt";

interface Props {
  variant?: "hero" | "banner";
  className?: string;
}

const PRIMARY = { to: "/studio", label: "Become a Creator" };
const SECONDARY = { to: "/pricing", label: "See Creator Split" };

export default function CreatorPromoCard({ variant = "hero", className }: Props) {
  if (variant === "banner") {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CreatorPromoArt className="w-full" />
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            <Badge variant="secondary">Marketplace</Badge>
          </div>
          <div>
            <h3 className="text-lg font-bold leading-tight">Generate &amp; Get Paid</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Publish templates, voices, and services — and keep 95% of every sale.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link to={PRIMARY.to}>
                <Sparkles className="mr-2 h-4 w-4" />
                {PRIMARY.label}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to={SECONDARY.to}>{SECONDARY.label}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
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
