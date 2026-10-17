/**
 * #180 — Featured Creators carousel. Reads `/api/featured-creators`,
 * renders the top-N as a horizontal scroll list. Self-gates: returns
 * null when the API returns no creators (e.g. early in the marketplace
 * lifecycle), so home + dashboard hosts can mount it unconditionally
 * per the DRY rule.
 */

import { useEffect, useState } from "react";
import { publicProfilePath } from "@shared/public-paths";
import { Link } from "react-router-dom";
import { Star, Users } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface FeaturedCreator {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  averageRating: number;
  reviewCount: number;
  completedProjectsCount: number;
  totalEarnedCents: number;
  score: number;
}

interface FeaturedCreatorsCarouselProps {
  limit?: number;
  category?: string;
  /** Optional heading override. Defaults to "Featured Creators". */
  heading?: string;
  /** When set, renders a "See all →" link to this route (e.g. the Featured
   *  Creators landing). Omitted on the landing page's own rows. */
  seeAllHref?: string;
}

export default function FeaturedCreatorsCarousel({
  limit = 12,
  category,
  heading,
  seeAllHref,
}: FeaturedCreatorsCarouselProps) {
  const [items, setItems] = useState<FeaturedCreator[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = category
      ? `/api/featured-creators/by-category/${encodeURIComponent(category)}?limit=${limit}`
      : `/api/featured-creators?limit=${limit}`;
    apiClient
      .fetchData<{ items?: FeaturedCreator[] }>(url)
      .then((body) => {
        if (cancelled) return;
        setItems(body?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, category]);

  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{heading ?? "Featured Creators"}</h2>
        {seeAllHref && (
          <Link to={seeAllHref} className="text-sm text-primary hover:underline shrink-0">
            See all
          </Link>
        )}
      </div>
      <div className="-mx-1 overflow-x-auto">
        <div className="flex gap-3 px-1 pb-2">
          {items.map((c) => (
            <Link
              key={c.userId}
              to={publicProfilePath(c.userId)}
              className="flex-shrink-0 w-44 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted"
            >
              <div className="aspect-square rounded-md overflow-hidden bg-muted">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-medium text-muted-foreground">
                    {c.displayName?.slice(0, 1) ?? "?"}
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-1">
                <div className="font-medium truncate">{c.displayName}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    {c.averageRating.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Users className="h-3 w-3" />
                    {c.reviewCount}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
