// CreatorsBrowse — public browse page at /creators.
// Lists active, verified creators, sorted by rating (server-side).
// Anonymous visitors can browse and click into a creator's public profile.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, ArrowRight, Sparkles } from "lucide-react";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSidebar } from "@/hooks/use-sidebar";

type Creator = {
  creator: {
    userId: string;
    displayName?: string | null;
    tagline?: string | null;
    bio?: string | null;
    averageRating?: number | null;
    completedProjectsCount?: number | null;
    defaultPriceCents?: number | null;
    averageDeliveryDays?: number | null;
    categories?: string[] | null;
  };
  user: { id: string; name?: string | null };
  profile?: { avatarUrl?: string | null; headline?: string | null } | null;
};

function formatPrice(cents?: number | null): string {
  if (cents == null) return "Custom";
  return `$${(cents / 100).toFixed(0)}`;
}

export default function CreatorsBrowse() {
  useSEO("/creators");
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creators/browse?limit=60", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setCreators(Array.isArray(json?.data) ? json.data : []);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Sparkles className="h-7 w-7 text-primary" />
                  Hire a Creator
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Get a custom promo video, intro, or job-pitch from a vetted creator. 95% of every sale goes to the creator.
                </p>
              </div>
              <Link to="/creators/dashboard">
                <Button>Become a creator</Button>
              </Link>
            </div>

            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />)}
              </div>
            )}

            {error && (
              <Card className="p-6 border-destructive/50">
                <p className="text-sm text-destructive">Couldn't load creators: {error}</p>
              </Card>
            )}

            {!loading && !error && creators.length === 0 && (
              <Card className="p-8 text-center border-dashed">
                <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-base font-medium mb-1">No creators yet</p>
                <p className="text-sm text-muted-foreground mb-4">Be the first. Make videos for paying clients on hired.video.</p>
                <Link to="/creators/dashboard"><Button>Become the first creator</Button></Link>
              </Card>
            )}

            {!loading && !error && creators.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {creators.map((c) => {
                  const name = c.creator.displayName || c.user.name || "Creator";
                  return (
                    <Link key={c.user.id} to={`/creators/${c.user.id}`} className="block">
                      <Card className="p-4 h-full hover:border-primary/40 transition-colors flex flex-col">
                        <div className="flex items-start gap-3 mb-3">
                          {c.profile?.avatarUrl ? (
                            <img src={c.profile.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                          ) : (
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-base font-semibold">
                              {name[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm leading-tight truncate">{name}</h3>
                            {c.creator.tagline && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.creator.tagline}</p>
                            )}
                          </div>
                        </div>

                        {c.creator.categories && c.creator.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {c.creator.categories.slice(0, 3).map((cat) => (
                              <Badge key={cat} variant="secondary" className="text-[10px]">{cat}</Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-2 border-t">
                          <div className="flex items-center gap-2">
                            {c.creator.averageRating != null && c.creator.averageRating > 0 ? (
                              <span className="flex items-center gap-0.5">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {Number(c.creator.averageRating).toFixed(1)}
                              </span>
                            ) : (
                              <span>New</span>
                            )}
                            {c.creator.completedProjectsCount ? <span>· {c.creator.completedProjectsCount} done</span> : null}
                          </div>
                          <span className="font-medium text-foreground">from {formatPrice(c.creator.defaultPriceCents)}</span>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="mt-8 rounded-lg border border-dashed p-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium">Want to earn here?</p>
                <p className="text-xs text-muted-foreground">Set your own rates. Get paid through escrow. Build a portfolio.</p>
              </div>
              <Link to="/creators/dashboard">
                <Button variant="outline">Apply to become a creator <ArrowRight className="h-4 w-4 ml-1" /></Button>
              </Link>
            </div>
          </div>

          <Footer />
        </div>
      </div>
    </div>
  );
}
