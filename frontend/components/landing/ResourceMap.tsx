/**
 * ResourceMap — content discovery grid grouped by ContentLocationKind,
 * filtered by a single audience key. Each kind is one bucket; buckets
 * self-hide when they have zero items so empty buckets never render.
 *
 * Single component handles both:
 *   - `audienceKey` mode: shows content tagged with that audience key
 *   - `locationKey` mode (future): shows content tagged with that location
 *
 * Per the DRY rule — same component, two filter axes, the consumer
 * passes which axis is in play.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import {
  fetchAudienceContent,
  type AudienceContentItem,
} from "@/lib/services/audience-content-service";
import type { ContentLocationKind } from "@shared/content-locations";

export interface ResourceMapProps {
  /** Audience key to filter by (e.g. "recent_graduates"). */
  audienceKey: string;
  /** Ordered list of content kinds to surface. Empty buckets self-hide. */
  kinds: ContentLocationKind[];
  /** Per-kind item cap. Default 6. */
  limit?: number;
}

const KIND_LABELS: Partial<Record<ContentLocationKind, string>> = {
  job: "Jobs",
  resume: "Resume templates",
  video: "Video resumes",
  article: "Articles & guides",
  template: "Studio templates",
  learning_path: "Learning paths",
  voice: "Voice marketplace",
  user_profile: "People",
  company: "Companies",
  event: "Events",
  service: "Services",
};

const KIND_SEE_ALL: Partial<Record<ContentLocationKind, (audience: string) => string>> = {
  job: (a) => `/jobs?audience=${encodeURIComponent(a)}`,
  resume: (a) => `/search?category=resumes&audience=${encodeURIComponent(a)}`,
  video: (a) => `/search?category=media&audience=${encodeURIComponent(a)}`,
  article: (a) => `/articles?audience=${encodeURIComponent(a)}`,
  template: (a) => `/search?category=templates&audience=${encodeURIComponent(a)}`,
  learning_path: (a) => `/learn?audience=${encodeURIComponent(a)}`,
  event: (a) => `/events?audience=${encodeURIComponent(a)}`,
};

interface BucketState {
  loading: boolean;
  items: AudienceContentItem[];
}

export function ResourceMap({ audienceKey, kinds, limit = 6 }: ResourceMapProps): JSX.Element {
  const [buckets, setBuckets] = useState<Record<string, BucketState>>(() =>
    Object.fromEntries(kinds.map((k) => [k, { loading: true, items: [] }])),
  );

  useEffect(() => {
    let cancelled = false;
    setBuckets(Object.fromEntries(kinds.map((k) => [k, { loading: true, items: [] }])));
    void Promise.all(
      kinds.map(async (kind) => {
        const items = await fetchAudienceContent(kind, audienceKey, limit);
        if (cancelled) return;
        setBuckets((prev) => ({ ...prev, [kind]: { loading: false, items } }));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [audienceKey, kinds.join(","), limit]);

  const visibleKinds = useMemo(() => {
    return kinds.filter((k) => {
      const b = buckets[k];
      // Show while loading + show when populated; hide when settled-empty.
      return !b || b.loading || b.items.length > 0;
    });
  }, [kinds, buckets]);

  if (visibleKinds.length === 0) {
    // Every bucket settled empty — fall back to a generic "explore" call
    // rather than an empty section. Per the spec ("Resource Map" bucket
    // self-hides), the whole map can also self-hide if nothing matches.
    return (
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center text-muted-foreground">
          <p>Resources for this audience are being curated. In the meantime, explore the full library.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/search">Browse everything</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8 bg-muted/20">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center">
          <h2 className="text-3xl font-bold">Resource map</h2>
          <p className="mt-2 text-muted-foreground">Hand-picked across templates, articles, video, learning paths, and open roles.</p>
        </div>
        {visibleKinds.map((kind) => {
          const bucket = buckets[kind] ?? { loading: true, items: [] };
          const label = KIND_LABELS[kind] ?? kind;
          const seeAllHref = KIND_SEE_ALL[kind]?.(audienceKey);
          return (
            <div key={kind}>
              <div className="mb-4 flex items-end justify-between">
                <h3 className="text-xl font-semibold">{label}</h3>
                {seeAllHref ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link to={seeAllHref}>
                      See all
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bucket.loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))
                  : bucket.items.map((item) => (
                      <ResourceCard key={item.id} item={item} />
                    ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ResourceCard({ item }: { item: AudienceContentItem }): JSX.Element {
  const href = item.href ?? hrefForItem(item);
  return (
    <Link to={href} className="block">
      <Card className="h-full hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <p className="font-medium line-clamp-2">{item.title}</p>
          {item.summary || item.description ? (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
              {item.summary ?? item.description}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function hrefForItem(item: AudienceContentItem): string {
  switch (item.type) {
    case "job":
      return `/jobs/${item.id}`;
    case "resume":
      return `/resumes/${item.id}`;
    case "template":
      return `/templates/${item.id}`;
    case "article":
      return `/articles/${item.id}`;
    case "media":
    case "video":
      return `/v/${item.id}`;
    case "event":
      return `/events/${item.id}`;
    default:
      return "/search";
  }
}
