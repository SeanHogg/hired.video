// CreatorPublicProfile — /creators/:userId
// Public profile for a creator: header (name + tagline + rating), portfolio
// gallery, and reviews. CTA opens the existing services-inquiry flow so a
// customer can brief them on a paid project.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Star, MessageSquare, Play, ArrowLeft, Share2 } from "lucide-react";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import ShareModal from "@/components/ShareModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSidebar } from "@/hooks/use-sidebar";

type PortfolioItem = {
  id: string;
  title: string;
  description?: string | null;
  mediaType: "video" | "image";
  mediaUrl: string;
  thumbnailUrl?: string | null;
  category?: string | null;
  tags?: string[] | null;
  isFeatured?: boolean | null;
};

type CreatorPublic = {
  creator: {
    userId: string;
    displayName?: string | null;
    tagline?: string | null;
    bio?: string | null;
    averageRating?: number | null;
    completedProjectsCount?: number | null;
    defaultPriceCents?: number | null;
    extraRevisionPriceCents?: number | null;
    averageDeliveryDays?: number | null;
    categories?: string[] | null;
    languages?: string[] | null;
  };
  profile?: { avatarUrl?: string | null; headline?: string | null } | null;
  portfolio: PortfolioItem[];
  reviews: Array<{
    review: { id: string; rating: number; body?: string | null; createdAt: string };
    customer: { id: string; name?: string | null };
  }>;
};

function priceLabel(cents?: number | null): string {
  if (cents == null) return "Custom quote";
  return `From $${(cents / 100).toFixed(0)}`;
}

export default function CreatorPublicProfile() {
  const { userId } = useParams<{ userId: string }>();
  useSEO("/creators");
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const [data, setData] = useState<CreatorPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/creators/public/${userId}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Creator not found" : `HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData(json?.data ?? json);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [userId]);

  const name = data?.creator.displayName ?? "Creator";
  const shareUrl = useMemo(() => (typeof window !== "undefined" ? window.location.href : ""), []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className="pt-16">
          <div className="max-w-5xl mx-auto px-4 py-6">
            <Link to="/creators" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft className="h-4 w-4 mr-1" /> All creators
            </Link>

            {loading && <div className="h-48 rounded-lg bg-muted animate-pulse" />}

            {error && (
              <Card className="p-6 border-destructive/50">
                <p className="text-sm text-destructive">{error}</p>
              </Card>
            )}

            {data && (
              <>
                {/* Header */}
                <Card className="p-6 mb-6">
                  <div className="flex items-start gap-4 flex-wrap">
                    {data.profile?.avatarUrl ? (
                      <img src={data.profile.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-2xl font-semibold">
                        {name[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h1 className="text-2xl font-bold">{name}</h1>
                      {data.creator.tagline && <p className="text-sm text-muted-foreground mt-1">{data.creator.tagline}</p>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
                        {data.creator.averageRating != null && data.creator.averageRating > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {Number(data.creator.averageRating).toFixed(1)} rating
                          </span>
                        )}
                        {data.creator.completedProjectsCount != null && (
                          <span>· {data.creator.completedProjectsCount} project{data.creator.completedProjectsCount === 1 ? "" : "s"} delivered</span>
                        )}
                        {data.creator.averageDeliveryDays != null && (
                          <span>· avg {data.creator.averageDeliveryDays}d delivery</span>
                        )}
                      </div>
                      {data.creator.categories && data.creator.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {data.creator.categories.map((cat) => (
                            <Badge key={cat} variant="secondary" className="text-xs">{cat}</Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <p className="text-xl font-bold">{priceLabel(data.creator.defaultPriceCents)}</p>
                      <Button asChild>
                        <Link to={`/services?creator=${userId}`}>
                          <MessageSquare className="h-4 w-4 mr-1" /> Send a brief
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                        <Share2 className="h-4 w-4 mr-1" /> Share profile
                      </Button>
                    </div>
                  </div>

                  {data.creator.bio && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{data.creator.bio}</p>
                    </div>
                  )}
                </Card>

                {/* Portfolio */}
                <h2 className="text-lg font-semibold mb-3">Portfolio</h2>
                {data.portfolio.length === 0 ? (
                  <Card className="p-6 text-center border-dashed mb-6">
                    <p className="text-sm text-muted-foreground">This creator hasn't posted any work yet.</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    {data.portfolio.map((item) => (
                      <Card key={item.id} className="overflow-hidden">
                        <div className="aspect-video bg-muted relative">
                          {item.mediaType === "video" ? (
                            <>
                              {item.thumbnailUrl ? (
                                <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                              ) : (
                                <video src={item.mediaUrl} className="w-full h-full object-cover" preload="metadata" />
                              )}
                              <a
                                href={item.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                              >
                                <Play className="h-10 w-10 text-white drop-shadow" />
                              </a>
                            </>
                          ) : (
                            <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer">
                              <img src={item.mediaUrl} alt={item.title} className="w-full h-full object-cover" />
                            </a>
                          )}
                          {item.isFeatured && (
                            <Badge className="absolute top-2 left-2 text-[10px]">Featured</Badge>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          {item.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Reviews */}
                {data.reviews.length > 0 && (
                  <>
                    <h2 className="text-lg font-semibold mb-3">Reviews</h2>
                    <div className="space-y-3 mb-6">
                      {data.reviews.map(({ review, customer }) => (
                        <Card key={review.id} className="p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="flex items-center gap-0.5 text-amber-500">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`h-3 w-3 ${i < review.rating ? "fill-amber-400" : "fill-none"}`} />
                              ))}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              · {customer.name ?? "Customer"} · {new Date(review.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {review.body && <p className="text-sm">{review.body}</p>}
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <Footer />
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        shareUrl={shareUrl}
        title={`Share ${name}`}
        message="Refer this creator to anyone who needs a promo video."
        shareText={`${name} on hired.video — book a custom promo video`}
      />
    </div>
  );
}
