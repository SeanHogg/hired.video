// My Wishlist — the saved-items surface backed by the caller's canonical
// wishlist list. Type-agnostic: a per-type registry drives a tab for every
// enrichable marketplace entity (courses, voices today). Each tab self-hides
// when empty; heart toggles anywhere keep this in sync via the shared
// react-query cache (see useWishlist). Removing an item is the card's own
// heart toggle — no separate affordance needed here.

import type { ComponentType } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Loader2, GraduationCap, Mic, ArrowRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { AppEmptyState } from "@/components/app/AppEmptyState";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CourseMarketplaceCard, {
  type CourseMarketplaceItem,
} from "@/components/CourseMarketplaceCard";
import VoiceMarketplaceCard, {
  type VoiceMarketplaceCardItem,
} from "@/components/VoiceMarketplaceCard";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { listsService, type ListEntityType } from "@/lib/services/lists-service";

// Registry — one entry per enrichable wishlist type. Add a type by adding a
// row here (+ its server enricher + card). The grid + empty/loading states are
// shared, so a new type is ~6 lines. Pure: holds an i18n key (not a literal)
// per the localization rule, plus the marketplace route its browse-CTA points
// to and the icon shown in tabs/empty state.
interface WishlistTypeDef<T> {
  type: ListEntityType;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  browseHref: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card: ComponentType<{ item: any }>;
  getKey: (item: T) => string;
}

const COURSE_DEF: WishlistTypeDef<CourseMarketplaceItem> = {
  type: "course",
  labelKey: "search.category.courses",
  icon: GraduationCap,
  browseHref: "/search?category=courses",
  Card: CourseMarketplaceCard,
  getKey: (c) => c.id,
};
const VOICE_DEF: WishlistTypeDef<VoiceMarketplaceCardItem> = {
  type: "voice_clone",
  labelKey: "search.category.voices",
  icon: Mic,
  browseHref: "/search?category=voices",
  Card: VoiceMarketplaceCard,
  getKey: (v) => v.id,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WISHLIST_TYPES: WishlistTypeDef<any>[] = [COURSE_DEF, VOICE_DEF];

export default function Wishlist() {
  useSEO("/wishlist");
  useBreadcrumbs([{ name: "Wishlist", url: "/wishlist" }]);
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const results = useQueries({
    queries: WISHLIST_TYPES.map((def) => ({
      queryKey: ["wishlist", "enriched", def.type],
      queryFn: () => listsService.wishlistEnriched(def.type),
      enabled: isAuthenticated,
    })),
  });

  if (!isAuthenticated) {
    return <Navigate to="/login?returnTo=/wishlist" replace />;
  }

  const isLoading = results.some((r) => r.isLoading);
  const tabs = WISHLIST_TYPES.map((def, i) => ({
    def,
    items: results[i].data ?? [],
  }));
  const nonEmpty = tabs.filter((t) => t.items.length > 0);
  const totalCount = tabs.reduce((sum, t) => sum + t.items.length, 0);
  const defaultTab = nonEmpty[0]?.def.type ?? WISHLIST_TYPES[0].type;

  return (
    <AppShell bgClassName="bg-background">
      <main className={APP_PAGE_COLUMN}>
        <PageHeader
          title={t("wishlist.title")}
          description={t("wishlist.subtitle")}
          actions={
            !isLoading && totalCount > 0 ? (
              <Badge variant="secondary" className="rounded-full">
                {t("wishlist.itemCount", { count: totalCount })}
              </Badge>
            ) : undefined
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : nonEmpty.length === 0 ? (
          <AppEmptyState
            icon={Heart}
            title={t("wishlist.empty.title")}
            description={t("wishlist.empty.body")}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {WISHLIST_TYPES.map((def, i) => (
                  <Button key={def.type} asChild variant={i === 0 ? "default" : "ghost"}>
                    <Link to={def.browseHref}>
                      <DefIcon def={def} className="h-4 w-4 mr-2" />
                      {t("wishlist.empty.browse", { type: t(def.labelKey) })}
                    </Link>
                  </Button>
                ))}
              </div>
            }
          />
        ) : nonEmpty.length === 1 ? (
          // Single populated type — no need for a tab strip, just a header row
          // with the count and a "browse more" link back to the marketplace.
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <DefIcon def={nonEmpty[0].def} className="h-4 w-4 text-muted-foreground" />
                {t(nonEmpty[0].def.labelKey)}
                <span className="text-sm font-normal text-muted-foreground">
                  {nonEmpty[0].items.length}
                </span>
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link to={nonEmpty[0].def.browseHref}>
                  {t("wishlist.browseMore")}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
            <WishlistGrid def={nonEmpty[0].def} items={nonEmpty[0].items} />
          </div>
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList>
              {nonEmpty.map(({ def, items }) => (
                <TabsTrigger key={def.type} value={def.type} className="gap-1.5">
                  <DefIcon def={def} className="h-4 w-4" />
                  {t(def.labelKey)}
                  <span className="ml-0.5 text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {nonEmpty.map(({ def, items }) => (
              <TabsContent key={def.type} value={def.type} className="mt-4">
                <div className="flex justify-end mb-3">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={def.browseHref}>
                      {t("wishlist.browseMore")}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
                <WishlistGrid def={def} items={items} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>
    </AppShell>
  );
}

// Renders a type's registry icon — keeps the icon-component indirection out of
// JSX expression positions where a statement isn't allowed.
function DefIcon({
  def,
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: WishlistTypeDef<any>;
  className?: string;
}) {
  const Icon = def.icon;
  return <Icon className={className} />;
}

function WishlistGrid({
  def,
  items,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: WishlistTypeDef<any>;
  items: unknown[];
}) {
  const { Card, getKey } = def;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {items.map((item) => (
        <Card key={getKey(item)} item={item} />
      ))}
    </div>
  );
}
