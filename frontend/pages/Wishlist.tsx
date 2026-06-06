// My Wishlist — the saved-items surface backed by the caller's canonical
// wishlist list. Type-agnostic: a per-type registry drives a tab for every
// enrichable marketplace entity (courses, voices today). Each tab self-hides
// when empty; heart toggles anywhere keep this in sync via the shared
// react-query cache (see useWishlist).

import type { ComponentType } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { Heart, Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
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
// shared, so a new type is ~4 lines.
interface WishlistTypeDef<T> {
  type: ListEntityType;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card: ComponentType<{ item: any }>;
  getKey: (item: T) => string;
}

const COURSE_DEF: WishlistTypeDef<CourseMarketplaceItem> = {
  type: "course",
  label: "Courses",
  Card: CourseMarketplaceCard,
  getKey: (c) => c.id,
};
const VOICE_DEF: WishlistTypeDef<VoiceMarketplaceCardItem> = {
  type: "voice_clone",
  label: "Voices",
  Card: VoiceMarketplaceCard,
  getKey: (v) => v.id,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WISHLIST_TYPES: WishlistTypeDef<any>[] = [COURSE_DEF, VOICE_DEF];

export default function Wishlist() {
  useSEO("/wishlist");
  useBreadcrumbs([{ name: "Wishlist", url: "/wishlist" }]);
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
  const defaultTab = nonEmpty[0]?.def.type ?? WISHLIST_TYPES[0].type;

  return (
    <AppShell>
      <main className="px-4 sm:px-6 lg:px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Heart className="h-6 w-6 fill-rose-500 text-rose-500" />
          <h1 className="text-2xl font-bold tracking-tight">My Wishlist</h1>
        </div>
        <p className="text-muted-foreground mb-8">
          Things you've saved to come back to.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : nonEmpty.length === 0 ? (
          <div className="text-center py-20 border rounded-xl bg-muted/20">
            <Heart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-4" />
            <h2 className="font-semibold mb-1">Nothing saved yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Tap the heart on any course or voice to save it here.
            </p>
            <Button asChild>
              <Link to="/search?category=courses">Browse the marketplace</Link>
            </Button>
          </div>
        ) : nonEmpty.length === 1 ? (
          // Single populated type — no need for a tab strip.
          <WishlistGrid def={nonEmpty[0].def} items={nonEmpty[0].items} />
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList>
              {nonEmpty.map(({ def, items }) => (
                <TabsTrigger key={def.type} value={def.type}>
                  {def.label}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {nonEmpty.map(({ def, items }) => (
              <TabsContent key={def.type} value={def.type} className="mt-4">
                <WishlistGrid def={def} items={items} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>
    </AppShell>
  );
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
