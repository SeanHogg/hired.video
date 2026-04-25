// SellHub — the unified earning hub at /search.
// Tabs across the three monetization surfaces: voice clones, services,
// and creator promo videos. Each tab shows a live browse list pulled
// from its respective marketplace API. The component is auth-agnostic
// so unauthenticated visitors can browse and buy.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Mic,
  Briefcase,
  Sparkles,
  ArrowRight,
  Star,
  DollarSign,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type VoiceListing = {
  id: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  language?: string | null;
  gender?: string | null;
  priceCents?: number | null;
  previewAudioUrl?: string | null;
  creatorName?: string | null;
};

type CreatorListing = {
  creator: {
    userId: string;
    displayName?: string | null;
    tagline?: string | null;
    averageRating?: number | null;
    completedProjectsCount?: number | null;
    defaultPriceCents?: number | null;
    categories?: string[] | null;
  };
  user: { id: string; name?: string | null };
  profile?: { avatarUrl?: string | null; headline?: string | null } | null;
};

function formatPrice(cents?: number | null): string {
  if (cents == null) return "Contact";
  return `$${(cents / 100).toFixed(2)}`;
}

function useApi<T>(url: string): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData(json?.data ?? json);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ message, ctaTo, ctaLabel }: { message: string; ctaTo: string; ctaLabel: string }) {
  return (
    <Card className="p-6 text-center border-dashed">
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      <Link to={ctaTo}>
        <Button variant="outline" size="sm">{ctaLabel}</Button>
      </Link>
    </Card>
  );
}

function VoicesTab() {
  const { data, loading, error } = useApi<VoiceListing[]>(
    "/api/studio/voice-clones/marketplace?limit=12&sort=popular",
  );

  if (loading) return <Skeleton />;
  if (error) return <p className="text-sm text-destructive">Couldn't load voices: {error}</p>;
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) {
    return <EmptyState
      message="No voice clones listed yet. Be the first to record one and earn 95% on every sale."
      ctaTo="/studio?tab=voice-clones"
      ctaLabel="Create a voice clone"
    />;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.slice(0, 9).map((v) => (
          <Card key={v.id} className="p-4 hover:border-primary/40 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-semibold text-sm leading-tight">{v.name ?? v.title ?? "Voice clone"}</h4>
              <Badge variant="secondary" className="shrink-0 text-xs">{formatPrice(v.priceCents)}</Badge>
            </div>
            {v.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{v.description}</p>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {v.language && <span>{v.language}</span>}
              {v.gender && <span>· {v.gender}</span>}
              {v.creatorName && <span>· by {v.creatorName}</span>}
            </div>
            {v.previewAudioUrl && (
              <audio src={v.previewAudioUrl} controls preload="none" className="w-full h-8 mt-2" />
            )}
          </Card>
        ))}
      </div>
      <div className="text-center mt-4">
        <Link to="/search?category=voices" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
          Browse all voice clones <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </>
  );
}

function CreatorsTab() {
  const { data, loading, error } = useApi<CreatorListing[]>("/api/creators/browse?limit=9");

  if (loading) return <Skeleton />;
  if (error) return <p className="text-sm text-destructive">Couldn't load creators: {error}</p>;
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) {
    return <EmptyState
      message="No creators yet. Make videos for paying clients — set your own rates and earn 95%."
      ctaTo="/creators/dashboard"
      ctaLabel="Become a creator"
    />;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((c) => (
          <Link
            key={c.user.id}
            to={`/creators/${c.user.id}`}
            className="block"
          >
            <Card className="p-4 hover:border-primary/40 transition-colors h-full">
              <div className="flex items-start gap-3 mb-2">
                {c.profile?.avatarUrl ? (
                  <img src={c.profile.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                    {(c.creator.displayName ?? c.user.name ?? "?")[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm leading-tight truncate">{c.creator.displayName ?? c.user.name}</h4>
                  {c.creator.tagline && <p className="text-xs text-muted-foreground line-clamp-1">{c.creator.tagline}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                {c.creator.averageRating != null && c.creator.averageRating > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {Number(c.creator.averageRating).toFixed(1)}
                  </span>
                )}
                {c.creator.completedProjectsCount ? <span>· {c.creator.completedProjectsCount} done</span> : null}
                {c.creator.defaultPriceCents != null && (
                  <span className="ml-auto font-medium text-foreground">from {formatPrice(c.creator.defaultPriceCents)}</span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <div className="text-center mt-4">
        <Link to="/creators" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
          Browse all creators <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </>
  );
}

function ServicesTab() {
  return (
    <Card className="p-6 text-center border-dashed">
      <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground mb-1">Career services — resume reviews, coaching, video editing</p>
      <p className="text-xs text-muted-foreground mb-3">Listings show on each provider's profile. Browse providers first, then view what they offer.</p>
      <div className="flex items-center justify-center gap-2">
        <Link to="/people"><Button variant="outline" size="sm">Browse providers</Button></Link>
        <Link to="/services"><Button size="sm">Sell services</Button></Link>
      </div>
    </Card>
  );
}

export default function SellHub() {
  const [tab, setTab] = useState<string>("voices");

  return (
    <section className="max-w-6xl mx-auto px-4 pt-8 pb-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <DollarSign className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Sell Hub</h2>
          <p className="text-sm text-muted-foreground">
            Browse what others are selling, or list your own. 95% of every sale goes to the creator.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-grid">
          <TabsTrigger value="voices" className="gap-1.5"><Mic className="h-3.5 w-3.5" />Voices</TabsTrigger>
          <TabsTrigger value="creators" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Creators</TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />Services</TabsTrigger>
        </TabsList>

        <TabsContent value="voices" className="mt-4"><VoicesTab /></TabsContent>
        <TabsContent value="creators" className="mt-4"><CreatorsTab /></TabsContent>
        <TabsContent value="services" className="mt-4"><ServicesTab /></TabsContent>
      </Tabs>
    </section>
  );
}
